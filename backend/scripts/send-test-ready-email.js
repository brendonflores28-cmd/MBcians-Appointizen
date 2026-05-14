const { queryOne, closePool } = require("../db");
const {
  sendReadyForPickupEmail,
  verifyEmailTransport,
} = require("../services/email.service");
const { APPOINTMENT_STATUSES } = require("../utils/constants");

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function getOfficeSettings() {
  try {
    return (
      (await queryOne("SELECT org_name, org_email FROM settings WHERE id = 1")) || {
        org_name: "Registrar Office",
        org_email: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
      }
    );
  } catch (_error) {
    return {
      org_name: "Registrar Office",
      org_email: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
    };
  }
}

async function main() {
  await verifyEmailTransport();

  const office = await getOfficeSettings();
  const appointment = {
    id: 0,
    studentName:
      readArg("student-name") || process.env.SMTP_TEST_STUDENT_NAME || "Test Student",
    studentEmail:
      readArg("to") || process.env.SMTP_TEST_TO || process.env.SMTP_USER,
    documentName:
      readArg("document-type") ||
      process.env.SMTP_TEST_DOCUMENT_TYPE ||
      "Certificate of Enrollment",
    purpose:
      readArg("purpose") || process.env.SMTP_TEST_PURPOSE || "Testing Gmail SMTP",
    referenceNo:
      readArg("reference") || process.env.SMTP_TEST_REFERENCE || "TEST-READY-001",
    status: APPOINTMENT_STATUSES.COMPLETED,
  };

  if (!appointment.studentEmail) {
    throw new Error(
      "Missing test recipient. Set SMTP_TEST_TO or pass --to=recipient@example.com",
    );
  }

  await sendReadyForPickupEmail({
    appointment,
    toEmail: appointment.studentEmail,
    officeName:
      process.env.SMTP_FROM_NAME || office.org_name || "Registrar Office",
    officeEmail:
      process.env.SMTP_FROM_EMAIL ||
      office.org_email ||
      process.env.SMTP_USER,
  });

  console.log(
    `Test ready-for-pickup email sent to ${appointment.studentEmail} for ${appointment.referenceNo}.`,
  );
}

main()
  .catch((error) => {
    console.error(`Test email failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
