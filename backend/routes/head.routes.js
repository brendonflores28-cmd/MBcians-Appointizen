const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const headController = require('../controllers/head.controller');

const router = express.Router();

router.use(authenticate, authorize('registrar_head'));
router.get('/dashboard', asyncHandler(headController.getDashboard));
router.get('/search', asyncHandler(headController.searchAppointments));
router.patch('/appointments/:id/approve', asyncHandler(headController.approveAppointment));
router.patch('/appointments/:id/reject', asyncHandler(headController.rejectAppointment));
router.patch('/appointments/:id/assign', asyncHandler(headController.assignStaff));

module.exports = router;
