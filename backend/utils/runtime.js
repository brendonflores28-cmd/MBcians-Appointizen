const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Manila";

function getDateParts(date = new Date(), timeZone = APP_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date).reduce((accumulator, part) => {
    if (part.type !== "literal") {
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

function getCurrentDateString(timeZone = APP_TIMEZONE) {
  const parts = getDateParts(new Date(), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getCurrentDateStamp(timeZone = APP_TIMEZONE) {
  return getCurrentDateString(timeZone).replace(/-/g, "");
}

function normalizeOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (error) {
    return null;
  }
}

function parseOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const protocol = parsed.protocol;
    const hostname = parsed.hostname;
    const port =
      parsed.port ||
      (protocol === "https:" || protocol === "wss:" ? "443" : "80");

    return { protocol, hostname, port };
  } catch (error) {
    return null;
  }
}

function isLoopbackHostname(hostname = "") {
  return LOOPBACK_HOSTS.has(hostname);
}

function parseAllowedOrigins(value = process.env.CLIENT_ORIGIN || "") {
  return [...new Set(value.split(",").map((origin) => normalizeOrigin(origin.trim())).filter(Boolean))];
}

function isAllowedOrigin(
  origin,
  allowedOrigins = parseAllowedOrigins(),
  { allowRequestsWithoutOrigin = true, allowLoopbackFallback = process.env.NODE_ENV !== "production" } = {},
) {
  if (!origin) {
    return allowRequestsWithoutOrigin;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  if (allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  const current = parseOrigin(normalizedOrigin);
  if (!current) {
    return false;
  }

  if (!allowedOrigins.length) {
    return allowLoopbackFallback && isLoopbackHostname(current.hostname);
  }

  return allowLoopbackFallback && allowedOrigins.some((allowedOrigin) => {
    const allowed = parseOrigin(allowedOrigin);

    return (
      allowed &&
      isLoopbackHostname(current.hostname) &&
      isLoopbackHostname(allowed.hostname) &&
      current.protocol === allowed.protocol &&
      current.port === allowed.port
    );
  });
}

module.exports = {
  APP_TIMEZONE,
  getCurrentDateString,
  getCurrentDateStamp,
  parseAllowedOrigins,
  isAllowedOrigin,
};
