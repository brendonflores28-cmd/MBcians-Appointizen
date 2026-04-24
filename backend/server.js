const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { closePool, queryOne } = require("./db");
const { initSocketServer } = require("./sockets");
const { checkMaintenance } = require("./middlewares/maintenance.middleware");
const { notFound, errorHandler } = require("./middlewares/error.middleware");
const authRoutes = require("./routes/auth.routes");
const commonRoutes = require("./routes/common.routes");
const studentRoutes = require("./routes/student.routes");
const headRoutes = require("./routes/head.routes");
const staffRoutes = require("./routes/staff.routes");
const cashierRoutes = require("./routes/cashier.routes");
const adminRoutes = require("./routes/admin.routes");
const {
  APP_TIMEZONE,
  isAllowedOrigin,
  parseAllowedOrigins,
} = require("./utils/runtime");

function validateRequiredEnv() {
  const required = ["DB_HOST", "DB_USER", "DB_NAME", "JWT_SECRET"];
  const missing = required.filter(
    (key) => !String(process.env[key] || "").trim(),
  );

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

function resolveTrustProxy(value) {
  if (value === undefined || value === null || value === "") {
    return 1;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? 1 : parsed;
}

validateRequiredEnv();

const app = express();
const server = http.createServer(app);
const allowedOrigins = parseAllowedOrigins();

app.set("trust proxy", resolveTrustProxy(process.env.TRUST_PROXY));

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin not allowed."));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/health", async (req, res) => {
  const settings = await queryOne("SELECT id FROM settings WHERE id = 1");

  res.json({
    status: "ok",
    databaseReady: Boolean(settings),
    timestamp: new Date().toISOString(),
    timezone: APP_TIMEZONE,
    originsConfigured: allowedOrigins.length > 0,
  });
});

app.use("/api", checkMaintenance);
app.use("/api", authRoutes);
app.use("/api/common", commonRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/head", headRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/cashier", cashierRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler);

initSocketServer(server);

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, () => {
  console.log(`MBCIANS APPOINTIZEN backend is running on port ${PORT}`);
});

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}. Shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  server.close(async (serverError) => {
    try {
      await closePool();
    } catch (databaseError) {
      console.error("Failed to close database pool cleanly.", databaseError);
    }

    clearTimeout(forceExitTimer);
    process.exit(serverError ? 1 : 0);
  });
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  shutdown("uncaughtException");
});
