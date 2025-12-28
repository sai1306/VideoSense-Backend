# Video Streaming Backend

## Overview
This is the backend for a Video Streaming Application, built with Node.js, Express, and MongoDB. It supports secure video uploads, processing (metadata extraction), and streaming.

## Features
- **Authentication**: JWT-based auth with RBAC (Viewer, Editor, Admin).
- **Video Management**: Upload, list, delete videos.
- **Video Processing**: Automatic duration extraction using FFmpeg.
- **Streaming**: HTTP Range requests for smooth video playback.
- **Real-time Updates**: Socket.io integration for processing progress.
- **Local Storage**: Videos are stored securely on the local server.

## Prerequisites
- Node.js (v14+)
- MongoDB (Atlas or Local)
- **FFmpeg**: Must be installed and available in the system PATH.

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file in the root directory:
   ```env
   PORT=4000
   MONGO_URI=your_mongodb_connection_string
   DB_NAME=StreamingDB
   JWT_SECRET=your_jwt_secret
   ```

3. **Start Server**
   ```bash
   # Development
   npm run dev

   # Production
   node app.js
   ```

## API Documentation

### Authentication
- **POST** `/auth/register` - Register a new user
  - Body: `{ email, password, role }`
- **POST** `/auth/login` - Login
  - Body: `{ email, password }`
- **GET** `/auth/me` - Get current user profile (Protected)

### Videos
*All video routes require Authentication.*

- **POST** `/api/videos/upload` - Upload a video (Editor/Admin only)
  - Form Data: `video` (file), `title`, `description`
- **GET** `/api/videos` - List videos (Scoped by user role)
- **GET** `/api/videos/:id` - Get video details
- **DELETE** `/api/videos/:id` - Delete video (Editor/Admin only)
- **GET** `/api/videos/stream/:id` - Stream video content
  - Query param: `?token=YOUR_JWT_TOKEN` (for easy browser integration)

## Architecture
- **Controllers**: Handle logic for Auth and Video operations.
- **Services**: `ProcessingService` handles async video tasks (FFmpeg).
- **Middleware**: `authMiddleware` for protecting routes and generic error handling.
- **Models**: Mongoose schemas for User and Video.

## Testing
Run the verification script to test the core flows:
```bash
node tests/test_api.js
```
