const AppError = require('./AppError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^09\d{9}$/;
const STUDENT_ID_REGEX = /^MBC\d{4}-\d{5}$/i;

function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeOptionalText(value) {
  const sanitized = sanitizeText(value);
  return sanitized || null;
}

function assert(condition, message, statusCode = 400, details = null) {
  if (!condition) {
    throw new AppError(message, statusCode, details);
  }
}

function normalizeEmail(value) {
  const email = sanitizeText(value).toLowerCase();
  assert(EMAIL_REGEX.test(email), 'A valid email address is required.');
  return email;
}

function normalizePhone(value) {
  const phone = sanitizeText(value);
  assert(PHONE_REGEX.test(phone), 'Phone number must match 09XXXXXXXXX.');
  return phone;
}

function normalizeStudentId(value) {
  const studentId = sanitizeText(value).toUpperCase();
  assert(STUDENT_ID_REGEX.test(studentId), 'Student ID must match MBC2024-12345.');
  return studentId;
}

function normalizeRequiredString(value, fieldName, options = {}) {
  const sanitized = sanitizeText(value);
  const minLength = options.minLength ?? 1;
  const maxLength = options.maxLength ?? 255;

  assert(sanitized.length >= minLength, `${fieldName} is required.`);
  assert(sanitized.length <= maxLength, `${fieldName} must be ${maxLength} characters or less.`);

  return sanitized;
}

function normalizeOptionalString(value, maxLength = 255) {
  const sanitized = sanitizeText(value);
  if (!sanitized) {
    return null;
  }

  assert(sanitized.length <= maxLength, `Value must be ${maxLength} characters or less.`);
  return sanitized;
}

function normalizePassword(value) {
  const password = sanitizeText(value);
  assert(password.length >= 8, 'Password must be at least 8 characters.');
  return password;
}

function normalizeInteger(value, fieldName, options = {}) {
  const number = Number.parseInt(value, 10);
  assert(Number.isInteger(number), `${fieldName} must be a valid number.`);

  if (options.min !== undefined) {
    assert(number >= options.min, `${fieldName} must be at least ${options.min}.`);
  }

  if (options.max !== undefined) {
    assert(number <= options.max, `${fieldName} must be at most ${options.max}.`);
  }

  return number;
}

function normalizeDecimal(value, fieldName, options = {}) {
  const number = Number.parseFloat(value);
  assert(Number.isFinite(number), `${fieldName} must be a valid amount.`);

  if (options.min !== undefined) {
    assert(number >= options.min, `${fieldName} must be at least ${options.min}.`);
  }

  return Number(number.toFixed(2));
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  const normalized = sanitizeText(value).toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(normalized);
}

function normalizeDate(value, fieldName) {
  const date = sanitizeText(value);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date), `${fieldName} must be in YYYY-MM-DD format.`);
  const parsed = new Date(`${date}T00:00:00`);
  assert(!Number.isNaN(parsed.getTime()), `${fieldName} is invalid.`);
  return date;
}

function normalizeTime(value, fieldName) {
  const time = sanitizeText(value);
  assert(/^\d{2}:\d{2}(:\d{2})?$/.test(time), `${fieldName} must be in HH:MM or HH:MM:SS format.`);
  return time.length === 5 ? `${time}:00` : time;
}

function getRequestMeta(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null,
  };
}

module.exports = {
  sanitizeText,
  sanitizeOptionalText,
  assert,
  normalizeEmail,
  normalizePhone,
  normalizeStudentId,
  normalizeRequiredString,
  normalizeOptionalString,
  normalizePassword,
  normalizeInteger,
  normalizeDecimal,
  normalizeBoolean,
  normalizeDate,
  normalizeTime,
  getRequestMeta,
};
