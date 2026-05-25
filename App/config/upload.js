const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const userId = req.session && req.session.user ? req.session.user.UserID : 'anon';
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${userId}${ext}`);
  }
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
  if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, and PDF files are allowed.'));
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// Wraps upload.single so multer errors reach the route handler via req.uploadError
const handleUpload = field => (req, res, next) => {
  upload.single(field)(req, res, err => {
    if (err instanceof multer.MulterError) {
      req.uploadError = err.code === 'LIMIT_FILE_SIZE'
        ? 'File must be under 5 MB.'
        : err.message;
    } else if (err) {
      req.uploadError = err.message;
    }
    next();
  });
};

module.exports = { handleUpload };
