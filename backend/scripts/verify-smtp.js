const { verifyEmailTransport } = require("../services/email.service");

async function main() {
  await verifyEmailTransport();
  console.log("SMTP verification passed.");
}

main().catch((error) => {
  console.error(`SMTP verification failed: ${error.message}`);
  process.exit(1);
});
