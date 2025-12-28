const express = require('express');
const router = express.Router();
const {
  uploadVideo,
  getVideos,
  getVideoById,
  streamVideo,
  deleteVideo
} = require('../controllers/videoController');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../utilities/multerConfig');

// Protected Routes
router.post('/upload', protect, authorize('editor', 'admin'), (req, res, next) => {
  upload.single('video')(req, res, (err) => {
    if (err) {
      if (err instanceof require('multer').MulterError) {
        return res.status(400).json({ message: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ message: err.message });
      }
    }
    next();
  });
}, uploadVideo);
router.get('/', protect, getVideos);
router.get('/:id', protect, getVideoById);
router.delete('/:id', protect, authorize('editor', 'admin'), deleteVideo);

// Stream Route (protected likely via query param handled in controller/middleware)
router.get('/stream/:id', protect, streamVideo);

module.exports = router;
