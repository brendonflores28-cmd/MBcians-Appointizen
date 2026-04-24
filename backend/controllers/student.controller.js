const {
  query,
  queryOne,
  withTransaction,
} = require('../db');
const { randomBytes } = require('crypto');
const AppError = require('../utils/AppError');
const {
  APPOINTMENT_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  ROLES,
  SOCKET_EVENTS,
} = require('../utils/constants');
const {
  normalizeBoolean,
  normalizeDate,
  normalizeInteger,
  normalizeOptionalString,
  normalizeRequiredString,
  sanitizeText,
  assert,
  getRequestMeta,
} = require('../utils/validation');
const { serializeSettings } = require('../utils/serializers');
const { writeActivityLog } = require('../utils/audit');
const { fileToDataUrl } = require('../utils/paymentProof');
const { getCurrentDateStamp, getCurrentDateString } = require('../utils/runtime');
const {
  getActiveDocuments,
  getActiveTimeSlots,
  getAppointments,
  getAppointmentById,
  getBlockedDates,
  getDateSlotLoad,
  isDateBlocked,
  calculateAppointmentAmount,
} = require('../services/appointment.service');
const { emitToRecipients, notifyRoles } = require('../services/notification.service');

function generateReferenceNo() {
  return `APT-${getCurrentDateStamp()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

async function getDashboard(req, res) {
  const [statsRow, appointments, documents, timeSlots, blockedDates, settingsRow] = await Promise.all([
    queryOne(
      `
        SELECT
          COUNT(*) AS total_appointments,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_appointments,
          SUM(CASE WHEN status IN ('approved', 'assigned', 'processing') THEN 1 ELSE 0 END) AS in_progress_appointments,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_appointments,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_appointments
        FROM appointments
        WHERE student_id = ?
      `,
      [req.user.id]
    ),
    getAppointments({
      whereClause: 'a.student_id = ?',
      params: [req.user.id],
      orderBy: 'a.created_at DESC',
    }),
    getActiveDocuments(),
    getActiveTimeSlots(),
    getBlockedDates(),
    queryOne('SELECT * FROM settings WHERE id = 1'),
  ]);

  const sanitizedAppointments = appointments.map((appointment) =>
    appointment.payment
      ? {
          ...appointment,
          payment: {
            ...appointment.payment,
            proofImage: null,
          },
        }
      : appointment
  );

  res.json({
    stats: {
      totalAppointments: Number(statsRow?.total_appointments || 0),
      pendingAppointments: Number(statsRow?.pending_appointments || 0),
      activeAppointments: Number(statsRow?.in_progress_appointments || 0),
      inProgressAppointments: Number(statsRow?.in_progress_appointments || 0),
      completedAppointments: Number(statsRow?.completed_appointments || 0),
      cancelledAppointments: Number(statsRow?.cancelled_appointments || 0),
    },
    appointments: sanitizedAppointments,
    documents,
    timeSlots,
    blockedDates,
    settings: settingsRow ? serializeSettings(settingsRow) : null,
  });
}

async function getAvailability(req, res) {
  const appointmentDate = normalizeDate(req.query.date, 'Appointment date');
  assert(appointmentDate >= getCurrentDateString(), 'You can only book appointments for today or later.');

  const [blockedDate, timeSlots, slotLoad] = await Promise.all([
    isDateBlocked(appointmentDate),
    getActiveTimeSlots(),
    getDateSlotLoad(appointmentDate),
  ]);

  res.json({
    blocked: Boolean(blockedDate),
    reason: blockedDate?.reason || null,
    slots: timeSlots.map((slot) => {
      const used = slotLoad[slot.id] || 0;
      const remaining = Math.max(slot.maxAppointments - used, 0);

      return {
        ...slot,
        used,
        remaining,
        disabled: Boolean(blockedDate) || remaining <= 0,
      };
    }),
  });
}

async function createAppointment(req, res) {
  const documentTypeId = normalizeInteger(req.body.documentTypeId, 'Document type', { min: 1 });
  const copies = normalizeInteger(req.body.copies || 1, 'Copies', { min: 1, max: 20 });
  const isRush = normalizeBoolean(req.body.isRush);
  const appointmentDate = normalizeDate(req.body.appointmentDate, 'Appointment date');
  const timeSlotId = normalizeInteger(req.body.timeSlotId, 'Time slot', { min: 1 });
  const purpose = normalizeRequiredString(req.body.purpose, 'Purpose', { minLength: 4, maxLength: 255 });
  const paymentMethod = sanitizeText(req.body.paymentMethod).toLowerCase();
  const referenceNumber = normalizeOptionalString(req.body.referenceNumber, 100);
  const remarks = normalizeOptionalString(req.body.remarks, 500);
  const meta = getRequestMeta(req);

  assert(
    Object.values(PAYMENT_METHODS).includes(paymentMethod),
    'Payment method must be either gcash or cash.'
  );
  assert(appointmentDate >= getCurrentDateString(), 'You can only book appointments for today or later.');

  if (paymentMethod === PAYMENT_METHODS.GCASH) {
    assert(referenceNumber, 'Enter the GCash reference number before submitting the booking.');
    assert(req.file, 'Upload the screenshot proof of payment before submitting the booking.');
  }

  const blockedDate = await isDateBlocked(appointmentDate);
  assert(!blockedDate, blockedDate?.reason || 'Selected date is blocked.');

  const [documentRows, timeSlotRow, settingsRow] = await Promise.all([
    getActiveDocuments(),
    queryOne('SELECT id, max_appointments FROM time_slots WHERE id = ? AND is_active = 1', [timeSlotId]),
    queryOne('SELECT gcash_enabled, cash_enabled FROM settings WHERE id = 1'),
  ]);

  const document = documentRows.find((item) => item.id === documentTypeId);
  assert(document, 'Selected document type is not available.');
  assert(timeSlotRow, 'Selected time slot is not available.');
  assert(settingsRow, 'System settings are incomplete. Please contact the administrator.');
  assert(
    (paymentMethod === PAYMENT_METHODS.GCASH && Boolean(settingsRow.gcash_enabled)) ||
      (paymentMethod === PAYMENT_METHODS.CASH && Boolean(settingsRow.cash_enabled)),
    `The selected ${paymentMethod} payment option is currently unavailable.`
  );

  const slotLoad = await getDateSlotLoad(appointmentDate);
  const usedSlots = slotLoad[timeSlotId] || 0;
  assert(usedSlots < Number(timeSlotRow.max_appointments), 'That time slot is already full.');

  const amount = calculateAppointmentAmount(document, copies, isRush);
  const initialPaymentStatus =
    paymentMethod === PAYMENT_METHODS.GCASH ? PAYMENT_STATUSES.FOR_VERIFICATION : PAYMENT_STATUSES.PENDING;
  const initialAppointmentPaymentStatus =
    paymentMethod === PAYMENT_METHODS.GCASH ? PAYMENT_STATUSES.FOR_VERIFICATION : 'unpaid';
  const proofImage = req.file ? fileToDataUrl(req.file) : null;

  const appointment = await withTransaction(async (connection) => {
    const referenceNo = generateReferenceNo();
    const [[lockedTimeSlot]] = await connection.execute(
      'SELECT id, max_appointments FROM time_slots WHERE id = ? AND is_active = 1 FOR UPDATE',
      [timeSlotId]
    );
    const [[blockedDateRow]] = await connection.execute(
      'SELECT id, reason FROM blocked_dates WHERE blocked_date = ? FOR UPDATE',
      [appointmentDate]
    );
    const [[slotUsage]] = await connection.execute(
      `
        SELECT COUNT(*) AS used_slots
        FROM appointments
        WHERE appointment_date = ?
          AND time_slot_id = ?
          AND status IN (?, ?, ?, ?, ?)
        FOR UPDATE
      `,
      [
        appointmentDate,
        timeSlotId,
        APPOINTMENT_STATUSES.PENDING,
        APPOINTMENT_STATUSES.APPROVED,
        APPOINTMENT_STATUSES.ASSIGNED,
        APPOINTMENT_STATUSES.PROCESSING,
        APPOINTMENT_STATUSES.COMPLETED,
      ]
    );

    assert(lockedTimeSlot, 'Selected time slot is not available.');
    assert(!blockedDateRow, blockedDateRow?.reason || 'Selected date is blocked.');
    assert(
      Number(slotUsage?.used_slots || 0) < Number(lockedTimeSlot.max_appointments),
      'That time slot is already full.'
    );

    const [appointmentResult] = await connection.execute(
      `
        INSERT INTO appointments (
          reference_no,
          student_id,
          document_type_id,
          time_slot_id,
          appointment_date,
          copies,
          is_rush,
          purpose,
          remarks,
          status,
          payment_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        referenceNo,
        req.user.id,
        documentTypeId,
        timeSlotId,
        appointmentDate,
        copies,
        isRush ? 1 : 0,
        purpose,
        remarks,
        APPOINTMENT_STATUSES.PENDING,
        initialAppointmentPaymentStatus,
      ]
    );

    const appointmentId = appointmentResult.insertId;

    const [paymentResult] = await connection.execute(
      `
        INSERT INTO payments (
          appointment_id,
          amount,
          method,
          proof_image,
          reference_number,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [appointmentId, amount, paymentMethod, proofImage, referenceNumber, initialPaymentStatus]
    );

    await connection.execute(
      `
        INSERT INTO payment_history (
          payment_id,
          from_status,
          to_status,
          note,
          actor_id
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        paymentResult.insertId,
        'created',
        initialPaymentStatus,
        paymentMethod === PAYMENT_METHODS.GCASH
          ? 'Payment record created with uploaded GCash proof.'
          : 'Payment record created with the appointment.',
        req.user.id,
      ]
    );

    await writeActivityLog(
      {
        userId: req.user.id,
        action: 'APPOINTMENT_CREATED',
        entityType: 'appointment',
        entityId: appointmentId,
        description: `Created appointment ${referenceNo}.`,
        metadata: {
          referenceNo,
          documentTypeId,
          appointmentDate,
          timeSlotId,
          copies,
          isRush,
          paymentMethod,
          referenceNumber,
        },
        ...meta,
      },
      connection
    );

    await notifyRoles(
      {
        title: 'New appointment request',
        message: `${req.user.fullName} submitted ${document.name}.`,
        type: 'info',
        referenceType: 'appointment',
        referenceId: appointmentId,
      },
      [ROLES.ADMIN, ROLES.HEAD],
      connection
    );

    if (paymentMethod === PAYMENT_METHODS.GCASH) {
      await notifyRoles(
        {
          title: 'Payment proof submitted during booking',
          message: `${req.user.fullName} uploaded GCash proof for ${referenceNo}.`,
          type: 'info',
          referenceType: 'payment',
          referenceId: paymentResult.insertId,
        },
        [ROLES.CASHIER, ROLES.ADMIN, ROLES.HEAD],
        connection
      );
    }

    return getAppointmentById(appointmentId, connection);
  });

  emitToRecipients(
    SOCKET_EVENTS.APPOINTMENTS_CHANGED,
    { appointmentId: appointment.id, referenceNo: appointment.referenceNo, action: 'created' },
    { roles: [ROLES.ADMIN, ROLES.HEAD], userIds: [req.user.id] }
  );

  emitToRecipients(
    SOCKET_EVENTS.PAYMENTS_CHANGED,
    {
      appointmentId: appointment.id,
      paymentId: appointment.payment?.id || null,
      action: paymentMethod === PAYMENT_METHODS.GCASH ? 'submitted-with-booking' : 'created',
    },
    { roles: [ROLES.CASHIER, ROLES.ADMIN, ROLES.HEAD], userIds: [req.user.id] }
  );

  res.status(201).json({
    message: 'Appointment submitted successfully.',
    appointment,
  });
}

async function submitPayment(req, res) {
  const appointmentId = normalizeInteger(req.params.id, 'Appointment', { min: 1 });
  const method = sanitizeText(req.body.method).toLowerCase();
  const referenceNumber = normalizeOptionalString(req.body.referenceNumber, 100);
  const meta = getRequestMeta(req);
  const settingsRow = await queryOne('SELECT gcash_enabled, cash_enabled FROM settings WHERE id = 1');

  assert(Object.values(PAYMENT_METHODS).includes(method), 'Invalid payment method.');
  assert(settingsRow, 'System settings are incomplete. Please contact the administrator.');
  assert(
    (method === PAYMENT_METHODS.GCASH && Boolean(settingsRow.gcash_enabled)) ||
      (method === PAYMENT_METHODS.CASH && Boolean(settingsRow.cash_enabled)),
    `The selected ${method} payment option is currently unavailable.`
  );

  const appointment = await getAppointmentById(appointmentId);
  assert(appointment && appointment.studentId === req.user.id, 'Appointment not found.', 404);
  assert(
    [APPOINTMENT_STATUSES.APPROVED, APPOINTMENT_STATUSES.ASSIGNED, APPOINTMENT_STATUSES.PROCESSING].includes(
      appointment.status
    ),
    'Payment can only be submitted after the appointment is approved.'
  );
  assert(appointment.paymentStatus !== PAYMENT_STATUSES.PAID, 'Payment has already been verified.');

  if (method === PAYMENT_METHODS.GCASH) {
    assert(referenceNumber, 'Enter the GCash reference number before submitting.');
    assert(req.file, 'Please upload a payment proof image for GCash submissions.');
  }

  const nextPaymentStatus = method === PAYMENT_METHODS.GCASH ? PAYMENT_STATUSES.FOR_VERIFICATION : PAYMENT_STATUSES.PENDING;
  const nextAppointmentPaymentStatus =
    method === PAYMENT_METHODS.GCASH ? PAYMENT_STATUSES.FOR_VERIFICATION : 'unpaid';
  const proofImage = method === PAYMENT_METHODS.GCASH && req.file ? fileToDataUrl(req.file) : null;
  const normalizedReferenceNumber = method === PAYMENT_METHODS.GCASH ? referenceNumber : null;

  const updatedAppointment = await withTransaction(async (connection) => {
    await connection.execute(
      `
        UPDATE payments
        SET method = ?, proof_image = ?, reference_number = ?, status = ?, rejection_reason = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE appointment_id = ?
      `,
      [method, proofImage, normalizedReferenceNumber, nextPaymentStatus, appointmentId]
    );

    await connection.execute(
      `
        UPDATE appointments
        SET payment_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [nextAppointmentPaymentStatus, appointmentId]
    );

    if (appointment.payment?.id) {
      await connection.execute(
        `
          INSERT INTO payment_history (
            payment_id,
            from_status,
            to_status,
            note,
            actor_id
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          appointment.payment.id,
          appointment.payment.status,
          nextPaymentStatus,
          method === PAYMENT_METHODS.GCASH
            ? 'Student uploaded GCash proof for verification.'
            : 'Student selected cash payment.',
          req.user.id,
        ]
      );
    }

    await writeActivityLog(
      {
        userId: req.user.id,
        action: 'PAYMENT_SUBMITTED',
        entityType: 'payment',
        entityId: appointment.payment?.id || null,
        description: `Submitted ${method} payment for appointment ${appointment.referenceNo}.`,
        metadata: { appointmentId, method, referenceNumber },
        ...meta,
      },
      connection
    );

    if (method === PAYMENT_METHODS.GCASH) {
      await notifyRoles(
        {
          title: 'Payment proof submitted',
          message: `${req.user.fullName} uploaded GCash proof for ${appointment.referenceNo}.`,
          type: 'info',
          referenceType: 'payment',
          referenceId: appointment.payment?.id || null,
        },
        [ROLES.CASHIER, ROLES.HEAD, ROLES.ADMIN],
        connection
      );
    }

    return getAppointmentById(appointmentId, connection);
  });

  emitToRecipients(
    SOCKET_EVENTS.PAYMENTS_CHANGED,
    { appointmentId, paymentId: appointment.payment?.id || null, action: 'submitted' },
    {
      roles: [ROLES.CASHIER, ROLES.HEAD, ROLES.ADMIN],
      userIds: [req.user.id, updatedAppointment.assignedStaffId].filter(Boolean),
    }
  );

  res.json({
    message: method === PAYMENT_METHODS.GCASH ? 'Payment proof uploaded successfully.' : 'Cash payment was noted.',
    appointment: updatedAppointment,
  });
}

async function cancelAppointment(req, res) {
  const appointmentId = normalizeInteger(req.params.id, 'Appointment', { min: 1 });
  const meta = getRequestMeta(req);
  const appointment = await getAppointmentById(appointmentId);

  assert(appointment && appointment.studentId === req.user.id, 'Appointment not found.', 404);
  assert(
    ![
      APPOINTMENT_STATUSES.COMPLETED,
      APPOINTMENT_STATUSES.REJECTED,
      APPOINTMENT_STATUSES.CANCELLED,
    ].includes(appointment.status),
    'This appointment can no longer be cancelled.'
  );

  const updatedAppointment = await withTransaction(async (connection) => {
    await connection.execute(
      `
        UPDATE appointments
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [APPOINTMENT_STATUSES.CANCELLED, appointmentId]
    );

    await writeActivityLog(
      {
        userId: req.user.id,
        action: 'APPOINTMENT_CANCELLED',
        entityType: 'appointment',
        entityId: appointmentId,
        description: `Student cancelled appointment ${appointment.referenceNo}.`,
        metadata: {
          appointmentId,
          previousStatus: appointment.status,
        },
        ...meta,
      },
      connection
    );

    await notifyRoles(
      {
        title: 'Appointment cancelled',
        message: `${req.user.fullName} cancelled ${appointment.referenceNo}.`,
        type: 'warning',
        referenceType: 'appointment',
        referenceId: appointmentId,
      },
      [ROLES.ADMIN, ROLES.HEAD, ROLES.STAFF, ROLES.CASHIER],
      connection
    );

    return getAppointmentById(appointmentId, connection);
  });

  emitToRecipients(
    SOCKET_EVENTS.APPOINTMENTS_CHANGED,
    { appointmentId, action: 'cancelled', status: APPOINTMENT_STATUSES.CANCELLED },
    { roles: [ROLES.ADMIN, ROLES.HEAD, ROLES.STAFF, ROLES.CASHIER], userIds: [req.user.id] }
  );

  emitToRecipients(
    SOCKET_EVENTS.PAYMENTS_CHANGED,
    { appointmentId, paymentId: appointment.payment?.id || null, action: 'appointment-cancelled' },
    { roles: [ROLES.ADMIN, ROLES.HEAD, ROLES.STAFF, ROLES.CASHIER], userIds: [req.user.id] }
  );

  res.json({
    message: 'Appointment cancelled successfully.',
    appointment: updatedAppointment,
  });
}

module.exports = {
  getDashboard,
  getAvailability,
  createAppointment,
  submitPayment,
  cancelAppointment,
};
