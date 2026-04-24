const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authController = require("../controllers/auth.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const { loginLimiter, registerLimiter } = require("../middlewares/rateLimit.middleware");

const router = express.Router();

router.post("/login", loginLimiter, asyncHandler(authController.login));
router.post("/register", registerLimiter, asyncHandler(authController.register));
router.get("/me", authenticate, asyncHandler(authController.me));
router.post("/logout", authenticate, asyncHandler(authController.logout));

module.exports = router;
