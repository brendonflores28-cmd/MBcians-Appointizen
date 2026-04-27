const { query, queryOne, withTransaction } = require("../db");
const {
  SOCKET_EVENTS,
  ROLES,
  APPOINTMENT_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
} = require("../utils/constants");
const {
  emitToRecipients,
  notifyUser,
} = require("../services/notification.service");
const { invalidateMaintenanceCache } = require("../middlewares/maintenance.middleware");
const { writeActivityLog } = require("../utils/audit");
const AppError = require("../utils/AppError");
const {
  normalizeBoolean,
  normalizeDate,
  normalizeDecimal,
  normalizeEmail,
  normalizeInteger,
  normalizeOptionalString,
  normalizePhone,
  normalizeRequiredString,
  normalizeTime,
  sanitizeText,
  getRequestMeta,
  assert,
} = require("../utils/validation");
const { serializeSettings, serializeUser } = require("../utils/serializers");
const { getCurrentDateString } = require("../utils/runtime");
const {
  getAppointments,
  getAppointmentById,
} = require("../services/appointment.service");

async function getDashboard(req, res) {
  const [
    statsRow,
    documentTypes,
    timeSlots,
    blockedDates,
    users,
    settingsRow,
    recentLogs,
    appointments,
  ] = await Promise.all([
    queryOne(
      `
        SELECT
          (SELECT COUNT(*) FROM users WHERE account_status = 'active') AS active_users,
          (SELECT COUNT(*) FROM appointments) AS total_appointments,
          (SELECT COUNT(*) FROM appointments WHERE status = 'pending') AS pending_appointments,
          (SELECT COUNT(*) FROM appointments WHERE status = 'cancelled') AS cancelled_appointments,
          (
            SELECT COUNT(*)
            FROM payments p
            INNER JOIN appointments a ON a.id = p.appointment_id
            WHERE p.status = 'for_verification' AND a.status <> 'cancelled'
          ) AS pending_payments
      `,
    ),
    query("SELECT * FROM document_types ORDER BY created_at DESC"),
    query("SELECT * FROM time_slots ORDER BY start_time ASC"),
    query("SELECT * FROM blocked_dates ORDER BY blocked_date ASC"),
    query(
      `
        SELECT id, firstname, lastname, email, phone, student_id, role, account_status, created_at
        FROM users
        ORDER BY created_at DESC
      `,
    ),
    queryOne("SELECT * FROM settings WHERE id = 1"),
    query(
      `
        SELECT al.id, al.action, al.entity_type, al.entity_id, al.description, al.created_at,
               u.firstname, u.lastname, u.email,
               JSON_UNQUOTE(JSON_EXTRACT(al.metadata, '$.email')) AS audit_email
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.created_at DESC
        LIMIT 10
      `,
    ),
    getAppointments(),
  ]);

  res.json({
    stats: {
      activeUsers: Number(statsRow?.active_users || 0),
      totalAppointments: Number(statsRow?.total_appointments || 0),
      pendingAppointments: Number(statsRow?.pending_appointments || 0),
      cancelledAppointments: Number(statsRow?.cancelled_appointments || 0),
      pendingPayments: Number(statsRow?.pending_payments || 0),
    },
    documentTypes: documentTypes.map((document) => ({
      id: document.id,
      name: document.name,
      description: document.description,
      baseFee: Number(document.base_fee),
      copyFee: Number(document.copy_fee),
      rushFee: Number(document.rush_fee),
      processingDays: document.processing_days,
      isActive: Boolean(document.is_active),
    })),
    timeSlots: timeSlots.map((slot) => ({
      id: slot.id,
      startTime: slot.start_time,
      endTime: slot.end_time,
      maxAppointments: slot.max_appointments,
      isActive: Boolean(slot.is_active),
    })),
    blockedDates: blockedDates.map((item) => ({
      id: item.id,
      blockedDate: item.blocked_date,
      reason: item.reason,
    })),
    users: users.map(serializeUser),
    settings: settingsRow ? serializeSettings(settingsRow) : null,
    appointments: appointments,
    recentLogs: recentLogs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entity_type,
      entityId: log.entity_id,
      description: log.description,
      created_at: log.created_at,
      userName:
        log.firstname && log.lastname
          ? `${log.firstname} ${log.lastname}`
          : null,
      userEmail: log.email || log.audit_email || null,
    })),
  });
}

async function createDocumentType(req, res) {
  const name = normalizeRequiredString(req.body.name, "Document name", {
    minLength: 4,
    maxLength: 150,
  });
  const description = normalizeOptionalString(req.body.description, 255);
  const baseFee = normalizeDecimal(req.body.baseFee, "Base fee", { min: 0 });
  const copyFee = normalizeDecimal(req.body.copyFee, "Copy fee", { min: 0 });
  const rushFee = normalizeDecimal(req.body.rushFee, "Rush fee", { min: 0 });
  const processingDays = normalizeInteger(
    req.body.processingDays,
    "Processing days",
    { min: 1, max: 60 },
  );

  await query(
    `
      INSERT INTO document_types (name, description, base_fee, copy_fee, rush_fee, processing_days, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `,
    [name, description, baseFee, copyFee, rushFee, processingDays],
  );

  emitToRecipients(
    SOCKET_EVENTS.CATALOG_CHANGED,
    { area: "document_types", action: "created" },
    { roles: [ROLES.ADMIN, ROLES.HEAD, ROLES.STUDENT] },
  );

  res.status(201).json({ message: "Document type added successfully." });
}

async function updateDocumentType(req, res) {
  const documentId = normalizeInteger(req.params.id, "Document type", {
    min: 1,
  });
  const name = normalizeRequiredString(req.body.name, "Document name", {
    minLength: 4,
    maxLength: 150,
  });
  const description = normalizeOptionalString(req.body.description, 255);
  const baseFee = normalizeDecimal(req.body.baseFee, "Base fee", { min: 0 });
  const copyFee = normalizeDecimal(req.body.copyFee, "Copy fee", { min: 0 });
  const rushFee = normalizeDecimal(req.body.rushFee, "Rush fee", { min: 0 });
  const processingDays = normalizeInteger(
    req.body.processingDays,
    "Processing days",
    { min: 1, max: 60 },
  );
  const isActive = normalizeBoolean(req.body.isActive);

  await query(
    `
      UPDATE document_types
      SET name = ?, description = ?, base_fee = ?, copy_fee = ?, rush_fee = ?, processing_days = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      name,
      description,
      baseFee,
      copyFee,
      rushFee,
      processingDays,
      isActive ? 1 : 0,
      documentId,
    ],
  );

  emitToRecipients(
    SOCKET_EVENTS.CATALOG_CHANGED,
    { area: "document_types", action: "updated", id: documentId },
    { roles: [ROLES.ADMIN, ROLES.HEAD, ROLES.STUDENT] },
  );

  res.json({ message: "Document type updated successfully." });
}

async function deleteDocumentType(req, res) {
  const documentId = normalizeInteger(req.params.id, "Document type", {
    min: 1,
  });
  const usage = await queryOne(
    "SELECT COUNT(*) AS total FROM appointments WHERE document_type_id = ?",
    [documentId],
  );
  assert(
    Number(usage?.total || 0) === 0,
    "Document type cannot be deleted because it is already used by appointments.",
  );

  await query("DELETE FROM document_types WHERE id = ?", [documentId]);
  emitToRecipients(
    SOCKET_EVENTS.CATALOG_CHANGED,
    { area: "document_types", action: "deleted", id: documentId },
    { roles: [ROLES.ADMIN, ROLES.HEAD, ROLES.STUDENT] },
  );

  res.json({ message: "Document type removed successfully." });
}

async function createTimeSlot(req, res) {
  const startTime = normalizeTime(req.body.startTime, "Start time");
  const endTime = normalizeTime(req.body.endTime, "End time");
  const maxAppointments = normalizeInteger(
    req.body.maxAppointments,
    "Max appointments",
    { min: 1, max: 100 },
  );
  const overlap = await queryOne(
    `
      SELECT id
      FROM time_slots
      WHERE start_time < ? AND end_time > ?
      LIMIT 1
    `,
    [endTime, startTime],
  );

  assert(endTime > startTime, "End time must be later than the start time.");
  assert(!overlap, "This time slot overlaps with an existing schedule window.");

  await query(
    `
      INSERT INTO time_slots (start_time, end_time, max_appointments, is_active)
      VALUES (?, ?, ?, 1)
    `,
    [startTime, endTime, maxAppointments],
  );

  emitToRecipients(
    SOCKET_EVENTS.CATALOG_CHANGED,
    { area: "time_slots", action: "created" },
    { roles: [ROLES.ADMIN, ROLES.STUDENT] },
  );

  res.status(201).json({ message: "Time slot added successfully." });
}

async function deleteTimeSlot(req, res) {
  const timeSlotId = normalizeInteger(req.params.id, "Time slot", { min: 1 });
  const usage = await queryOne(
    "SELECT COUNT(*) AS total FROM appointments WHERE time_slot_id = ?",
    [timeSlotId],
  );
  assert(
    Number(usage?.total || 0) === 0,
    "Time slot cannot be deleted because it is already used by appointments.",
  );

  await query("DELETE FROM time_slots WHERE id = ?", [timeSlotId]);
  emitToRecipients(
    SOCKET_EVENTS.CATALOG_CHANGED,
    { area: "time_slots", action: "deleted", id: timeSlotId },
    { roles: [ROLES.ADMIN, ROLES.STUDENT] },
  );

  res.json({ message: "Time slot removed successfully." });
}

async function createBlockedDate(req, res) {
  const blockedDate = normalizeDate(req.body.blockedDate, "Blocked date");
  const reason = normalizeRequiredString(req.body.reason, "Reason", {
    minLength: 4,
    maxLength: 255,
  });
  const existingBlockedDate = await queryOne(
    "SELECT id FROM blocked_dates WHERE blocked_date = ? LIMIT 1",
    [blockedDate],
  );

  assert(
    blockedDate >= getCurrentDateString(),
    "Blocked dates must be set for today or a future date.",
  );
  assert(!existingBlockedDate, "That date is already blocked.");

  await query(
    "INSERT INTO blocked_dates (blocked_date, reason, created_by) VALUES (?, ?, ?)",
    [blockedDate, reason, req.user.id],
  );
  emitToRecipients(
    SOCKET_EVENTS.CATALOG_CHANGED,
    { area: "blocked_dates", action: "created", blockedDate },
    { roles: [ROLES.ADMIN, ROLES.STUDENT] },
  );

  res.status(201).json({ message: "Blocked date added successfully." });
}

async function deleteBlockedDate(req, res) {
  const blockedDateId = normalizeInteger(req.params.id, "Blocked date", {
    min: 1,
  });
  await query("DELETE FROM blocked_dates WHERE id = ?", [blockedDateId]);
  emitToRecipients(
    SOCKET_EVENTS.CATALOG_CHANGED,
    { area: "blocked_dates", action: "deleted", id: blockedDateId },
    { roles: [ROLES.ADMIN, ROLES.STUDENT] },
  );

  res.json({ message: "Blocked date removed successfully." });
}

async function getUsers(req, res) {
  const rows = await query(
    `
      SELECT id, firstname, lastname, email, phone, student_id, role, account_status, created_at
      FROM users
      ORDER BY created_at DESC
    `,
  );

  res.json({
    users: rows.map(serializeUser),
  });
}

async function removeUser(req, res) {
  const userId = normalizeInteger(req.params.id, "User", { min: 1 });
  assert(userId !== req.user.id, "You cannot remove your own account.");

  await query(
    "UPDATE users SET account_status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [userId],
  );
  emitToRecipients(
    SOCKET_EVENTS.SETTINGS_CHANGED,
    { area: "users", action: "disabled", userId },
    { roles: [ROLES.ADMIN] },
  );

  res.json({ message: "User removed successfully." });
}

async function updateSettings(req, res) {
  const orgName = normalizeRequiredString(
    req.body.orgName,
    "Organization name",
    { minLength: 4, maxLength: 180 },
  );
  const orgEmail = normalizeEmail(req.body.orgEmail);
  const orgPhone = normalizePhone(req.body.orgPhone);
  const officeHours = normalizeRequiredString(
    req.body.officeHours,
    "Office hours",
    { minLength: 4, maxLength: 255 },
  );
  const gcashEnabled = normalizeBoolean(req.body.gcashEnabled);
  const gcashName = normalizeOptionalString(req.body.gcashName, 120);
  const gcashNumber = normalizeOptionalString(req.body.gcashNumber, 20);
  const gcashQrImage = normalizeOptionalString(req.body.gcashQrImage, 255);
  const cashEnabled = normalizeBoolean(req.body.cashEnabled);
  const maintenanceMode = normalizeBoolean(req.body.maintenanceMode);

  assert(
    gcashEnabled || cashEnabled,
    "At least one payment method must remain enabled.",
  );

  if (gcashEnabled) {
    assert(gcashName, "GCash account name is required when GCash is enabled.");
    assert(gcashNumber, "GCash number is required when GCash is enabled.");
  }

  await query(
    `
      INSERT INTO settings (
        id,
        org_name,
        org_email,
        org_phone,
        office_hours,
        gcash_enabled,
        gcash_name,
        gcash_number,
        gcash_qr_image,
        cash_enabled,
        maintenance_mode
      )
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        org_name = VALUES(org_name),
        org_email = VALUES(org_email),
        org_phone = VALUES(org_phone),
        office_hours = VALUES(office_hours),
        gcash_enabled = VALUES(gcash_enabled),
        gcash_name = VALUES(gcash_name),
        gcash_number = VALUES(gcash_number),
        gcash_qr_image = VALUES(gcash_qr_image),
        cash_enabled = VALUES(cash_enabled),
        maintenance_mode = VALUES(maintenance_mode),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      orgName,
      orgEmail,
      orgPhone,
      officeHours,
      gcashEnabled ? 1 : 0,
      gcashName,
      gcashNumber,
      gcashQrImage,
      cashEnabled ? 1 : 0,
      maintenanceMode ? 1 : 0,
    ],
  );
  invalidateMaintenanceCache();

  emitToRecipients(
    SOCKET_EVENTS.SETTINGS_CHANGED,
    { area: "settings", action: "updated" },
    {
      roles: [
        ROLES.ADMIN,
        ROLES.STUDENT,
        ROLES.CASHIER,
        ROLES.STAFF,
        ROLES.HEAD,
      ],
    },
  );

  res.json({ message: "Settings updated successfully." });
}

async function updateAppointmentStatus(req, res) {
  const appointmentId = normalizeInteger(req.params.id, "Appointment", {
    min: 1,
  });
  const action = sanitizeText(req.body.action).toLowerCase();
  const remarks = normalizeOptionalString(req.body.remarks, 500);
  const rejectionReason =
    action === "reject"
      ? normalizeRequiredString(
          req.body.rejectionReason || req.body.remarks,
          "Rejection reason",
          { minLength: 4, maxLength: 500 },
        )
      : null;
  const meta = getRequestMeta(req);
  const appointment = await getAppointmentById(appointmentId);

  assert(appointment, "Appointment not found.", 404);

  let nextStatus = appointment.status;
  let nextPaymentStatus = appointment.paymentStatus;
  let nextAssignedStaffId = appointment.assignedStaffId;
  let nextRejectionReason = appointment.rejectionReason;
  let paymentHistoryNote = null;
  let activityAction = null;
  let description = null;

  if (action === "approve") {
    assert(
      appointment.status === APPOINTMENT_STATUSES.PENDING,
      "Only pending appointments can be approved.",
    );
    nextStatus = APPOINTMENT_STATUSES.APPROVED;
    nextRejectionReason = null;
    activityAction = "ADMIN_APPOINTMENT_APPROVED";
    description = `Admin approved appointment ${appointment.referenceNo}.`;
  } else if (action === "reject") {
    assert(
      [
        APPOINTMENT_STATUSES.PENDING,
        APPOINTMENT_STATUSES.APPROVED,
        APPOINTMENT_STATUSES.ASSIGNED,
      ].includes(appointment.status),
      "This appointment cannot be rejected.",
    );
    nextStatus = APPOINTMENT_STATUSES.REJECTED;
    nextAssignedStaffId = null;
    nextRejectionReason = rejectionReason;
    nextPaymentStatus =
      appointment.payment?.status === PAYMENT_STATUSES.PAID ||
      appointment.paymentStatus === PAYMENT_STATUSES.PAID
        ? PAYMENT_STATUSES.PAID
        : PAYMENT_STATUSES.REJECTED;
    paymentHistoryNote = rejectionReason;
    activityAction = "ADMIN_APPOINTMENT_REJECTED";
    description = `Admin rejected appointment ${appointment.referenceNo}.`;
  } else if (action === "mark_paid") {
    assert(appointment.payment, "Payment record was not found.");
    assert(
      [APPOINTMENT_STATUSES.APPROVED, APPOINTMENT_STATUSES.ASSIGNED, APPOINTMENT_STATUSES.PROCESSING].includes(
        appointment.status,
      ),
      "Only active appointments can be marked as paid.",
    );
    assert(
      appointment.payment.method === PAYMENT_METHODS.CASH,
      "Only cash payments can be manually marked as paid.",
    );
    assert(
      appointment.payment.status !== PAYMENT_STATUSES.PAID,
      "Payment is already marked as paid.",
    );
    nextPaymentStatus = PAYMENT_STATUSES.PAID;
    paymentHistoryNote = "Admin marked the cash payment as paid.";
    activityAction = "ADMIN_PAYMENT_MARKED_PAID";
    description = `Admin marked cash payment as paid for ${appointment.referenceNo}.`;
  } else if (action === "start_processing") {
    assert(
      [APPOINTMENT_STATUSES.APPROVED, APPOINTMENT_STATUSES.ASSIGNED].includes(
        appointment.status,
      ),
      "Only approved or assigned appointments can move to processing.",
    );
    assert(
      appointment.paymentStatus === PAYMENT_STATUSES.PAID,
      "Payment must be verified before processing starts.",
    );
    nextStatus = APPOINTMENT_STATUSES.PROCESSING;
    activityAction = "ADMIN_APPOINTMENT_PROCESSING_STARTED";
    description = `Admin started processing appointment ${appointment.referenceNo}.`;
  } else if (action === "complete") {
    assert(
      appointment.status === APPOINTMENT_STATUSES.PROCESSING,
      "Only processing appointments can be completed.",
    );
    nextStatus = APPOINTMENT_STATUSES.COMPLETED;
    activityAction = "ADMIN_APPOINTMENT_COMPLETED";
    description = `Admin completed appointment ${appointment.referenceNo}.`;
  } else {
    throw new AppError("Unsupported admin action.", 400);
  }

  const updatedAppointment = await withTransaction(async (connection) => {
    await connection.execute(
      `
        UPDATE appointments
        SET
          status = ?,
          payment_status = ?,
          assigned_staff_id = ?,
          rejection_reason = ?,
          remarks = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [nextStatus, nextPaymentStatus, nextAssignedStaffId, nextRejectionReason, remarks, appointmentId],
    );

    if (
      appointment.payment?.id &&
      nextPaymentStatus !== appointment.payment.status
    ) {
      await connection.execute(
        `
          UPDATE payments
          SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          nextPaymentStatus,
          req.user.id,
          action === "reject" ? rejectionReason : null,
          appointment.payment.id,
        ],
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
          appointment.payment.id,
          appointment.payment.status,
          nextPaymentStatus,
          paymentHistoryNote,
          req.user.id,
        ],
      );
    }

    await writeActivityLog(
      {
        userId: req.user.id,
        action: activityAction,
        entityType: "appointment",
        entityId: appointmentId,
        description,
        metadata: { action, remarks, rejectionReason },
        ...meta,
      },
      connection,
    );

    await notifyUser(
      {
        title: "Appointment updated",
        message:
          action === "reject"
            ? `${appointment.referenceNo} was rejected: ${rejectionReason}`
            : `${appointment.referenceNo} is now ${nextStatus.replace("_", " ")}.`,
        type: action === "reject" ? "error" : "success",
        referenceType: "appointment",
        referenceId: appointmentId,
      },
      appointment.studentId,
      connection,
    );

    return getAppointmentById(appointmentId, connection);
  });

  emitToRecipients(
    SOCKET_EVENTS.APPOINTMENTS_CHANGED,
    { appointmentId, action, status: nextStatus },
    {
      roles: [ROLES.STAFF, ROLES.HEAD, ROLES.ADMIN],
      userIds: [appointment.studentId, appointment.assignedStaffId].filter(Boolean),
    },
  );

  if (action === "mark_paid" || action === "reject") {
    emitToRecipients(
      SOCKET_EVENTS.PAYMENTS_CHANGED,
      {
        appointmentId,
        paymentId: appointment.payment?.id || null,
        action: action === "mark_paid" ? "paid" : "rejected",
      },
      {
        roles: [ROLES.CASHIER, ROLES.STAFF, ROLES.HEAD, ROLES.ADMIN],
        userIds: [appointment.studentId, appointment.assignedStaffId].filter(Boolean),
      },
    );
  }

  res.json({
    message: "Appointment updated successfully.",
    appointment: updatedAppointment,
  });
}

module.exports = {
  getDashboard,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
  createTimeSlot,
  deleteTimeSlot,
  createBlockedDate,
  deleteBlockedDate,
  getUsers,
  removeUser,
  updateSettings,
  updateAppointmentStatus,
};
