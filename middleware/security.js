/**
 * Security & Compliance Middleware
 * HIPAA-aligned security headers, data encryption, audit logging
 */

const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');

// ─────────────────────────────────────────────────────────────
// Data Encryption (AES-256-GCM for PHI/PII at rest)
// ─────────────────────────────────────────────────────────────

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';

const encrypt = (text) => {
    if (!text) return text;
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

const decrypt = (encryptedText) => {
    if (!encryptedText || !encryptedText.includes(':')) return encryptedText;
    try {
        const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
        const key = Buffer.from(ENCRYPTION_KEY, 'hex');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error('Decryption failed:', error.message);
        return encryptedText;
    }
};

// ─────────────────────────────────────────────────────────────
// HIPAA Security Headers Middleware
// ─────────────────────────────────────────────────────────────

const hipaaHeaders = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=self, microphone=self, geolocation=self');
    next();
};

// ─────────────────────────────────────────────────────────────
// Data Access Audit Logger
// ─────────────────────────────────────────────────────────────

const auditLog = (action, module) => {
    return async (req, res, next) => {
        const originalJson = res.json.bind(res);
        res.json = function (body) {
            if (req.user) {
                AuditLog.create({
                    admin: req.user._id,
                    adminName: req.user.name || req.user.fullName || '',
                    adminRole: req.userRole || '',
                    action,
                    module,
                    description: `${req.userRole} ${action} on ${module}`,
                    ipAddress: req.ip || req.connection?.remoteAddress,
                    userAgent: req.headers['user-agent'],
                    method: req.method,
                    endpoint: req.originalUrl,
                    requestBody: sanitizeLogData(req.body),
                }).catch(err => console.error('Audit log error:', err.message));
            }
            return originalJson(body);
        };
        next();
    };
};

/**
 * Strip sensitive fields from log data
 */
const sanitizeLogData = (data) => {
    if (!data || typeof data !== 'object') return data;
    const sanitized = { ...data };
    const sensitiveFields = [
        'password', 'confirmPassword', 'newPassword', 'currentPassword',
        'token', 'refreshToken', 'creditCard', 'cvv', 'accountNumber', 'ifscCode',
        'razorpay_signature', 'razorpay_payment_id',
    ];
    for (const field of sensitiveFields) {
        if (sanitized[field]) sanitized[field] = '[REDACTED]';
    }
    return sanitized;
};

// ─────────────────────────────────────────────────────────────
// Request Sanitizer (prevent NoSQL injection)
// ─────────────────────────────────────────────────────────────

const sanitizeRequest = (req, res, next) => {
    const sanitize = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'string') {
                obj[key] = obj[key].replace(/\$[a-zA-Z]+/g, '');
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                if (key.startsWith('$')) {
                    delete obj[key];
                } else {
                    sanitize(obj[key]);
                }
            }
        }
        return obj;
    };

    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);
    next();
};

// ─────────────────────────────────────────────────────────────
// Session Timeout Middleware
// ─────────────────────────────────────────────────────────────

const sessionTimeout = (maxInactiveMinutes = 30) => {
    return (req, res, next) => {
        if (req.user && req.user.lastActivity) {
            const inactiveMs = Date.now() - new Date(req.user.lastActivity).getTime();
            if (inactiveMs > maxInactiveMinutes * 60 * 1000) {
                return res.status(401).json({
                    success: false,
                    message: 'Session expired due to inactivity. Please log in again.',
                    code: 'SESSION_TIMEOUT',
                });
            }
        }
        next();
    };
};

module.exports = {
    encrypt,
    decrypt,
    hipaaHeaders,
    auditLog,
    sanitizeRequest,
    sanitizeLogData,
    sessionTimeout,
};
