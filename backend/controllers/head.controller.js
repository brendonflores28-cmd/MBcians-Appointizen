const { query, queryOne, withTransaction } = require('../db');
const AppError = require('../utils/AppError');
const { writeActivityLog } = require('../utils/audit');
const {
  APPOINTMENT_STATUSES,
  ROLES,
  SOCKET_EVENTS,
  PAYMENT_STATUSES,
} = require('../utils/constants');
const {
  normalizeInteger,
  normalizeOptionalString,
  normalizeRequiredString,
  getRequestMeta,
  assert,
} = require('../utils/validation');
const { getAppointments, getAppointmentById } = require('../services/appointment.service');
const { emitToRecipients, notifyUser } = require('../services/notification.service');

async function getDashboard(req, res) {
  const [statsRow, appointments, staffMembers] = await Promise.all([
    queryOne(
      `
        SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_requests,
          SUM(CASE WHEN status IN ('approved', 'assigned') THEN 1 ELSE 0 END) AS approved_requests,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_requests,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_requests,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_requests
        FROM appointments
      `
    ),
    getAppointments({
      orderBy: 'a.created_at DESC',
    }),
    query(
      `
        SELECT id, firstname, lastname, email
        FROM users
        WHERE role = 'registrar_staff' AND account_status = 'active'
        ORDER BY lastname ASC, firstname ASC
      `
    ),
  ]);

  res.json({
    stats: {
      pendingRequests: Number(statsRow?.pending_requests || 0),
      approvedRequests: Number(statsRow?.approved_requests || 0),
      processingRequests: Number(statsRow?.processing_requests || 0),
      completedRequests: Number(statsRow?.completed_requests || 0),
      cancelledRequests: Number(statsRow?.cancelled_requests || 0),
    },
    appointments,
    staffMembers: staffMembers.map((staff) => ({
      id: staff.id,
      fullName: `${staff.firstname} ${staff.lastname}`.trim(),
      email: staff.email,
    })),
  });
}

async function approveAppointment(req, res) {
  const appointmentId = normalizeInteger(req.params.id, 'Appointment', { min: 1 });
  const remarks = normalizeOptionalString(req.body.remarks, 500);
  const meta = getRequestMeta(req);
  const appointment = await getAppointmentById(appointmentId);

  assert(appointment, 'Appointment not found.', 404);
  assert(appointment.status === APPOINTMENT_STATUSES.PENDING, 'Only pending appointments can be approved.');

  const updatedAppointment = await withTransaction(async (connection) => {
    await connection.execute(
      `
        UPDATE appointments
        SET status = ?, approved_by = ?, remarks = ?, rejection_reason = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [APPOINTMENT_STATUSES.APPROVED, req.user.id, remarks, appointmentId]
    );

    await writeActivityLog(
      {
        userId: req.user.id,
        action: 'APPOINTMENT_APPROVED',
        entityType: 'appointment',
        entityId: appointmentId,
        description: `Approved appointment ${appointment.referenceNo}.`,
        metadata: { remarks },
        ...meta,
      },
      connection
    );

    await notifyUser(
      {
        title: 'Appointment approved',
        message: `${appointment.referenceNo} is approved and ready for payment.`,
        type: 'success',
        referenceType: 'appointment',
        referenceId: appointmentId,
      },
      appointment.studentId,
      connection
    );

    return getAppointmentById(appointmentId, connection);
  });

  emitToRecipients(
    SOCKET_EVENTS.APPOINTMENTS_CHANGED,
    { appointmentId, action: 'approved' },
    { roles: [ROLES.HEAD, ROLES.ADMIN, ROLES.STAFF], userIds: [appointment.studentId] }
  );

  res.json({
    message: 'Appointment approved successfully.',
    appointment: updatedAppointment,
  });
}

async function rejectAppointment(req, res) {
  const appointmentId = normalizeInteger(req.params.id, 'Appointment', { min: 1 });
  const rejectionReason = normalizeRequiredString(req.body.rejectionReason, 'Rejection reason', {
    minLength: 4,
    maxLength: 500,
  });
  const meta = getRequestMeta(req);
  const appointment = await getAppointmentById(appointmentId);

  assert(appointment, 'Appointment not found.', 404);
  assert(
    [APPOINTMENT_STATUSES.PENDING, APPOINTMENT_STATUSES.APPROVED, APPOINTMENT_STATUSES.ASSIGNED].includes(
      appointment.status
    ),
    'This appointment can no longer be rejected.'
  );
  const nextAppointmentPaymentStatus =
    appointment.payment?.status === PAYMENT_STATUSES.PAID || appointment.paymentStatus === PAYMENT_STATUSES.PAID
      ? PAYMENT_STATUSES.PAID
      : PAYMENT_STATUSES.REJECTED;

  const updatedAppointment = await withTransaction(async (connection) => {
    await connection.execute(
      `
        UPDATE appointments
        SET
          status = ?,
          rejection_reason = ?,
          assigned_staff_id = NULL,
          payment_status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [APPOINTMENT_STATUSES.REJECTED, rejectionReason, nextAppointmentPaymentStatus, appointmentId]
    );

    if (appointment.payment?.id && appointment.payment.status !== PAYMENT_STATUSES.PAID) {
      await connection.execute(
        `
          UPDATE payments
          SET status = ?, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [PAYMENT_STATUSES.REJECTED, rejectionReason, appointment.payment.id]
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
        [appointment.payment.id, appointment.payment.status, PAYMENT_STATUSES.REJECTED, rejectionReason, req.user.id]
      );
    }

    await writeActivityLog(
      {
        userId: req.user.id,
        action: 'APPOINTMENT_REJECTED',
        entityType: 'appointment',
        entityId: appointmentId,
        description: `Rejected appointment ${appointment.referenceNo}.`,
        metadata: { rejectionReason },
        ...meta,
      },
      connection
    );

    await notifyUser(
      {
        title: 'Appointment rejected',
        message: `${appointment.referenceNo} was rejected: ${rejectionReason}`,
        type: 'error',
        referenceType: 'appointment',
        referenceId: appointmentId,
      },
      appointment.studentId,
      connection
    );

    return getAppointmentById(appointmentId, connection);
  });

  emitToRecipients(
    SOCKET_EVENTS.APPOINTMENTS_CHANGED,
    { appointmentId, action: 'rejected' },
    { roles: [ROLES.HEAD, ROLES.ADMIN, ROLES.STAFF], userIds: [appointment.studentId] }
  );
  emitToRecipients(
    SOCKET_EVENTS.PAYMENTS_CHANGED,
    { appointmentId, paymentId: appointment.payment?.id || null, action: 'rejected' },
    { roles: [ROLES.CASHIER, ROLES.HEAD, ROLES.STAFF, ROLES.ADMIN], userIds: [appointment.studentId] }
  );

  res.json({
    message: 'Appointment rejected successfully.',
    appointment: updatedAppointment,
  });
}

async function assignStaff(req, res) {
  const appointmentId = normalizeInteger(req.params.id, 'Appointment', { min: 1 });
  const staffId = normalizeInteger(req.body.staffId, 'Staff', { min: 1 });
  const remarks = normalizeOptionalString(req.body.remarks, 500);
  const meta = getRequestMeta(req);
  const [appointment, staffMember] = await Promise.all([
    getAppointmentById(appointmentId),
    queryOne(
      `
        SELECT id, firstname, lastname
        FROM users
        WHERE id = ? AND role = 'registrar_staff' AND account_status = 'active'
      `,
      [staffId]
    ),
  ]);

  assert(appointment, 'Appointment not found.', 404);
  assert(staffMember, 'Selected staff member is unavailable.');
  assert(
    [APPOINTMENT_STATUSES.APPROVED, APPOINTMENT_STATUSES.ASSIGNED, APPOINTMENT_STATUSES.PROCESSING].includes(
      appointment.status
    ),
    'Only approved or assigned appointments can be distributed.'
  );

  const updatedAppointment = await withTransaction(async (connection) => {
    await connection.execute(
      `
        UPDATE appointments
        SET assigned_staff_id = ?, remarks = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [staffId, remarks, APPOINTMENT_STATUSES.ASSIGNED, appointmentId]
    );

    await writeActivityLog(
      {
        userId: req.user.id,
        action: 'APPOINTMENT_ASSIGNED',
        entityType: 'appointment',
        entityId: appointmentId,
        description: `Assigned appointment ${appointment.referenceNo} to staff ${staffId}.`,
        metadata: { staffId, remarks },
        ...meta,
      },
      connection
    );

    await notifyUser(
      {
        title: 'Appointment assigned',
        message: `${appointment.referenceNo} is now assigned to the registrar staff queue.`,
        type: 'info',
        referenceType: 'appointment',
        referenceId: appointmentId,
      },
      appointment.studentId,
      connection
    );

    await notifyUser(
      {
        title: 'New assigned request',
        message: `${appointment.referenceNo} was assigned to you.`,
        type: 'info',
        referenceType: 'appointment',
        referenceId: appointmentId,
      },
      staffId,
      connection
    );

    return getAppointmentById(appointmentId, connection);
  });

  emitToRecipients(
    SOCKET_EVENTS.APPOINTMENTS_CHANGED,
    { appointmentId, action: 'assigned', staffId },
    { roles: [ROLES.HEAD, ROLES.ADMIN, ROLES.STAFF], userIds: [appointment.studentId, staffId] }
  );

  res.json({
    message: 'Staff assigned successfully.',
    appointment: updatedAppointment,
  });
}

async function searchAppointments(req, res) {
  const searchQuery = normalizeOptionalString(req.query.q, 255);
  const studentId = normalizeOptionalString(req.query.studentId, 100);
  const status = normalizeOptionalString(req.query.status, 50);
  const dateFrom = normalizeOptionalString(req.query.dateFrom, 50);
  const dateTo = normalizeOptionalString(req.query.dateTo, 50);

  // Build dynamic WHERE clause
  const conditions = ['1 = 1'];
  const params = [];

  if (searchQuery) {
    conditions.push(
      `(
        student.firstname LIKE ? OR
        student.lastname LIKE ? OR
        student.email LIKE ? OR
        student.student_id LIKE ? OR
        a.reference_no LIKE ?
      )`
    );
    const searchPattern = `%${searchQuery}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
  }

  if (studentId) {
    conditions.push('(student.student_id LIKE ? OR student.email LIKE ?)');
    const idPattern = `%${studentId}%`;
    params.push(idPattern, idPattern);
  }

  if (status) {
    conditions.push('a.status = ?');
    params.push(status);
  }

  if (dateFrom) {
    conditions.push('a.appointment_date >= ?');
    params.push(dateFrom);
  }

  if (dateTo) {
    conditions.push('a.appointment_date <= ?');
    params.push(dateTo);
  }

  const whereClause = conditions.join(' AND ');

  const appointments = await getAppointments({
    whereClause: `${whereClause}`,
    params,
    orderBy: 'a.created_at DESC',
  });

  res.json({
    count: appointments.length,
    appointments,
  });
}

module.exports = {
  getDashboard,
  approveAppointment,
  rejectAppointment,
  assignStaff,
  searchAppointments,
};
