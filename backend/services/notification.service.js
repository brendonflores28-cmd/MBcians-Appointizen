const { query } = require('../db');
const { SOCKET_EVENTS } = require('../utils/constants');
const { getIO } = require('../sockets');

async function fetchRows(executor, sql, params = []) {
  if (executor) {
    const [rows] = await executor.execute(sql, params);
    return rows;
  }

  return query(sql, params);
}

function emitToRecipients(eventName, payload, { roles = [], userIds = [] } = {}) {
  const io = getIO();

  if (!io) {
    return;
  }

  const rooms = [
    ...roles.filter(Boolean).map((role) => `role:${role}`),
    ...userIds.filter(Boolean).map((userId) => `user:${userId}`),
  ];
  const uniqueRooms = [...new Set(rooms)];

  if (!uniqueRooms.length) {
    return;
  }

  let broadcaster = io;
  uniqueRooms.forEach((room) => {
    broadcaster = broadcaster.to(room);
  });

  broadcaster.emit(eventName, payload);
}

function queueDeferredSocketEmit(executor, eventName, payload, recipients = {}) {
  if (!executor || !Array.isArray(executor.__deferredSocketEvents)) {
    emitToRecipients(eventName, payload, recipients);
    return;
  }

  executor.__deferredSocketEvents.push({
    eventName,
    payload,
    recipients,
  });
}

function flushDeferredSocketEvents(executor) {
  if (!executor || !Array.isArray(executor.__deferredSocketEvents)) {
    return;
  }

  const queuedEvents = [...executor.__deferredSocketEvents];
  executor.__deferredSocketEvents = [];

  queuedEvents.forEach(({ eventName, payload, recipients }) => {
    emitToRecipients(eventName, payload, recipients);
  });
}

async function resolveUserIdsByRoles(roles, executor = null) {
  if (!roles.length) {
    return [];
  }

  const placeholders = roles.map(() => '?').join(', ');
  const rows = await fetchRows(
    executor,
    `SELECT id FROM users WHERE role IN (${placeholders}) AND account_status = 'active'`,
    roles
  );

  return rows.map((row) => row.id);
}

async function createNotifications({ userIds, title, message, type = 'info', referenceType = null, referenceId = null }, executor = null) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

  if (!uniqueUserIds.length) {
    return [];
  }

  const placeholders = uniqueUserIds.map(() => '(?, ?, ?, ?, ?, ?, 0)').join(', ');
  const params = [];

  uniqueUserIds.forEach((userId) => {
    params.push(userId, title, message, type, referenceType, referenceId);
  });

  if (executor) {
    await executor.execute(
      `
        INSERT INTO notifications (
          user_id,
          title,
          message,
          type,
          reference_type,
          reference_id,
          is_read
        )
        VALUES ${placeholders}
      `,
      params
    );
  } else {
    await query(
      `
        INSERT INTO notifications (
          user_id,
          title,
          message,
          type,
          reference_type,
          reference_id,
          is_read
        )
        VALUES ${placeholders}
      `,
      params
    );
  }

  uniqueUserIds.forEach((userId) => {
    queueDeferredSocketEmit(
      executor,
      SOCKET_EVENTS.NOTIFICATION,
      {
        title,
        message,
        type,
        referenceType,
        referenceId,
      },
      { userIds: [userId] }
    );
  });

  return uniqueUserIds;
}

async function notifyRoles(payload, roles, executor = null) {
  const userIds = await resolveUserIdsByRoles(roles, executor);
  return createNotifications({ ...payload, userIds }, executor);
}

async function notifyUser(payload, userId, executor = null) {
  return createNotifications({ ...payload, userIds: [userId] }, executor);
}

module.exports = {
  emitToRecipients,
  flushDeferredSocketEvents,
  resolveUserIdsByRoles,
  createNotifications,
  notifyRoles,
  notifyUser,
};
