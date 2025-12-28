const Video = require('../models/Video');
const ProcessingService = require('../services/processingService');
const fs = require('fs');
const path = require('path');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
});

// @desc    Upload a video
// @route   POST /api/videos/upload
// @access  Private (Editor, Admin)
const uploadVideo = async (req, res) => {
    const { title, description, category, visibility } = req.body;

    if (!title || title.trim() === '') {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ message: 'Title is required' });
    }

    if (!req.file) {
        return res.status(400).json({ message: 'Video file is required' });
    }

    try {
        // Upload to S3
        const fileStream = fs.createReadStream(req.file.path);
        const upload = new Upload({
            client: s3,
            params: {
                Bucket: process.env.AWS_BUCKET,
                Key: `videos/${Date.now()}_${req.file.filename}`,
                Body: fileStream,
                ContentType: req.file.mimetype
            }
        });

        const s3Result = await upload.done();

        // Delete local file
        fs.unlinkSync(req.file.path);

        const video = await Video.create({
            title: title || req.file.originalname,
            description,
            category: category || 'General',
            visibility: visibility || 'public',
            filename: req.file.filename,
            filepath: s3Result.Location, // S3 URL
            s3Key: s3Result.Key,
            uploader: req.user._id,
            size: req.file.size
        });

        // Start processing asynchronously
        const processingService = new ProcessingService(req.app.get('io'));
        processingService.processVideo(video._id);

        res.status(201).json(video);
    } catch (error) {
        console.error(error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, (err) => { if (err) console.error("File delete error", err); });
        }
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get all videos with advanced filtering
// @route   GET /api/videos
// @access  Private
const getVideos = async (req, res) => {
    try {
        let query = {};
        const {
            safetyStatus,
            category,
            startDate,
            endDate,
            minSize,
            maxSize,
            minDuration,
            maxDuration,
            myVideos
        } = req.query;

        // 1. Visibility & Permissions Logic
        if (req.user.role === 'admin') {
            // Admin sees all. 
            // Only filter by own videos if explicitly requested.
            if (myVideos === 'true') {
                query.uploader = req.user._id;
            }
        } else {
            // Regular User (Reader/Editor)
            if (myVideos === 'true') {
                // User wants to see ONLY their own videos (Public & Private)
                query.uploader = req.user._id;
            } else {
                // User sees ALL Public videos AND their own Private videos
                query.$or = [
                    { visibility: 'public' },
                    { uploader: req.user._id }
                ];
            }
        }

        // 2. Safety Status Filtering (safe/flagged)
        if (safetyStatus) {
            if (safetyStatus === 'safe') {
                query['sensitivity.isSafe'] = true;
            } else if (safetyStatus === 'flagged') {
                query['sensitivity.isSafe'] = false;
            }
            // 'all' or undefined ignores this filter
        }

        // 3. Category Filtering
        if (category && category !== 'All') {
            query.category = category;
        }

        // 4. Date Filtering
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // 5. Size Filtering (in bytes)
        if (minSize || maxSize) {
            query.size = {};
            if (minSize) query.size.$gte = Number(minSize);
            if (maxSize) query.size.$lte = Number(maxSize);
        }

        // 6. Duration Filtering (in seconds)
        if (minDuration || maxDuration) {
            query.duration = {};
            if (minDuration) query.duration.$gte = Number(minDuration);
            if (maxDuration) query.duration.$lte = Number(maxDuration);
        }

        const videos = await Video.find(query).sort({ createdAt: -1 }).populate('uploader', 'email role');
        res.json(videos);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get single video
// @route   GET /api/videos/:id
// @access  Private
const getVideoById = async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });

        const isOwner = video.uploader.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';
        const isPublic = video.visibility === 'public';

        if (!isPublic && !isOwner && !isAdmin) {
            return res.status(403).json({ message: 'Not authorized to view this private video' });
        }

        res.json(video);
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
}

// @desc    Stream video
// @route   GET /api/videos/stream/:id
// @access  Private
const streamVideo = async (req, res) => {
    const videoId = req.params.id;
    try {
        const video = await Video.findById(videoId);
        if (!video) return res.status(404).json({ message: 'Video not found' });

        const isOwner = video.uploader.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';
        const isPublic = video.visibility === 'public';

        if (!isPublic && !isOwner && !isAdmin) {
            return res.status(403).json({ message: 'Not authorized to view this private video' });
        }

        // Handle S3 Stream
        if (video.s3Key) {
            const command = new GetObjectCommand({
                Bucket: process.env.AWS_BUCKET,
                Key: video.s3Key,
                Range: req.headers.range
            });

            try {
                const { Body, ContentType, ContentLength, ContentRange } = await s3.send(command);

                const head = {
                    'Content-Type': ContentType,
                    'Content-Length': ContentLength,
                    'Accept-Ranges': 'bytes',
                };

                if (ContentRange) {
                    head['Content-Range'] = ContentRange;
                    res.writeHead(206, head);
                } else {
                    res.writeHead(200, head);
                }

                Body.pipe(res);
            } catch (s3Err) {
                console.error("S3 Stream Error:", s3Err);
                if (s3Err.name === 'NoSuchKey') {
                    return res.status(404).json({ message: 'File not found in storage' });
                }
                // Handle 416 Range Not Satisfiable from S3
                if (s3Err.$metadata && s3Err.$metadata.httpStatusCode === 416) {
                    return res.status(416).send('Requested range not satisfiable');
                }
                res.status(500).json({ message: 'Streaming Error' });
            }
            return;
        }

        // Fallback to Local Stream (Legacy)
        const path = video.filepath;

        if (!fs.existsSync(path)) {
            return res.status(404).json({ message: 'File not found on server' });
        }

        const stat = fs.statSync(path);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            if (start >= fileSize) {
                res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
                return;
            }

            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(path, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(200, head);
            fs.createReadStream(path).pipe(res);
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Delete video
// @route   DELETE /api/videos/:id
// @access  Private (Owner or Admin)
const deleteVideo = async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ message: 'Video not found' });

        if (req.user.role !== 'admin' && video.uploader.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        if (fs.existsSync(video.filepath)) {
            fs.unlinkSync(video.filepath);
        }

        await video.deleteOne();
        res.json({ message: 'Video removed' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
}

module.exports = {
    uploadVideo,
    getVideos,
    getVideoById,
    streamVideo,
    deleteVideo
};
