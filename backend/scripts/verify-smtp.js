const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { verifyEmailTransport } = require("../services/email.service");

async function main() {
  await verifyEmailTransport();
  console.log("SMTP verification passed.");
}

main().catch((error) => {
  console.error(`SMTP verification failed: ${error.message}`);
  process.exit(1);
});
