const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    category: {
        type: String,
        trim: true,
        default: 'General'
    },
    filename: {
        type: String,
        required: true
    },
    filepath: {
        type: String,
        required: true
    },
    s3Key: {
        type: String
    },
    uploader: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    size: {
        type: Number
    },
    duration: {
        type: Number // in seconds
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    visibility: {
        type: String,
        enum: ['public', 'private'],
        default: 'public'
    },
    sensitivity: {
        isSafe: {
            type: Boolean,
            default: null // null: not analyzed, true: safe, false: flagged
        },
        flags: [String] // e.g., ['violence', 'nudity']
    },
    processingProgress: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Video', videoSchema);
