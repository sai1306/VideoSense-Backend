const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure directories exist
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Create unique filename: timestamp-originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter (Video only)
const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.mp4', '.mov', '.avi', '.mkv'];
    const allowedMimeTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];

    const ext = path.extname(file.originalname).toLowerCase();
    const isExtensionAllowed = allowedExtensions.includes(ext);
    const isMimeTypeAllowed = allowedMimeTypes.includes(file.mimetype);

    if (isExtensionAllowed && isMimeTypeAllowed) {
        cb(null, true);
    } else {
        cb(new Error(`Unsupported file format (${ext}). Allowed: ${allowedExtensions.join(', ')}`), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
    fileFilter: fileFilter
});

module.exports = upload;
