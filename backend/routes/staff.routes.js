const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const staffController = require('../controllers/staff.controller');

const router = express.Router();

router.use(authenticate, authorize('registrar_staff'));
router.get('/dashboard', asyncHandler(staffController.getDashboard));
router.patch('/appointments/:id/status', asyncHandler(staffController.updateAppointmentStatus));

module.exports = router;
