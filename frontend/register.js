import { api } from './shared/api.js';
import { getSession, redirectByRole, saveSession } from './shared/auth.js';

const existingSession = getSession();
if (existingSession?.role) {
  redirectByRole(existingSession.role);
}

const form = document.getElementById('register-form');
const message = document.getElementById('register-message');
const button = document.getElementById('register-button');

function setMessage(text, type = '') {
  message.textContent = text;
  message.className = `form-message ${type ? `is-${type}` : ''}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');
  button.disabled = true;
  button.textContent = 'Creating account...';

  try {
    const formData = new FormData(form);
    const payload = await api.post(
      '/register',
      {
        firstname: formData.get('firstname'),
        lastname: formData.get('lastname'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        student_id: formData.get('student_id'),
        password: formData.get('password'),
      },
      { auth: false }
    );

    saveSession(payload);
    setMessage('Account created successfully. Redirecting to your portal...', 'success');
    redirectByRole(payload.role);
  } catch (error) {
    setMessage(error.message || 'Unable to register.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Create Student Account';
  }
});
