const { queryOne } = require("../db");
const AppError = require("../utils/AppError");
const { verifyAuthToken } = require("../utils/jwt");

let cachedMaintenanceState = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5000; // Cache for 5 seconds

async function checkMaintenance(req, res, next) {
  try {
    // Check if this is an auth endpoint - always allow
    const isAuthEndpoint = req.path === "/login" || req.path === "/register";
    if (isAuthEndpoint) {
      return next();
    }

    // Get maintenance state (with caching to reduce DB queries)
    let maintenanceEnabled = false;
    const now = Date.now();

    if (cachedMaintenanceState !== null && now - cacheTimestamp < CACHE_DURATION) {
      maintenanceEnabled = cachedMaintenanceState;
    } else {
      const settings = await queryOne(
        "SELECT maintenance_mode FROM settings WHERE id = 1",
      );
      maintenanceEnabled = settings && Boolean(settings.maintenance_mode);
      cachedMaintenanceState = maintenanceEnabled;
      cacheTimestamp = now;
    }

    // If maintenance is not enabled, proceed normally
    if (!maintenanceEnabled) {
      return next();
    }

    // Check if user is authenticated and is admin
    let isAdmin = false;
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;

    if (token) {
      try {
        const payload = verifyAuthToken(token);
        const userRow = await queryOne(
          "SELECT role FROM users WHERE id = ? AND account_status = ?",
          [payload.sub, "active"],
        );
        isAdmin = userRow && userRow.role === "admin";
      } catch (error) {
        // Token verification failed, user is not authenticated
        isAdmin = false;
      }
    }

    // If user is admin, allow access
    if (isAdmin) {
      return next();
    }

    // Block all other users/routes during maintenance
    throw new AppError(
      "The system is currently under scheduled maintenance. We sincerely apologize for any inconvenience. Please try again shortly.",
      503,
    );
  } catch (error) {
    next(
      error.isOperational
        ? error
        : new AppError("System maintenance check failed.", 500),
    );
  }
}

// Function to invalidate cache when settings change
function invalidateMaintenanceCache() {
  cachedMaintenanceState = null;
  cacheTimestamp = 0;
}

module.exports = {
  checkMaintenance,
  invalidateMaintenanceCache,
};
