const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { uploadPaymentProof } = require('../middlewares/upload.middleware');
const studentController = require('../controllers/student.controller');

const router = express.Router();

router.use(authenticate, authorize('student'));
router.get('/dashboard', asyncHandler(studentController.getDashboard));
router.get('/availability', asyncHandler(studentController.getAvailability));
router.post('/appointments', uploadPaymentProof, asyncHandler(studentController.createAppointment));
router.patch('/appointments/:id/cancel', asyncHandler(studentController.cancelAppointment));
router.post('/appointments/:id/payment', uploadPaymentProof, asyncHandler(studentController.submitPayment));

module.exports = router;
