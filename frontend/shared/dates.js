import { APP_CONFIG } from '../config.js';

function toDateParts(date = new Date(), timeZone = APP_CONFIG.APP_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date).reduce((accumulator, part) => {
    if (part.type !== 'literal') {
      accumulator[part.type] = part.value;
    }

    return accumulator;
  }, {});

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

export function getTodayDateString(timeZone = APP_CONFIG.APP_TIMEZONE) {
  const parts = toDateParts(new Date(), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function parseDateOnly(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return null;
  }

  return new Date(`${value}T12:00:00`);
}

export function parseDateValue(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parseDateOnly(value);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
