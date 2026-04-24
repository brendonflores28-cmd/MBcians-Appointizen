const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middlewares/auth.middleware');
const commonController = require('../controllers/common.controller');

const router = express.Router();

router.use(authenticate);
router.get('/notifications', asyncHandler(commonController.getNotifications));
router.patch('/notifications/:id/read', asyncHandler(commonController.markNotificationRead));
router.patch('/notifications/read-all', asyncHandler(commonController.markAllNotificationsRead));

module.exports = router;
