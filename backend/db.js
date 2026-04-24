const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  namedPlaceholders: false,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 10000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function withTransaction(handler) {
  const connection = await pool.getConnection();
  connection.__deferredSocketEvents = [];

  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();

    try {
      require("./services/notification.service").flushDeferredSocketEvents(connection);
    } catch (socketError) {
      console.error("Failed to flush deferred socket events after commit.", socketError);
    }

    return result;
  } catch (error) {
    connection.__deferredSocketEvents = [];
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  queryOne,
  withTransaction,
  closePool,
};
