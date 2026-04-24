const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate, authorize } = require("../middlewares/auth.middleware");
const adminController = require("../controllers/admin.controller");

const router = express.Router();

router.use(authenticate, authorize("admin"));
router.get("/dashboard", asyncHandler(adminController.getDashboard));
router.post(
  "/document-types",
  asyncHandler(adminController.createDocumentType),
);
router.put(
  "/document-types/:id",
  asyncHandler(adminController.updateDocumentType),
);
router.delete(
  "/document-types/:id",
  asyncHandler(adminController.deleteDocumentType),
);
router.post("/time-slots", asyncHandler(adminController.createTimeSlot));
router.delete("/time-slots/:id", asyncHandler(adminController.deleteTimeSlot));
router.post("/blocked-dates", asyncHandler(adminController.createBlockedDate));
router.delete(
  "/blocked-dates/:id",
  asyncHandler(adminController.deleteBlockedDate),
);
router.get("/users", asyncHandler(adminController.getUsers));
router.delete("/users/:id", asyncHandler(adminController.removeUser));
router.put("/settings", asyncHandler(adminController.updateSettings));
router.patch(
  "/appointments/:id/status",
  asyncHandler(adminController.updateAppointmentStatus),
);

module.exports = router;
