// tests/test_api.js
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const API_URL = 'http://localhost:4000/api';
const AUTH_URL = 'http://localhost:4000/auth';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTests() {
    try {
        console.log('--- STARTING TESTS ---');

        // 1. Register User (Admin)
        console.log('\n[1] Registering Admin...');
        const email = `admin_${Date.now()}@test.com`;
        const password = 'password123';
        let token;
        let userId;

        try {
            const regRes = await axios.post(`${AUTH_URL}/register`, {
                email,
                password,
                role: 'admin'
            });
            token = regRes.data.token;
            userId = regRes.data.user._id;
            console.log('✅ Admin Registered:', email);
        } catch (e) {
            console.error('❌ Registration Failed:', e.response?.data || e.message);
            return;
        }

        // 2. Upload Video
        console.log('\n[2] Uploading Video...');
        const form = new FormData();
        form.append('title', 'Test Video');
        form.append('description', 'This is a test');
        // Create dummy video file
        const dummyPath = path.join(__dirname, 'dummy.mp4');
        if (!fs.existsSync(dummyPath)) {
            // Create a text file masquerading as mp4 for simple upload testing if no real video
            // BUT ffmpeg will fail. We need a real video or mock ffmpeg.
            // For now, let's assume the user puts a file there or we just fail processing.
            // Let's create a tiny text file and name it .mp4 just to test upload mechanism,
            // knowing that FFmpeg might log an error but not crash the server.
            fs.writeFileSync(dummyPath, 'fake video content');
        }

        form.append('video', fs.createReadStream(dummyPath));

        let videoId;
        try {
            const uploadRes = await axios.post(`${API_URL}/videos/upload`, form, {
                headers: {
                    ...form.getHeaders(),
                    Authorization: `Bearer ${token}`
                }
            });
            videoId = uploadRes.data._id;
            console.log('✅ Video Uploaded. ID:', videoId);
        } catch (e) {
            console.error('❌ Upload Failed:', e.response?.data || e.message);
            // clean up
            if (fs.existsSync(dummyPath)) fs.unlinkSync(dummyPath);
            return;
        }

        // 3. Check Processing (Poll)
        console.log('\n[3] Polling Processing Status...');
        for (let i = 0; i < 5; i++) {
            await sleep(1000);
            const statusRes = await axios.get(`${API_URL}/videos/${videoId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log(`   Status: ${statusRes.data.status}`);
            if (statusRes.data.status !== 'pending') break;
        }

        // 4. Test Stream (Headers)
        console.log('\n[4] Testing Stream Endpoint...');
        try {
            // Streaming usually doesn't auth via header in <video>, but we test the endpoint directly
            const streamRes = await axios.get(`${API_URL}/videos/stream/${videoId}?token=${token}`, {
                responseType: 'stream'
            });
            console.log('✅ Stream Request Allowed (header/query)');
        } catch (e) {
            console.error('❌ Stream Failed:', e.response?.status, e.response?.data);
        }

        // 5. Delete Video
        console.log('\n[5] Deleting Video...');
        try {
            await axios.delete(`${API_URL}/videos/${videoId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('✅ Video Deleted');
        } catch (e) {
            console.error('❌ Delete Failed:', e.response?.data || e.message);
        }

        // Clean up dummy
        if (fs.existsSync(dummyPath)) fs.unlinkSync(dummyPath);

        console.log('\n--- TESTS COMPLETED ---');

    } catch (error) {
        console.error('Test Suite Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', typeof error.response.data === 'string' ? error.response.data.substring(0, 500) : JSON.stringify(error.response.data));
        }
    }
}

runTests();
