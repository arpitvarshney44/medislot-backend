const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Admin = require('../models/Admin');

/**
 * Protect routes - Verify JWT token and attach user to request
 */
const protect = async (req, res, next) => {
    try {
        let token;

        // Extract token from Authorization header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized. No token provided.',
            });
        }

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET, {
                issuer: 'medislot',
                audience: 'medislot-app',
            });
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Token expired. Please log in again.',
                    code: 'TOKEN_EXPIRED',
                });
            }
            return res.status(401).json({
                success: false,
                message: 'Invalid token. Please log in again.',
                code: 'INVALID_TOKEN',
            });
        }

        // Find user based on role
        let user;
        switch (decoded.role) {
            case 'patient':
                user = await User.findById(decoded.id);
                break;
            case 'doctor':
                user = await Doctor.findById(decoded.id);
                break;
            case 'admin':
                user = await Admin.findById(decoded.id);
                break;
            default:
                return res.status(401).json({
                    success: false,
                    message: 'Invalid token role.',
                });
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User belonging to this token no longer exists.',
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact support.',
            });
        }

        // Check if account is blocked (for patients and doctors)
        if (user.isBlocked) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been blocked. Please contact support.',
                reason: user.blockReason || '',
            });
        }

        // Attach user and role to request
        req.user = user;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error. Please try again.',
        });
    }
};

/**
 * Restrict to specific roles
 * @param  {...string} roles - Allowed roles ('patient', 'doctor', 'admin')
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.userRole || !roles.includes(req.userRole)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Role '${req.userRole}' is not authorized to access this resource.`,
            });
        }
        next();
    };
};

/**
 * Check specific admin permission
 * @param {string} module - Permission module name
 * @param {string} action - Permission action name
 */
const checkPermission = (module, action) => {
    return (req, res, next) => {
        if (req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin access required.',
            });
        }

        if (!req.user.hasPermission(module, action)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. You don't have permission to ${action} ${module}.`,
            });
        }
        next();
    };
};

/**
 * Optional auth - Attach user if token present, but don't require it
 */
const optionalAuth = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: 'medislot',
            audience: 'medislot-app',
        });

        let user;
        switch (decoded.role) {
            case 'patient':
                user = await User.findById(decoded.id);
                break;
            case 'doctor':
                user = await Doctor.findById(decoded.id);
                break;
            case 'admin':
                user = await Admin.findById(decoded.id);
                break;
        }

        if (user && user.isActive && !user.isBlocked) {
            req.user = user;
            req.userRole = decoded.role;
        }

        next();
    } catch (error) {
        // Token invalid or expired, continue without auth
        next();
    }
};

/**
 * Check if email is verified (for patients and doctors)
 */
const requireEmailVerification = (req, res, next) => {
    if (req.userRole === 'admin') return next(); // Admins don't need email verification

    if (!req.user.isEmailVerified) {
        return res.status(403).json({
            success: false,
            message: 'Please verify your email address before accessing this resource.',
            code: 'EMAIL_NOT_VERIFIED',
        });
    }
    next();
};

/**
 * Check if doctor is verified by admin
 */
const requireDoctorVerification = (req, res, next) => {
    if (req.userRole !== 'doctor') return next();

    if (req.user.verificationStatus !== 'approved') {
        return res.status(403).json({
            success: false,
            message: 'Your profile is not yet approved by admin. Please wait for verification.',
            code: 'DOCTOR_NOT_VERIFIED',
            verificationStatus: req.user.verificationStatus,
        });
    }
    next();
};

module.exports = {
    protect,
    authorize,
    checkPermission,
    optionalAuth,
    requireEmailVerification,
    requireDoctorVerification,
};
