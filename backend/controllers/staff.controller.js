const { queryOne, withTransaction } = require('../db');
const {
  APPOINTMENT_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  ROLES,
  SOCKET_EVENTS,
} = require('../utils/constants');
const AppError = require('../utils/AppError');
const { writeActivityLog } = require('../utils/audit');
const {
  normalizeInteger,
  normalizeOptionalString,
  sanitizeText,
  getRequestMeta,
  assert,
} = require('../utils/validation');
const { getAppointments, getAppointmentById } = require('../services/appointment.service');
const { emitToRecipients, notifyUser } = require('../services/notification.service');
const { sendAppointmentCompletedEmailNotification } = require('../services/email.service');

async function getDashboard(req, res) {
  const [statsRow, appointments] = await Promise.all([
    queryOne(
      `
        SELECT
          SUM(CASE WHEN assigned_staff_id = ? THEN 1 ELSE 0 END) AS assigned_to_me,
          SUM(CASE WHEN assigned_staff_id = ? AND status IN ('approved', 'assigned') THEN 1 ELSE 0 END) AS ready_requests,
          SUM(CASE WHEN assigned_staff_id = ? AND status = 'processing' THEN 1 ELSE 0 END) AS processing_requests,
          SUM(CASE WHEN assigned_staff_id = ? AND status = 'completed' THEN 1 ELSE 0 END) AS completed_requests,
          SUM(CASE WHEN assigned_staff_id = ? AND status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_requests
        FROM appointments
      `,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    ),
    getAppointments({
      whereClause:
        "a.assigned_staff_id = ? AND a.status IN ('approved', 'assigned', 'processing', 'completed', 'cancelled')",
      params: [req.user.id],
      orderBy:
        "FIELD(a.status, 'approved', 'assigned', 'processing', 'completed', 'cancelled'), a.appointment_date ASC, ts.start_time ASC",
    }),
  ]);

  res.json({
    stats: {
      assignedToMe: Number(statsRow?.assigned_to_me || 0),
      readyRequests: Number(statsRow?.ready_requests || 0),
      availableRequests: Number(statsRow?.ready_requests || 0),
      processingRequests: Number(statsRow?.processing_requests || 0),
      completedRequests: Number(statsRow?.completed_requests || 0),
      cancelledRequests: Number(statsRow?.cancelled_requests || 0),
    },
    appointments,
  });
}

async function updateAppointmentStatus(req, res) {
  const appointmentId = normalizeInteger(req.params.id, 'Appointment', { min: 1 });
  const action = sanitizeText(req.body.action).toLowerCase();
  const remarks = normalizeOptionalString(req.body.remarks, 500);
  const meta = getRequestMeta(req);
  const appointment = await getAppointmentById(appointmentId);

  assert(appointment, 'Appointment not found.', 404);
  assert(appointment.assignedStaffId === req.user.id, 'This appointment is not assigned to you.');

  let nextStatus = appointment.status;
  let nextPaymentStatus = appointment.paymentStatus;
  let activityAction = null;
  let description = null;

  if (action === 'start_processing') {
    assert(
      [APPOINTMENT_STATUSES.APPROVED, APPOINTMENT_STATUSES.ASSIGNED].includes(appointment.status),
      'Only approved or assigned appointments can move to processing.'
    );
    assert(
      appointment.paymentStatus === PAYMENT_STATUSES.PAID || appointment.payment?.method === PAYMENT_METHODS.CASH,
      'GCash payment must be verified before processing starts.'
    );
    nextStatus = APPOINTMENT_STATUSES.PROCESSING;
    activityAction = 'APPOINTMENT_PROCESSING_STARTED';
    description = `Started processing appointment ${appointment.referenceNo}.`;
  } else if (action === 'complete') {
    assert(appointment.status === APPOINTMENT_STATUSES.PROCESSING, 'Only processing appointments can be completed.');
    nextStatus = APPOINTMENT_STATUSES.COMPLETED;
    activityAction = 'APPOINTMENT_COMPLETED';
    description = `Completed appointment ${appointment.referenceNo}.`;
  } else {
    throw new AppError('Unsupported staff action.', 400);
  }

  const updatedAppointment = await withTransaction(async (connection) => {
    const [updateResult] = await connection.execute(
      `
        UPDATE appointments
        SET
          status = ?,
          payment_status = ?,
          assigned_staff_id = ?,
          remarks = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND status = ?
      `,
      [nextStatus, nextPaymentStatus, req.user.id, remarks, appointmentId, appointment.status]
    );

    assert(
      updateResult.affectedRows === 1,
      'Appointment status was already changed. Refresh and try again.',
      409
    );

    await writeActivityLog(
      {
        userId: req.user.id,
        action: activityAction,
        entityType: 'appointment',
        entityId: appointmentId,
        description,
        metadata: { action, remarks },
        ...meta,
      },
      connection
    );

    await notifyUser(
      {
        title: 'Appointment updated',
        message: `${appointment.referenceNo} is now ${nextStatus.replace('_', ' ')}.`,
        type: 'success',
        referenceType: 'appointment',
        referenceId: appointmentId,
      },
      appointment.studentId,
      connection
    );

    return getAppointmentById(appointmentId, connection);
  });

  let emailNotification = null;
  if (
    appointment.status !== APPOINTMENT_STATUSES.COMPLETED &&
    nextStatus === APPOINTMENT_STATUSES.COMPLETED
  ) {
    emailNotification = await sendAppointmentCompletedEmailNotification({
      appointment: updatedAppointment,
      actor: req.user,
      meta,
    });
  }

  emitToRecipients(
    SOCKET_EVENTS.APPOINTMENTS_CHANGED,
    { appointmentId, action, status: nextStatus },
    { roles: [ROLES.HEAD, ROLES.ADMIN], userIds: [appointment.studentId, req.user.id] }
  );

  res.json({
    message:
      emailNotification?.status === 'failed'
        ? 'Appointment updated successfully, but email notification could not be sent.'
        : 'Appointment updated successfully.',
    appointment: updatedAppointment,
    emailNotification,
  });
}

module.exports = {
  getDashboard,
  updateAppointmentStatus,
};
