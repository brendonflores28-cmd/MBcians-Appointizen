const { queryOne, withTransaction } = require('../db');
const {
  APPOINTMENT_STATUSES,
  PAYMENT_STATUSES,
  ROLES,
  SOCKET_EVENTS,
} = require('../utils/constants');
const { writeActivityLog } = require('../utils/audit');
const {
  normalizeInteger,
  normalizeRequiredString,
  getRequestMeta,
  assert,
} = require('../utils/validation');
const { getAppointments, getAppointmentById } = require('../services/appointment.service');
const { emitToRecipients, notifyUser } = require('../services/notification.service');

async function getDashboard(req, res) {
  const [statsRow, appointments] = await Promise.all([
    queryOne(
      `
        SELECT
          SUM(CASE WHEN p.status = 'for_verification' AND a.status <> 'cancelled' THEN 1 ELSE 0 END) AS pending_verification,
          SUM(CASE WHEN p.status = 'paid' THEN 1 ELSE 0 END) AS paid_transactions,
          SUM(CASE WHEN p.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_transactions
        FROM payments p
        INNER JOIN appointments a ON a.id = p.appointment_id
      `
    ),
    getAppointments({
      whereClause: "p.id IS NOT NULL",
      orderBy: "FIELD(p.status, 'for_verification', 'pending', 'rejected', 'paid'), a.created_at DESC",
    }),
  ]);

  res.json({
    stats: {
      pendingVerification: Number(statsRow?.pending_verification || 0),
      paidTransactions: Number(statsRow?.paid_transactions || 0),
      rejectedTransactions: Number(statsRow?.rejected_transactions || 0),
    },
    appointments,
  });
}

async function approvePayment(req, res) {
  const appointmentId = normalizeInteger(req.params.id, 'Appointment', { min: 1 });
  const meta = getRequestMeta(req);
  const appointment = await getAppointmentById(appointmentId);

  assert(appointment && appointment.payment, 'Payment record not found.', 404);
  assert(
    ![APPOINTMENT_STATUSES.CANCELLED, APPOINTMENT_STATUSES.REJECTED].includes(appointment.status),
    'Cancelled or rejected appointments cannot be reviewed for payment.'
  );
  assert(
    [PAYMENT_STATUSES.FOR_VERIFICATION, PAYMENT_STATUSES.PENDING].includes(appointment.payment.status),
    'This payment cannot be approved.'
  );

  const updatedAppointment = await withTransaction(async (connection) => {
    await connection.execute(
      `
        UPDATE payments
        SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, rejection_reason = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [PAYMENT_STATUSES.PAID, req.user.id, appointment.payment.id]
    );

    await connection.execute(
      `
        UPDATE appointments
        SET payment_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [PAYMENT_STATUSES.PAID, appointmentId]
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
      [appointment.payment.id, appointment.payment.status, PAYMENT_STATUSES.PAID, 'Cashier approved the payment.', req.user.id]
    );

    await writeActivityLog(
      {
        userId: req.user.id,
        action: 'PAYMENT_APPROVED',
        entityType: 'payment',
        entityId: appointment.payment.id,
        description: `Approved payment for ${appointment.referenceNo}.`,
        metadata: { appointmentId },
        ...meta,
      },
      connection
    );

    await notifyUser(
      {
        title: 'Payment verified',
        message: `${appointment.referenceNo} payment is verified.`,
        type: 'success',
        referenceType: 'payment',
        referenceId: appointment.payment.id,
      },
      appointment.studentId,
      connection
    );

    return getAppointmentById(appointmentId, connection);
  });

  emitToRecipients(
    SOCKET_EVENTS.PAYMENTS_CHANGED,
    { appointmentId, paymentId: appointment.payment.id, action: 'approved' },
    { roles: [ROLES.CASHIER, ROLES.STAFF, ROLES.HEAD, ROLES.ADMIN], userIds: [appointment.studentId] }
  );
  emitToRecipients(
    SOCKET_EVENTS.APPOINTMENTS_CHANGED,
    { appointmentId, action: 'payment-approved' },
    { roles: [ROLES.CASHIER, ROLES.STAFF, ROLES.HEAD, ROLES.ADMIN], userIds: [appointment.studentId] }
  );

  res.json({
    message: 'Payment approved successfully.',
    appointment: updatedAppointment,
  });
}

async function rejectPayment(req, res) {
  const appointmentId = normalizeInteger(req.params.id, 'Appointment', { min: 1 });
  const rejectionReason = normalizeRequiredString(req.body.rejectionReason, 'Rejection reason', {
    minLength: 4,
    maxLength: 255,
  });
  const meta = getRequestMeta(req);
  const appointment = await getAppointmentById(appointmentId);

  assert(appointment && appointment.payment, 'Payment record not found.', 404);
  assert(
    ![APPOINTMENT_STATUSES.CANCELLED, APPOINTMENT_STATUSES.REJECTED].includes(appointment.status),
    'Cancelled or rejected appointments cannot be reviewed for payment.'
  );
  assert(
    [PAYMENT_STATUSES.FOR_VERIFICATION, PAYMENT_STATUSES.PENDING].includes(appointment.payment.status),
    'This payment cannot be rejected.'
  );

  const updatedAppointment = await withTransaction(async (connection) => {
    await connection.execute(
      `
        UPDATE payments
        SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [PAYMENT_STATUSES.REJECTED, rejectionReason, req.user.id, appointment.payment.id]
    );

    await connection.execute(
      `
        UPDATE appointments
        SET payment_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [PAYMENT_STATUSES.REJECTED, appointmentId]
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

    await writeActivityLog(
      {
        userId: req.user.id,
        action: 'PAYMENT_REJECTED',
        entityType: 'payment',
        entityId: appointment.payment.id,
        description: `Rejected payment for ${appointment.referenceNo}.`,
        metadata: { appointmentId, rejectionReason },
        ...meta,
      },
      connection
    );

    await notifyUser(
      {
        title: 'Payment rejected',
        message: `${appointment.referenceNo} payment was rejected: ${rejectionReason}`,
        type: 'error',
        referenceType: 'payment',
        referenceId: appointment.payment.id,
      },
      appointment.studentId,
      connection
    );

    return getAppointmentById(appointmentId, connection);
  });

  emitToRecipients(
    SOCKET_EVENTS.PAYMENTS_CHANGED,
    { appointmentId, paymentId: appointment.payment.id, action: 'rejected' },
    { roles: [ROLES.CASHIER, ROLES.STAFF, ROLES.HEAD, ROLES.ADMIN], userIds: [appointment.studentId] }
  );

  res.json({
    message: 'Payment rejected successfully.',
    appointment: updatedAppointment,
  });
}

module.exports = {
  getDashboard,
  approvePayment,
  rejectPayment,
};
