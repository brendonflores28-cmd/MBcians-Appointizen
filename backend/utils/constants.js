const ROLES = Object.freeze({
  STUDENT: 'student',
  ADMIN: 'admin',
  CASHIER: 'cashier',
  STAFF: 'registrar_staff',
  HEAD: 'registrar_head',
});

const APPOINTMENT_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  ASSIGNED: 'assigned',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

const PAYMENT_STATUSES = Object.freeze({
  PENDING: 'pending',
  FOR_VERIFICATION: 'for_verification',
  PAID: 'paid',
  REJECTED: 'rejected',
});

const PAYMENT_METHODS = Object.freeze({
  GCASH: 'gcash',
  CASH: 'cash',
});

const SOCKET_EVENTS = Object.freeze({
  NOTIFICATION: 'notifications:new',
  APPOINTMENTS_CHANGED: 'appointments:changed',
  PAYMENTS_CHANGED: 'payments:changed',
  SETTINGS_CHANGED: 'settings:changed',
  CATALOG_CHANGED: 'catalog:changed',
});

module.exports = {
  ROLES,
  APPOINTMENT_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  SOCKET_EVENTS,
};
