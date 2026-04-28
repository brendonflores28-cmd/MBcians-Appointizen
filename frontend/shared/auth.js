const STORAGE_KEY = 'mbcians_appointizen_session';
const BASE = import.meta.env.BASE_URL;

export const ROLE_ROUTES = Object.freeze({
  student: `${BASE}student/`,
  admin: `${BASE}admin/`,
  cashier: `${BASE}cashier/`,
  registrar_staff: `${BASE}staff/`,
  registrar_head: `${BASE}head/`,
});

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveSession(payload) {
  const session = {
    token: payload.token,
    role: payload.role,
    user: payload.user,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function syncSessionUser(user) {
  const session = getSession();
  if (!session) {
    return;
  }

  saveSession({ ...session, user });
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function redirectByRole(role) {
  window.location.replace(ROLE_ROUTES[role] || `${BASE}login.html`);
}

export function requireRole(expectedRole) {
  const session = getSession();

  if (!session?.token || !session?.role) {
    window.location.replace(`${BASE}login.html`);
    return null;
  }

  if (expectedRole && session.role !== expectedRole) {
    redirectByRole(session.role);
    return null;
  }

  return session;
}
