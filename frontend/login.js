import { api } from "./shared/api.js";
import { getSession, redirectByRole, saveSession } from "./shared/auth.js";

const existingSession = getSession();
if (existingSession?.role) {
  redirectByRole(existingSession.role);
}

const form = document.getElementById("login-form");
const message = document.getElementById("login-message");
const button = document.getElementById("login-button");

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `form-message ${type ? `is-${type}` : ""}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");
  button.disabled = true;
  button.textContent = "Signing in...";

  try {
    const formData = new FormData(form);
    const payload = await api.post(
      "/login",
      {
        email: formData.get("email"),
        password: formData.get("password"),
      },
      { auth: false },
    );

    saveSession(payload);
    setMessage("Welcome back. Redirecting...", "success");
    redirectByRole(payload.role);
  } catch (error) {
    setMessage(error.message || "Unable to sign in.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "Sign In";
  }
});
