const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// ---------------------------------------------------------------------------
// Socket.IO for WebRTC Signaling
// ---------------------------------------------------------------------------
const io = new Server(server, {
    cors: {
        origin: [
            process.env.ADMIN_PANEL_URL || 'http://localhost:5173',
            'http://localhost:3000',
            'http://localhost:8081',
        ],
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Initialize WebRTC signaling
const { setupWebRTC } = require('./utils/webrtc');
setupWebRTC(io);

// ---------------------------------------------------------------------------
// Security Middleware
// ---------------------------------------------------------------------------
app.use(helmet());

const { hipaaHeaders, sanitizeRequest } = require('./middleware/security');
app.use(hipaaHeaders);
app.use(sanitizeRequest);

// CORS Configuration
const corsOptions = {
    origin: [
        process.env.ADMIN_PANEL_URL || 'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:8081',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
app.use(cors(corsOptions));

// Rate Limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests, please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many auth attempts, please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', generalLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/doctor/auth/', authLimiter);
app.use('/api/admin/auth/', authLimiter);

// ---------------------------------------------------------------------------
// Body Parsing & Logging
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
const authRoutes = require('./routes/authRoutes');
const doctorAuthRoutes = require('./routes/doctorAuthRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const adminRoutes = require('./routes/adminRoutes');
const patientRoutes = require('./routes/patientRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/doctor/auth', doctorAuthRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/payments', paymentRoutes);

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Medi Slot API is running',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        features: {
            webrtc: true,
            payments: !!process.env.RAZORPAY_KEY_ID,
            pushNotifications: !!process.env.FIREBASE_PROJECT_ID,
            sms: !!process.env.TWILIO_ACCOUNT_SID,
        },
    });
});

// ---------------------------------------------------------------------------
// 404 Handler
// ---------------------------------------------------------------------------
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ---------------------------------------------------------------------------
// Global Error Handler
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);

    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    if (err.code === 11000) {
        statusCode = 400;
        const field = Object.keys(err.keyValue)[0];
        message = `An account with this ${field} already exists.`;
    }
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = Object.values(err.errors).map((val) => val.message).join('. ');
    }
    if (err.name === 'JsonWebTokenError') { statusCode = 401; message = 'Invalid token.'; }
    if (err.name === 'TokenExpiredError') { statusCode = 401; message = 'Token expired.'; }

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`\n🚀 Medi Slot Server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 API Base URL: http://localhost:${PORT}/api`);
    console.log(`📹 WebRTC Signaling: ws://localhost:${PORT}/video`);
    console.log(`❤️  Health Check: http://localhost:${PORT}/api/health\n`);
});

module.exports = { app, server, io };
