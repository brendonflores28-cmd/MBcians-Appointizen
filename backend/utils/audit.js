const { query } = require('../db');

async function writeActivityLog(payload, connection = null) {
  const runner = connection
    ? async (sql, params) => connection.execute(sql, params)
    : async (sql, params) => query(sql, params);

  const metadata = payload.metadata ? JSON.stringify(payload.metadata) : null;

  await runner(
    `
      INSERT INTO activity_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        description,
        metadata,
        ip_address,
        user_agent
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.userId || null,
      payload.action,
      payload.entityType || null,
      payload.entityId || null,
      payload.description,
      metadata,
      payload.ipAddress || null,
      payload.userAgent || null,
    ]
  );
}

module.exports = {
  writeActivityLog,
};
