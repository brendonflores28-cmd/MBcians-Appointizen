import { APP_CONFIG } from "../config.js";
import { parseDateValue } from "./dates.js";

export function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatDate(value, options = {}) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return "N/A";
  }

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: APP_CONFIG.APP_TIMEZONE,
    year: "numeric",
    month: options.compact ? "short" : "long",
    day: "numeric",
  }).format(parsed);
}

export function formatDateTime(value) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return "N/A";
  }

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: APP_CONFIG.APP_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function formatTime(value) {
  if (!value) {
    return "N/A";
  }

  const [hourPart, minutePart] = String(value).split(":");
  const hours = Number(hourPart);
  const minutes = Number(minutePart);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return "N/A";
  }

  const meridiem = hours >= 12 ? "PM" : "AM";
  const normalizedHour = hours % 12 || 12;
  return `${normalizedHour}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

export function formatTimeRange(startTime, endTime) {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

export function getInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "MB"
  );
}

export function labelize(value = "") {
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getApiOrigin() {
  const baseUrl = APP_CONFIG.API_URL || APP_CONFIG.SOCKET_URL || "";
  const fallbackOrigin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://example.invalid";

  try {
    return new URL(baseUrl || "/", fallbackOrigin).origin;
  } catch {
    return fallbackOrigin;
  }
}

export function resolveMediaUrl(value = "") {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  if (
    normalizedValue.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(normalizedValue)
  ) {
    return normalizedValue;
  }

  if (
    !normalizedValue.startsWith("/uploads/") &&
    !normalizedValue.startsWith("uploads/")
  ) {
    return normalizedValue;
  }

  const pathname = normalizedValue.startsWith("/")
    ? normalizedValue
    : `/${normalizedValue}`;

  try {
    return new URL(pathname, `${getApiOrigin()}/`).toString();
  } catch {
    return `${getApiOrigin()}${pathname}`;
  }
}

export function statusTone(status = "") {
  if (
    [
      "approved",
      "assigned",
      "processing",
      "completed",
      "paid",
      "selected",
    ].includes(status)
  ) {
    return "success";
  }

  if (["pending", "for_verification"].includes(status)) {
    return "warning";
  }

  if (["rejected", "cancelled"].includes(status)) {
    return "danger";
  }

  if (["unpaid", "available"].includes(status)) {
    return "info";
  }

  if (["full"].includes(status)) {
    return "danger";
  }

  return "neutral";
}

export function statusBadge(status) {
  return `<span class="status-pill status-pill--${statusTone(status)}">${escapeHTML(labelize(status))}</span>`;
}
