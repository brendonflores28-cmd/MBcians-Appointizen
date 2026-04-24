const { queryOne } = require('../db');
const AppError = require('../utils/AppError');
const { verifyAuthToken } = require('../utils/jwt');
const { serializeUser } = require('../utils/serializers');

async function authenticate(req, res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

    if (!token) {
      throw new AppError('Authentication required.', 401);
    }

    const payload = verifyAuthToken(token);
    const userRow = await queryOne(
      `
        SELECT id, firstname, lastname, email, phone, student_id, role, account_status, created_at
        FROM users
        WHERE id = ?
      `,
      [payload.sub]
    );

    if (!userRow || userRow.account_status !== 'active') {
      throw new AppError('Your session is no longer valid.', 401);
    }

    req.user = serializeUser(userRow);
    req.tokenPayload = payload;
    next();
  } catch (error) {
    next(error.isOperational ? error : new AppError('Invalid or expired token.', 401));
  }
}

function authorize(...roles) {
  return function authorizeRole(req, res, next) {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have access to this resource.', 403));
    }

    return next();
  };
}

module.exports = {
  authenticate,
  authorize,
};
