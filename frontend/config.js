function trimTrailingSlash(value = '') {
  return String(value || '').replace(/\/+$/, '');
}

function resolveApiUrl() {
  const envUrl = trimTrailingSlash(import.meta.env.VITE_API_URL || '');

  if (envUrl) {
    return envUrl;
  }

  if (typeof window !== 'undefined') {
    return `${trimTrailingSlash(window.location.origin)}/api`;
  }

  return '/api';
}

function resolveSocketUrl(apiUrl) {
  const envUrl = trimTrailingSlash(import.meta.env.VITE_SOCKET_URL || '');

  if (envUrl) {
    return envUrl;
  }

  if (/^https?:\/\//i.test(apiUrl)) {
    return trimTrailingSlash(apiUrl).replace(/\/api$/i, '');
  }

  if (typeof window !== 'undefined') {
    return trimTrailingSlash(window.location.origin);
  }

  return '';
}

const API_URL = resolveApiUrl();

export const APP_CONFIG = Object.freeze({
  APP_NAME: 'MBCIANS APPOINTIZEN',
  APP_SUBTITLE: 'Registrar Appointment System',
  API_URL,
  SOCKET_URL: resolveSocketUrl(API_URL),
  APP_TIMEZONE: import.meta.env.VITE_APP_TIMEZONE || 'Asia/Manila',
  DEFAULT_QR_ASSET: '/assets/qr-code.jpg',
});
