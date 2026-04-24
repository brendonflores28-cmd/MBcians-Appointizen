const multer = require('multer');
const AppError = require('../utils/AppError');

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      cb(new AppError('Only JPG, PNG, or WEBP payment-proof images are allowed.', 400));
      return;
    }

    cb(null, true);
  },
});

module.exports = {
  uploadPaymentProof: upload.single('proofImage'),
};
