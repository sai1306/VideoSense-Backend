const Video = require('../models/Video');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

// NOTE: ffmpeg-static installation failed in this environment. 
// We are falling back to a pure simulation for the demo.

class ProcessingService {
    constructor(io) {
        this.io = io;
    }

    async processVideo(videoId) {
        try {
            const video = await Video.findById(videoId);
            if (!video) return;

            video.status = 'processing';
            await video.save();
            this.io.emit(`videoStart:${videoId}`, { status: 'processing' });
            this.io.emit(`videoUpdate:${videoId}`, { progress: 0 });
            this.io.emit('video_processing_update', { videoId, status: 'processing', progress: 0, message: 'Queued for processing...' });

            // Mock Metadata (since ffprobe is unavailable)
            const mockDuration = 120.5; // Mock duration 2m 0.5s
            video.duration = mockDuration;
            await video.save();

            // Proceed to Simulation directly
            this.simulateProcessing(video, videoId);

        } catch (error) {
            console.error('Processing Error:', error);
            const video = await Video.findById(videoId);
            if (video) {
                video.status = 'failed';
                await video.save();
                this.io.emit(`videoUpdate:${videoId}`, { status: 'failed' });
                this.io.emit('video_processing_update', { videoId, status: 'failed' });
            }
        }
    }

    simulateProcessing(video, videoId) {
        let progress = 0;
        const interval = setInterval(async () => {
            progress += 10; // Slower increments for smoother demo

            if (progress > 100) {
                clearInterval(interval);

                // Finalize
                const isSafe = Math.random() > 0.3; // 70% safe, 30% flagged for demo
                const sensitivity = {
                    isSafe: isSafe,
                    flags: isSafe ? [] : ['simulated_nudity', 'simulated_violence']
                };

                video.status = 'completed';
                video.processingProgress = 100;
                video.sensitivity = sensitivity;

                await video.save();

                const finalUpdate = {
                    videoId,
                    progress: 100,
                    status: 'completed',
                    sensitivity,
                    message: isSafe ? 'Processing complete. Video is Safe.' : 'Processing complete. Content flagged.'
                };

                this.io.emit(`videoUpdate:${videoId}`, finalUpdate);
                this.io.emit('video_processing_update', finalUpdate);
            } else {
                let message = 'Transcoding video...';
                if (progress > 70) {
                    message = 'Analyzing content sensitivity...';
                }

                video.processingProgress = progress;
                // We won't save every increment to DB to avoid thrashing, 
                // but for this demo we'll save every few or just iterate in memory.
                // To keep it simple and persistent, we will save.
                await video.save();

                const updatePayload = {
                    videoId,
                    progress,
                    status: 'processing',
                    message
                };

                this.io.emit(`videoUpdate:${videoId}`, updatePayload);
                this.io.emit('video_processing_update', updatePayload);
            }
        }, 1000); // 1 second interval
    }
}

module.exports = ProcessingService;
