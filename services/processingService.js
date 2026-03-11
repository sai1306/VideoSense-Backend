const Video = require('../models/Video');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const fs = require('fs');
const path = require('path');
const tf = require('@tensorflow/tfjs');
const nsfw = require('nsfwjs');
const jpeg = require('jpeg-js');

// Set ffmpeg paths to the static binaries
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

let nsfwModel = null;

class ProcessingService {
    constructor(io) {
        this.io = io;
    }

    async loadModel() {
        if (!nsfwModel) {
            console.log('Loading NSFW model...');
            nsfwModel = await nsfw.load();
            console.log('NSFW model loaded');
        }
        return nsfwModel;
    }

    async analyzeSensitivity(filePath) {
        try {
            console.log(`Starting sensitivity analysis for: ${filePath}`);
            const tempFramePath = path.resolve(path.dirname(filePath), `temp_frame_${Date.now()}.jpg`);

            // Extract a frame at the middle of the video
            await new Promise((resolve, reject) => {
                ffmpeg(filePath)
                    .screenshots({
                        timestamps: ['50%'],
                        filename: path.basename(tempFramePath),
                        folder: path.dirname(tempFramePath),
                        size: '320x?'
                    })
                    .on('end', () => {
                        // ffmpeg screenshots might append -1 to the filename
                        // we need to check both the requested path and the one with -1
                        const possiblePath = tempFramePath;
                        const alternativePath = tempFramePath.replace('.jpg', '_1.jpg'); // fluent-ffmpeg often does this
``
                        if (!fs.existsSync(possiblePath) && fs.existsSync(alternativePath)) {
                            fs.renameSync(alternativePath, possiblePath);
                        }
                        resolve();
                    })
                    .on('error', (err) => {
                        console.error('Ffmpeg screenshot error:', err);
                        reject(err);
                    });
            });

            if (!fs.existsSync(tempFramePath)) {
                console.error('Frame extraction failed, file not found:', tempFramePath);
                return { isSafe: true, flags: ['analysis_skipped'] };
            }

            const model = await this.loadModel();
            const imageBuffer = fs.readFileSync(tempFramePath);
            const uint8array = new Uint8Array(imageBuffer);
            const image = jpeg.decode(uint8array, { useTArray: true });

            const numChannels = 3;
            const numPixels = image.width * image.height;
            const values = new Int32Array(numPixels * numChannels);

            for (let i = 0; i < numPixels; i++) {
                for (let c = 0; c < numChannels; c++) {
                    values[i * numChannels + c] = image.data[i * 4 + c];
                }
            }

            const tensor = tf.tensor3d(values, [image.height, image.width, numChannels], 'int32');
            const predictions = await model.classify(tensor);
            tensor.dispose();

            // Cleanup temp frame
            fs.unlinkSync(tempFramePath);

            console.log('Sensitivity predictions:', predictions);

            let isSafe = true;
            let flags = [];
            // Interpret predictions: Below classnames are not safe. Sexy > 0.8 is also unsafe.
            predictions.forEach(p => {
                if ((p.className === 'Porn' || p.className === 'Hentai') && p.probability > 0.3) {
                    isSafe = false;
                    flags.push(p.className.toLowerCase());
                }
                if (p.className === 'Sexy' && p.probability > 0.7) {
                    isSafe = false;
                    flags.push('suggestive');
                }
            });

            return { isSafe, flags };
        } catch (error) {
            console.error('Sensitivity Analysis Error:', error);
            return { isSafe: true, flags: ['analysis_error'] };
        }
    }

    async processVideo(videoId, localPath = null) {
        const emitUpdate = async (progress, message, status = 'processing', sensitivity = null) => {
            const video = await Video.findById(videoId);
            if (!video) return;
            video.status = status;
            video.processingProgress = progress;
            if (sensitivity) video.sensitivity = sensitivity;
            await video.save();

            const payload = { videoId, progress, status, message, sensitivity };
            this.io.emit(`videoUpdate:${videoId}`, payload);
            this.io.emit('video_processing_update', payload);
        };

        try {
            const video = await Video.findById(videoId);
            if (!video) return;

            await emitUpdate(0, 'Initializing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               ...');

            // Resolve the local file path
            const filePath = localPath ? path.resolve(localPath) : path.resolve('uploads', video.filename);

            if (!fs.existsSync(filePath)) {
                console.error(`File not found: ${filePath}`);
                throw new Error('Video file not found for processing');
            }

            // Step 1: Metadata Extraction
            await emitUpdate(20, 'Extracting video metadata...');
            try {
                const metadata = await new Promise((resolve, reject) => {
                    ffmpeg.ffprobe(filePath, (err, data) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });
                const videoUpdate = await Video.findById(videoId);
                videoUpdate.duration = metadata.format.duration;
                await videoUpdate.save();
            } catch (metadataError) {
                console.error('Metadata extraction error:', metadataError);
            }

            // Step 2: Content Sensitivity Analysis
            await emitUpdate(50, 'Analyzing visual content for sensitivity...');
            const sensitivity = await this.analyzeSensitivity(filePath);

            // Step 3: Finalizing
            await emitUpdate(90, 'Finalizing results...');

            // Cleanup local file
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Step 4: Complete
            const finalMessage = sensitivity.isSafe ? 'Processing complete. Video is Safe.' : 'Processing complete. Content flagged.';
            await emitUpdate(100, finalMessage, 'completed', sensitivity);

        } catch (error) {
            console.error('Processing Error:', error);
            const video = await Video.findById(videoId);
            if (video) {
                video.status = 'failed';
                await video.save();
                this.io.emit(`videoUpdate:${videoId}`, { status: 'failed', message: error.message });
                this.io.emit('video_processing_update', { videoId, status: 'failed', message: error.message });
            }

            // Cleanup local file even on error if it exists
            const filePath = localPath ? path.resolve(localPath) : null;
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    }
}

module.exports = ProcessingService;
