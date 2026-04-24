const STORAGE_KEY = 'mbcians_appointizen_session';

export const ROLE_ROUTES = Object.freeze({
  student: '/student/',
  admin: '/admin/',
  cashier: '/cashier/',
  registrar_staff: '/staff/',
  registrar_head: '/head/',
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
  window.location.replace(ROLE_ROUTES[role] || '/login.html');
}

export function requireRole(expectedRole) {
  const session = getSession();

  if (!session?.token || !session?.role) {
    window.location.replace('/login.html');
    return null;
  }

  if (expectedRole && session.role !== expectedRole) {
    redirectByRole(session.role);
    return null;
  }

  return session;
}
