const rateLimit = require("express-rate-limit");

function createJsonRateLimiter({
  windowMs,
  limit,
  message,
  details,
}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS",
    handler: (req, res) => {
      res.status(429).json({
        message,
        details,
      });
    },
  });
}

const loginLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: "Too many login attempts. Please try again later.",
  details: "Login rate limit exceeded. Try again in a few minutes.",
});

const registerLimiter = createJsonRateLimiter({
  windowMs: 30 * 60 * 1000,
  limit: 10,
  message: "Too many registration attempts. Please try again later.",
  details: "Registration rate limit exceeded. Try again in a few minutes.",
});

module.exports = {
  loginLimiter,
  registerLimiter,
};
