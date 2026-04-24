const bcrypt = require("bcrypt");
const { query, queryOne, withTransaction } = require("../db");
const AppError = require("../utils/AppError");
const { signAuthToken } = require("../utils/jwt");
const { serializeUser } = require("../utils/serializers");
const { writeActivityLog } = require("../utils/audit");
const {
  normalizeEmail,
  normalizePassword,
  normalizePhone,
  normalizeRequiredString,
  normalizeStudentId,
  getRequestMeta,
} = require("../utils/validation");

function buildAuthPayload(userRow) {
  const user = serializeUser(userRow);

  return {
    user,
    role: user.role,
    token: signAuthToken(user),
  };
}

async function register(req, res) {
  const firstname = normalizeRequiredString(req.body.firstname, "Firstname", {
    minLength: 2,
    maxLength: 100,
  });
  const lastname = normalizeRequiredString(req.body.lastname, "Lastname", {
    minLength: 2,
    maxLength: 100,
  });
  const email = normalizeEmail(req.body.email);
  const phone = normalizePhone(req.body.phone);
  const studentId = normalizeStudentId(req.body.student_id);
  const password = normalizePassword(req.body.password);
  const meta = getRequestMeta(req);

  const userRow = await withTransaction(async (connection) => {
    const [duplicates] = await connection.execute(
      "SELECT id FROM users WHERE email = ? OR student_id = ? LIMIT 1",
      [email, studentId],
    );

    if (duplicates.length) {
      throw new AppError(
        "An account already exists with that email or student ID.",
        409,
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await connection.execute(
      `
        INSERT INTO users (
          firstname,
          lastname,
          email,
          phone,
          student_id,
          password_hash,
          role,
          account_status
        )
        VALUES (?, ?, ?, ?, ?, ?, 'student', 'active')
      `,
      [firstname, lastname, email, phone, studentId, passwordHash],
    );

    const user = {
      id: result.insertId,
      firstname,
      lastname,
      email,
      phone,
      student_id: studentId,
      role: "student",
      account_status: "active",
      created_at: new Date(),
    };

    await writeActivityLog(
      {
        userId: result.insertId,
        action: "REGISTER_SUCCESS",
        entityType: "user",
        entityId: result.insertId,
        description: "Student account registered successfully.",
        metadata: { email, studentId },
        ...meta,
      },
      connection,
    );

    return user;
  });

  res.status(201).json(buildAuthPayload(userRow));
}

async function login(req, res) {
  const email = normalizeEmail(req.body.email);
  const password = normalizePassword(req.body.password);
  const meta = getRequestMeta(req);

  const userRow = await queryOne(
    `
      SELECT
        id,
        firstname,
        lastname,
        email,
        phone,
        student_id,
        password_hash,
        role,
        account_status,
        created_at
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email],
  );

  if (!userRow) {
    await writeActivityLog({
      action: "FAILED LOGIN",
      entityType: "auth",
      entityId: null,
      description: "Login failed because the account does not exist.",
      metadata: { email, reason: "user_not_found" },
      ...meta,
    });

    throw new AppError("Invalid email or password.", 401);
  }

  if (userRow.account_status !== "active") {
    await writeActivityLog({
      userId: userRow.id,
      action: "FAILED LOGIN",
      entityType: "auth",
      entityId: userRow.id,
      description: "Login failed because the account is disabled.",
      metadata: { email, reason: "account_disabled" },
      ...meta,
    });

    throw new AppError("This account is currently disabled.", 403);
  }

  const passwordMatches = await bcrypt.compare(password, userRow.password_hash);

  if (!passwordMatches) {
    await writeActivityLog({
      userId: userRow.id,
      action: "FAILED LOGIN",
      entityType: "auth",
      entityId: userRow.id,
      description: "Login failed because the password was incorrect.",
      metadata: { email, reason: "invalid_password" },
      ...meta,
    });

    throw new AppError("Invalid email or password.", 401);
  }

  // Build login description based on role
  let loginDescription = "User logged in successfully.";
  if (userRow.role === "student") {
    loginDescription = `Student ${userRow.firstname} ${userRow.lastname} logged in successfully.`;
  } else if (userRow.role === "admin") {
    loginDescription = "System Administrator logged in successfully.";
  } else if (userRow.role === "registrar_head") {
    loginDescription = "Registrar Head logged in successfully.";
  } else if (userRow.role === "registrar_staff") {
    loginDescription = "Registrar Staff logged in successfully.";
  } else if (userRow.role === "cashier") {
    loginDescription = "Cashier logged in successfully.";
  }

  await writeActivityLog({
    userId: userRow.id,
    action: "LOGIN_SUCCESS",
    entityType: "auth",
    entityId: userRow.id,
    description: loginDescription,
    metadata: { email, role: userRow.role },
    ...meta,
  });

  res.json(buildAuthPayload(userRow));
}

async function me(req, res) {
  res.json({
    user: req.user,
    role: req.user.role,
  });
}

async function logout(req, res) {
  const meta = getRequestMeta(req);

  // Build logout description based on role
  let logoutDescription = "User logged out.";
  if (req.user.role === "student") {
    logoutDescription = `Student ${req.user.firstname} ${req.user.lastname} logged out.`;
  } else if (req.user.role === "admin") {
    logoutDescription = "System Administrator logged out.";
  } else if (req.user.role === "registrar_head") {
    logoutDescription = "Registrar Head logged out.";
  } else if (req.user.role === "registrar_staff") {
    logoutDescription = "Registrar Staff logged out.";
  } else if (req.user.role === "cashier") {
    logoutDescription = "Cashier logged out.";
  }

  await writeActivityLog({
    userId: req.user.id,
    action: "LOGOUT",
    entityType: "auth",
    entityId: req.user.id,
    description: logoutDescription,
    metadata: { email: req.user.email, role: req.user.role },
    ...meta,
  });

  res.json({ message: "Logged out successfully." });
}

module.exports = {
  register,
  login,
  me,
  logout,
};
