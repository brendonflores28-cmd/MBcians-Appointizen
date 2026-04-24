const { query, queryOne } = require('../db');
const { APPOINTMENT_STATUSES } = require('../utils/constants');

const APPOINTMENT_SELECT = `
  SELECT
    a.id,
    a.reference_no,
    a.student_id,
    a.document_type_id,
    a.time_slot_id,
    a.appointment_date,
    a.copies,
    a.is_rush,
    a.purpose,
    a.remarks,
    a.rejection_reason,
    a.status,
    a.payment_status,
    a.assigned_staff_id,
    a.approved_by,
    a.created_at,
    a.updated_at,
    dt.name AS document_name,
    dt.base_fee,
    dt.copy_fee,
    dt.rush_fee,
    dt.processing_days,
    ts.start_time,
    ts.end_time,
    ts.max_appointments,
    student.firstname AS student_firstname,
    student.lastname AS student_lastname,
    student.email AS student_email,
    student.phone AS student_phone,
    student.student_id AS student_identifier,
    staff.firstname AS staff_firstname,
    staff.lastname AS staff_lastname,
    p.id AS payment_id,
    p.amount AS payment_amount,
    p.method AS payment_method,
    p.proof_image AS payment_proof_image,
    p.reference_number AS payment_reference_number,
    p.status AS payment_record_status,
    p.rejection_reason AS payment_rejection_reason,
    p.reviewed_at AS payment_reviewed_at,
    p.created_at AS payment_created_at,
    p.updated_at AS payment_updated_at
  FROM appointments a
  INNER JOIN users student ON student.id = a.student_id
  INNER JOIN document_types dt ON dt.id = a.document_type_id
  INNER JOIN time_slots ts ON ts.id = a.time_slot_id
  LEFT JOIN users staff ON staff.id = a.assigned_staff_id
  LEFT JOIN payments p ON p.appointment_id = a.id
`;

function mapAppointmentRow(row) {
  return {
    id: row.id,
    referenceNo: row.reference_no,
    studentId: row.student_id,
    studentName: `${row.student_firstname} ${row.student_lastname}`.trim(),
    studentEmail: row.student_email,
    studentPhone: row.student_phone,
    studentIdentifier: row.student_identifier,
    documentTypeId: row.document_type_id,
    documentName: row.document_name,
    appointmentDate: row.appointment_date,
    timeSlotId: row.time_slot_id,
    startTime: row.start_time,
    endTime: row.end_time,
    maxAppointments: row.max_appointments,
    copies: row.copies,
    isRush: Boolean(row.is_rush),
    purpose: row.purpose,
    remarks: row.remarks,
    rejectionReason: row.rejection_reason,
    status: row.status,
    paymentStatus: row.payment_status,
    assignedStaffId: row.assigned_staff_id,
    assignedStaffName: row.staff_firstname ? `${row.staff_firstname} ${row.staff_lastname}`.trim() : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payment: row.payment_id
      ? {
          id: row.payment_id,
          amount: Number(row.payment_amount),
          method: row.payment_method,
          proofImage: row.payment_proof_image,
          referenceNumber: row.payment_reference_number,
          status: row.payment_record_status,
          rejectionReason: row.payment_rejection_reason,
          reviewedAt: row.payment_reviewed_at,
          createdAt: row.payment_created_at,
          updatedAt: row.payment_updated_at,
        }
      : null,
  };
}

async function fetchRows(executor, sql, params = []) {
  if (executor) {
    const [rows] = await executor.execute(sql, params);
    return rows;
  }

  return query(sql, params);
}

async function getAppointments(options = {}) {
  const whereClause = options.whereClause || '1 = 1';
  const orderBy = options.orderBy || 'a.created_at DESC';
  const rows = await fetchRows(
    options.executor,
    `${APPOINTMENT_SELECT} WHERE ${whereClause} ORDER BY ${orderBy}`,
    options.params || []
  );

  return rows.map(mapAppointmentRow);
}

async function getAppointmentById(id, executor = null) {
  const rows = await getAppointments({
    executor,
    whereClause: 'a.id = ?',
    params: [id],
  });

  return rows[0] || null;
}

async function getActiveDocuments(executor = null) {
  const rows = await fetchRows(
    executor,
    `
      SELECT id, name, description, base_fee, copy_fee, rush_fee, processing_days, is_active
      FROM document_types
      WHERE is_active = 1
      ORDER BY name ASC
    `
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    baseFee: Number(row.base_fee),
    copyFee: Number(row.copy_fee),
    rushFee: Number(row.rush_fee),
    processingDays: row.processing_days,
    isActive: Boolean(row.is_active),
  }));
}

async function getActiveTimeSlots(executor = null) {
  const rows = await fetchRows(
    executor,
    `
      SELECT id, start_time, end_time, max_appointments, is_active
      FROM time_slots
      WHERE is_active = 1
      ORDER BY start_time ASC
    `
  );

  return rows.map((row) => ({
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    maxAppointments: row.max_appointments,
    isActive: Boolean(row.is_active),
  }));
}

async function getBlockedDates(executor = null) {
  const rows = await fetchRows(
    executor,
    `
      SELECT id, blocked_date, reason
      FROM blocked_dates
      ORDER BY blocked_date ASC
    `
  );

  return rows.map((row) => ({
    id: row.id,
    blockedDate: row.blocked_date,
    reason: row.reason,
  }));
}

async function isDateBlocked(date, executor = null) {
  const row = executor
    ? (await executor.execute('SELECT id, reason FROM blocked_dates WHERE blocked_date = ?', [date]))[0][0]
    : await queryOne('SELECT id, reason FROM blocked_dates WHERE blocked_date = ?', [date]);

  return row || null;
}

async function getDateSlotLoad(date, executor = null) {
  const rows = await fetchRows(
    executor,
    `
      SELECT time_slot_id, COUNT(*) AS used_slots
      FROM appointments
      WHERE appointment_date = ?
        AND status IN (?, ?, ?, ?, ?)
      GROUP BY time_slot_id
    `,
    [
      date,
      APPOINTMENT_STATUSES.PENDING,
      APPOINTMENT_STATUSES.APPROVED,
      APPOINTMENT_STATUSES.ASSIGNED,
      APPOINTMENT_STATUSES.PROCESSING,
      APPOINTMENT_STATUSES.COMPLETED,
    ]
  );

  return rows.reduce((accumulator, row) => {
    accumulator[row.time_slot_id] = Number(row.used_slots);
    return accumulator;
  }, {});
}

function calculateAppointmentAmount(document, copies, isRush) {
  const copyTotal = document.copyFee * copies;
  const rushTotal = isRush ? document.rushFee : 0;
  const total = document.baseFee + copyTotal + rushTotal;
  return Number(total.toFixed(2));
}

module.exports = {
  getAppointments,
  getAppointmentById,
  getActiveDocuments,
  getActiveTimeSlots,
  getBlockedDates,
  isDateBlocked,
  getDateSlotLoad,
  calculateAppointmentAmount,
};
