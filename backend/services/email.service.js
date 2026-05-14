const nodemailer = require("nodemailer");
const { queryOne } = require("../db");
const { APPOINTMENT_STATUSES } = require("../utils/constants");
const { writeActivityLog } = require("../utils/audit");

const READY_FOR_PICKUP_SUBJECT = "YOUR DOCUMENT REQUEST IS READY FOR PICKUP";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let transporter = null;

function hasMailConfig() {
  return ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"].every((key) =>
    String(process.env[key] || "").trim(),
  );
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
}

function sanitizeValue(value) {
  return String(value || "").trim();
}

function isValidEmail(value) {
  return EMAIL_REGEX.test(sanitizeValue(value).toLowerCase());
}

function resolveOfficeIdentity(officeSettings = {}) {
  const smtpFromEmail = sanitizeValue(process.env.SMTP_FROM_EMAIL);
  const smtpUser = sanitizeValue(process.env.SMTP_USER);
  const settingsEmail = sanitizeValue(officeSettings.org_email);
  const officeName =
    sanitizeValue(process.env.SMTP_FROM_NAME) ||
    sanitizeValue(officeSettings.org_name) ||
    "Registrar Office";

  const officeEmail = isValidEmail(smtpFromEmail)
    ? smtpFromEmail
    : isValidEmail(settingsEmail)
      ? settingsEmail
      : smtpUser;

  return {
    officeName,
    officeEmail,
  };
}

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = toBoolean(process.env.SMTP_SECURE, port === 465);

    transporter = nodemailer.createTransport({
      host: sanitizeValue(process.env.SMTP_HOST),
      port,
      secure,
      auth: {
        user: sanitizeValue(process.env.SMTP_USER),
        pass: sanitizeValue(process.env.SMTP_PASSWORD),
      },
    });
  }

  return transporter;
}

async function verifyEmailTransport() {
  if (!hasMailConfig()) {
    throw new Error("SMTP email configuration is incomplete.");
  }

  await getTransporter().verify();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTextBody(appointment) {
  return [
    `Hello ${appointment.studentName},`,
    "",
    "Your document request has been successfully processed.",
    "",
    "Details of your request:",
    "",
    `* Document Type: ${appointment.documentName}`,
    `* Purpose: ${appointment.purpose}`,
    `* Reference: ${appointment.referenceNo}`,
    "* Status: READY FOR PICKUP",
    "",
    "You may now proceed to the Registrar Office to claim your requested document.",
    "",
    "Please bring a valid ID and your reference number for verification.",
    "",
    "Thank you.",
    "",
    "Registrar Office",
  ].join("\n");
}

function buildHtmlBody(appointment, officeName) {
  const studentName = escapeHtml(appointment.studentName);
  const documentName = escapeHtml(appointment.documentName);
  const purpose = escapeHtml(appointment.purpose);
  const referenceNo = escapeHtml(appointment.referenceNo);
  const senderName = escapeHtml(officeName || "Registrar Office");

  return `
    <div style="margin:0;padding:24px;background:#f4f7fb;font-family:Arial,sans-serif;color:#1f2937;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbe4f0;">
        <tr>
          <td style="padding:28px 32px;background:#0f4c81;color:#ffffff;">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.9;">Registrar Office</div>
            <div style="margin-top:8px;font-size:24px;font-weight:700;">Your document request is ready for pickup</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hello ${studentName},</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">Your document request has been successfully processed.</p>

            <div style="margin:0 0 24px;padding:20px;border:1px solid #dbe4f0;border-radius:12px;background:#f8fbff;">
              <div style="font-size:14px;font-weight:700;color:#0f4c81;margin-bottom:12px;">Details of your request</div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#4b5563;">Document Type</td>
                  <td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${documentName}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#4b5563;">Purpose</td>
                  <td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${purpose}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#4b5563;">Reference</td>
                  <td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${referenceNo}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#4b5563;">Status</td>
                  <td style="padding:6px 0;font-size:14px;font-weight:700;color:#0f766e;text-align:right;">READY FOR PICKUP</td>
                </tr>
              </table>
            </div>

            <div style="margin:0 0 16px;padding:16px 18px;border-radius:12px;background:#eef6ff;border:1px solid #c9def8;font-size:14px;line-height:1.7;">
              <strong>Pickup:</strong> You may now proceed to Registrar Office to claim your requested document.
            </div>

            <div style="margin:0 0 24px;padding:16px 18px;border-radius:12px;background:#fff8e8;border:1px solid #f2dfaa;font-size:14px;line-height:1.7;">
              <strong>Reminder:</strong> Please bring a valid ID and your reference number for verification.
            </div>

            <p style="margin:0;font-size:15px;line-height:1.7;">Thank you.</p>
            <p style="margin:16px 0 0;font-size:15px;line-height:1.7;">${senderName}</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

async function getOfficeSettings() {
  return (
    (await queryOne("SELECT org_name, org_email FROM settings WHERE id = 1")) || {
      org_name: "Registrar Office",
      org_email: null,
    }
  );
}

async function sendReadyForPickupEmail({
  appointment,
  toEmail = null,
  officeName = null,
  officeEmail = null,
}) {
  if (!hasMailConfig()) {
    throw new Error("SMTP email configuration is incomplete.");
  }

  const resolvedOfficeName = sanitizeValue(officeName) || "Registrar Office";
  const resolvedOfficeEmail =
    sanitizeValue(officeEmail) ||
    sanitizeValue(process.env.SMTP_FROM_EMAIL) ||
    sanitizeValue(process.env.SMTP_USER);
  const recipient = sanitizeValue(toEmail || appointment.studentEmail);

  if (!recipient) {
    throw new Error("Recipient email address is required.");
  }

  if (!isValidEmail(resolvedOfficeEmail)) {
    throw new Error("Sender email address is invalid.");
  }

  await getTransporter().sendMail({
    from: { name: resolvedOfficeName, address: resolvedOfficeEmail },
    to: recipient,
    replyTo: resolvedOfficeEmail,
    subject: READY_FOR_PICKUP_SUBJECT,
    text: buildTextBody(appointment),
    html: buildHtmlBody(appointment, resolvedOfficeName),
  });
}

async function writeEmailAuditLog({
  action,
  description,
  appointment,
  actor,
  meta,
  errorMessage = null,
}) {
  await writeActivityLog({
    userId: actor.id,
    action,
    entityType: "appointment",
    entityId: appointment.id,
    description,
    metadata: {
      email: actor.email,
      studentName: appointment.studentName,
      studentEmail: appointment.studentEmail,
      documentType: appointment.documentName,
      purpose: appointment.purpose,
      referenceNo: appointment.referenceNo,
      status: appointment.status,
      changedBy: actor.fullName,
      changedByRole: actor.role,
      subject: READY_FOR_PICKUP_SUBJECT,
      error: errorMessage,
    },
    ...meta,
  });
}

async function sendAppointmentCompletedEmailNotification({
  appointment,
  actor,
  meta,
}) {
  if (!appointment || appointment.status !== APPOINTMENT_STATUSES.COMPLETED) {
    return { status: "skipped", reason: "Appointment not completed." };
  }

  if (!appointment.studentEmail) {
    const reason = "Student email address is missing.";
    await writeEmailAuditLog({
      action: "APPOINTMENT_READY_EMAIL_FAILED",
      description: `Ready-for-pickup email failed for ${appointment.studentName} (${appointment.referenceNo}): ${reason}`,
      appointment,
      actor,
      meta,
      errorMessage: reason,
    });
    return { status: "failed", reason };
  }

  if (!hasMailConfig()) {
    const reason = "SMTP email configuration is incomplete.";
    await writeEmailAuditLog({
      action: "APPOINTMENT_READY_EMAIL_FAILED",
      description: `Ready-for-pickup email failed for ${appointment.studentName} (${appointment.referenceNo}): ${reason}`,
      appointment,
      actor,
      meta,
      errorMessage: reason,
    });
    return { status: "failed", reason };
  }

  const officeSettings = await getOfficeSettings();
  const { officeName, officeEmail } = resolveOfficeIdentity(officeSettings);

  try {
    await sendReadyForPickupEmail({
      appointment,
      toEmail: appointment.studentEmail,
      officeName,
      officeEmail,
    });

    await writeEmailAuditLog({
      action: "APPOINTMENT_READY_EMAIL_SENT",
      description: `Ready-for-pickup email sent to ${appointment.studentName} for reference ${appointment.referenceNo} by ${actor.fullName}.`,
      appointment,
      actor,
      meta,
    });

    return { status: "sent" };
  } catch (error) {
    const reason = error.message || "Email send failed.";

    await writeEmailAuditLog({
      action: "APPOINTMENT_READY_EMAIL_FAILED",
      description: `Ready-for-pickup email failed for ${appointment.studentName} (${appointment.referenceNo}): ${reason}`,
      appointment,
      actor,
      meta,
      errorMessage: reason,
    });

    return { status: "failed", reason };
  }
}

module.exports = {
  READY_FOR_PICKUP_SUBJECT,
  verifyEmailTransport,
  sendReadyForPickupEmail,
  sendAppointmentCompletedEmailNotification,
};
