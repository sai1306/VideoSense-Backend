const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const API_URL = 'http://localhost:4000/api';
const AUTH_URL = 'http://localhost:4000/auth';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function register(email, role) {
    const res = await axios.post(`${AUTH_URL}/register`, {
        email,
        password: 'password123',
        role
    });
    return { token: res.data.token, id: res.data.user._id };
}

async function uploadVideo(token, title) {
    const form = new FormData();
    form.append('title', title);
    form.append('description', 'Test Description');
    const dummyPath = path.join(__dirname, 'dummy_test.mp4');
    fs.writeFileSync(dummyPath, 'fake content');
    form.append('video', fs.createReadStream(dummyPath));

    const res = await axios.post(`${API_URL}/videos/upload`, form, {
        headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${token}`
        }
    });
    fs.unlinkSync(dummyPath);
    return res.data._id;
}

async function runTests() {
    try {
        console.log('--- STARTING ROLE-BASED DELETION TESTS ---');

        // Setup Users
        const admin = await register(`admin_${Date.now()}@test.com`, 'admin');
        const editor1 = await register(`editor1_${Date.now()}@test.com`, 'editor');
        const editor2 = await register(`editor2_${Date.now()}@test.com`, 'editor');
        const reader = await register(`reader_${Date.now()}@test.com`, 'reader');

        // Editor 1 uploads a video
        const videoId = await uploadVideo(editor1.token, 'Editor 1 Video');
        console.log('✅ Video uploaded by Editor 1:', videoId);

        // 1. Reader tries to delete (Should fail - 403)
        console.log('\n[1] Reader attempting deletion...');
        try {
            await axios.delete(`${API_URL}/videos/${videoId}`, {
                headers: { Authorization: `Bearer ${reader.token}` }
            });
            console.error('❌ Error: Reader was allowed to delete!');
        } catch (e) {
            console.log('✅ Success: Reader deletion blocked:', e.response?.status);
        }

        // 2. Editor 2 (Not Owner) tries to delete (Should fail - 403)
        console.log('\n[2] Editor 2 (Non-Owner) attempting deletion...');
        try {
            await axios.delete(`${API_URL}/videos/${videoId}`, {
                headers: { Authorization: `Bearer ${editor2.token}` }
            });
            console.error('❌ Error: Editor 2 was allowed to delete Editor 1\'s video!');
        } catch (e) {
            console.log('✅ Success: Editor 2 deletion blocked:', e.response?.status);
        }

        // 3. Admin tries to delete (Should succeed - 200)
        console.log('\n[3] Admin attempting deletion...');
        try {
            const res = await axios.delete(`${API_URL}/videos/${videoId}`, {
                headers: { Authorization: `Bearer ${admin.token}` }
            });
            console.log('✅ Success: Admin deleted video:', res.status);
        } catch (e) {
            console.error('❌ Error: Admin was blocked from deletion:', e.response?.data || e.message);
        }

        // 4. Editor 1 uploads another video and deletes it (Should succeed - 200)
        const videoId2 = await uploadVideo(editor1.token, 'Editor 1 Second Video');
        console.log('\n[4] Editor 1 (Owner) attempting deletion of their own video...');
        try {
            const res = await axios.delete(`${API_URL}/videos/${videoId2}`, {
                headers: { Authorization: `Bearer ${editor1.token}` }
            });
            console.log('✅ Success: Editor 1 deleted own video:', res.status);
        } catch (e) {
            console.error('❌ Error: Editor 1 was blocked from deleting own video:', e.response?.data || e.message);
        }

        console.log('\n--- ALL ROLE-BASED TESTS COMPLETED ---');
    } catch (error) {
        console.error('Test script crashed:', error.message);
    }
}

runTests();
