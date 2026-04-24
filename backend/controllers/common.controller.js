const { query } = require('../db');
const { serializeNotification } = require('../utils/serializers');

async function getNotifications(req, res) {
  const rows = await query(
    `
      SELECT *
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 25
    `,
    [req.user.id]
  );

  res.json({
    notifications: rows.map(serializeNotification),
  });
}

async function markNotificationRead(req, res) {
  await query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ success: true });
}

async function markAllNotificationsRead(req, res) {
  await query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ success: true });
}

module.exports = {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
