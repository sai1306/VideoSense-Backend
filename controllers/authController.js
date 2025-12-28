const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const generateToken = (data) => {
    return jwt.sign({ id: data.id, role: data.role }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
    try {
        let { email, password, role } = req.body;

        if (!email || !password || !role) {
            return res.status(400).json({ message: 'Please add all fields' });
        }

        // Check if user exists
        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        password = await bcrypt.hash(password, salt);

        // Create user
        const user = await User.create({
            email,
            password,
            role: role || 'reader',
        });

        if (user) {
            res.status(201).json({
                user: {
                    _id: user.id,
                    email: user.email,
                    role: user.role,
                },
                token: generateToken({ id: user.id, role: user.role }),
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    const { email, password } = req.body;

    // Check for user email
    const user = await User.findOne({ email: email });    
    const matchPassword = await bcrypt.compare(password, user.password)
    if (user && matchPassword) {
        res.json({
            user: {
                _id: user.id,
                email: user.email,
                role: user.role,
            },
            token: generateToken(user),
        });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
};

// @desc    Get user data
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
    res.status(200).json(req.user);
};

module.exports = {
    registerUser,
    loginUser,
    getMe,
};
