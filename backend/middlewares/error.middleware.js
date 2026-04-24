const { MulterError } = require('multer');
const AppError = require('../utils/AppError');

function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof MulterError) {
    return res.status(400).json({
      message: error.code === 'LIMIT_FILE_SIZE' ? 'Uploaded file is too large.' : error.message,
    });
  }

  const statusCode = error.statusCode || 500;
  const message = error.isOperational ? error.message : 'An unexpected server error occurred.';

  if (!error.isOperational) {
    console.error(error);
  }

  return res.status(statusCode).json({
    message,
    details: error.details || null,
  });
}

module.exports = {
  notFound,
  errorHandler,
};
