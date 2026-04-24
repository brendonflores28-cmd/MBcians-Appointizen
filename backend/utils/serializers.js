function serializeUser(row) {
  return {
    id: row.id,
    firstname: row.firstname,
    lastname: row.lastname,
    fullName: `${row.firstname} ${row.lastname}`.trim(),
    email: row.email,
    phone: row.phone,
    studentId: row.student_id,
    role: row.role,
    accountStatus: row.account_status,
    createdAt: row.created_at,
  };
}

function serializeNotification(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    type: row.type,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

function serializeSettings(row) {
  return {
    orgName: row.org_name,
    orgEmail: row.org_email,
    orgPhone: row.org_phone,
    officeHours: row.office_hours,
    gcashEnabled: Boolean(row.gcash_enabled),
    gcashName: row.gcash_name,
    gcashNumber: row.gcash_number,
    gcashQrImage: row.gcash_qr_image,
    cashEnabled: Boolean(row.cash_enabled),
    maintenanceMode: Boolean(row.maintenance_mode),
  };
}

module.exports = {
  serializeUser,
  serializeNotification,
  serializeSettings,
};
