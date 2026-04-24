const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const cashierController = require('../controllers/cashier.controller');

const router = express.Router();

router.use(authenticate, authorize('cashier'));
router.get('/dashboard', asyncHandler(cashierController.getDashboard));
router.patch('/payments/:id/approve', asyncHandler(cashierController.approvePayment));
router.patch('/payments/:id/reject', asyncHandler(cashierController.rejectPayment));

module.exports = router;
