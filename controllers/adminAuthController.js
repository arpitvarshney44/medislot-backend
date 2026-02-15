const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const Admin = require('../models/Admin');
const { generateTokenPair } = require('../utils/generateToken');
const { sendPasswordResetEmail } = require('../utils/sendEmail');

// ---------------------------------------------------------------------------
// @desc    Admin login
// @route   POST /api/admin/auth/login
// @access  Public
// ---------------------------------------------------------------------------
const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const admin = await Admin.findOne({ email: email.toLowerCase() }).select('+password +twoFactorSecret');

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            });
        }

        if (!admin.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Your admin account has been deactivated.',
            });
        }

        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            // Record failed login
            admin.recordLogin(req.ip, req.headers['user-agent'] || '', false);
            await admin.save({ validateBeforeSave: false });

            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            });
        }

        // Check if 2FA is enabled
        if (admin.twoFactorEnabled) {
            return res.status(200).json({
                success: true,
                message: 'Two-factor authentication required.',
                data: {
                    requiresTwoFactor: true,
                    email: admin.email,
                },
            });
        }

        // Record successful login
        admin.recordLogin(req.ip, req.headers['user-agent'] || '', true);

        // Generate tokens
        const { accessToken, refreshToken } = generateTokenPair(admin._id, 'admin');
        admin.refreshToken = refreshToken;
        await admin.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: 'Login successful!',
            data: {
                admin: admin.toSafeObject(),
                accessToken,
                refreshToken,
            },
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ success: false, message: 'Login failed.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Verify 2FA token and complete login
// @route   POST /api/admin/auth/verify-2fa
// @access  Public
// ---------------------------------------------------------------------------
const verify2FALogin = async (req, res) => {
    try {
        const { email, token } = req.body;

        const admin = await Admin.findOne({ email: email.toLowerCase() }).select('+twoFactorSecret +twoFactorBackupCodes');

        if (!admin) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        // Try TOTP verification
        const isValid = speakeasy.totp.verify({
            secret: admin.twoFactorSecret,
            encoding: 'base32',
            token: token,
            window: 2,
        });

        // Try backup codes if TOTP fails
        let usedBackupCode = false;
        if (!isValid) {
            const backupIndex = admin.twoFactorBackupCodes.indexOf(token);
            if (backupIndex === -1) {
                return res.status(401).json({ success: false, message: 'Invalid 2FA token.' });
            }
            // Remove used backup code
            admin.twoFactorBackupCodes.splice(backupIndex, 1);
            usedBackupCode = true;
        }

        // Record login
        admin.recordLogin(req.ip, req.headers['user-agent'] || '', true);

        // Generate tokens
        const { accessToken, refreshToken } = generateTokenPair(admin._id, 'admin');
        admin.refreshToken = refreshToken;
        await admin.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: usedBackupCode
                ? 'Login successful! A backup code was used. Please generate new ones if running low.'
                : 'Login successful!',
            data: {
                admin: admin.toSafeObject(),
                accessToken,
                refreshToken,
                remainingBackupCodes: usedBackupCode ? admin.twoFactorBackupCodes.length : undefined,
            },
        });
    } catch (error) {
        console.error('2FA verification error:', error);
        res.status(500).json({ success: false, message: '2FA verification failed.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Setup 2FA - Generate secret and QR code
// @route   POST /api/admin/auth/setup-2fa
// @access  Private (Admin)
// ---------------------------------------------------------------------------
const setup2FA = async (req, res) => {
    try {
        const admin = await Admin.findById(req.user._id);

        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found.' });
        }

        if (admin.twoFactorEnabled) {
            return res.status(400).json({ success: false, message: '2FA is already enabled.' });
        }

        // Generate secret
        const secret = speakeasy.generateSecret({
            name: `Medi Slot Admin (${admin.email})`,
            issuer: 'Medi Slot',
            length: 32,
        });

        // Generate QR code
        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

        // Generate backup codes
        const backupCodes = [];
        for (let i = 0; i < 10; i++) {
            backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
        }

        // Save secret temporarily (not enabled yet until verified)
        admin.twoFactorSecret = secret.base32;
        admin.twoFactorBackupCodes = backupCodes;
        await admin.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: 'Scan the QR code with your authenticator app, then verify with a token.',
            data: {
                qrCode: qrCodeUrl,
                manualEntryKey: secret.base32,
                backupCodes,
            },
        });
    } catch (error) {
        console.error('2FA setup error:', error);
        res.status(500).json({ success: false, message: '2FA setup failed.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Confirm 2FA setup with verification token
// @route   POST /api/admin/auth/confirm-2fa
// @access  Private (Admin)
// ---------------------------------------------------------------------------
const confirm2FA = async (req, res) => {
    try {
        const { token } = req.body;

        const admin = await Admin.findById(req.user._id).select('+twoFactorSecret');

        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found.' });
        }

        if (!admin.twoFactorSecret) {
            return res.status(400).json({ success: false, message: 'Please set up 2FA first.' });
        }

        const isValid = speakeasy.totp.verify({
            secret: admin.twoFactorSecret,
            encoding: 'base32',
            token: token,
            window: 2,
        });

        if (!isValid) {
            return res.status(400).json({ success: false, message: 'Invalid token. Please try again.' });
        }

        admin.twoFactorEnabled = true;
        await admin.save({ validateBeforeSave: false });

        // Log action
        admin.logAction('2FA_ENABLED', 'Admin', admin._id, 'Two-factor authentication enabled', req.ip);
        await admin.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: 'Two-factor authentication enabled successfully!',
        });
    } catch (error) {
        console.error('2FA confirm error:', error);
        res.status(500).json({ success: false, message: '2FA confirmation failed.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Disable 2FA
// @route   POST /api/admin/auth/disable-2fa
// @access  Private (Admin)
// ---------------------------------------------------------------------------
const disable2FA = async (req, res) => {
    try {
        const { password } = req.body;

        const admin = await Admin.findById(req.user._id).select('+password');

        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found.' });
        }

        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid password.' });
        }

        admin.twoFactorEnabled = false;
        admin.twoFactorSecret = null;
        admin.twoFactorBackupCodes = [];

        admin.logAction('2FA_DISABLED', 'Admin', admin._id, 'Two-factor authentication disabled', req.ip);
        await admin.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: 'Two-factor authentication disabled.',
        });
    } catch (error) {
        console.error('2FA disable error:', error);
        res.status(500).json({ success: false, message: 'Failed to disable 2FA.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Create new admin (Super Admin only)
// @route   POST /api/admin/auth/create
// @access  Private (Super Admin)
// ---------------------------------------------------------------------------
const createAdmin = async (req, res) => {
    try {
        const { fullName, email, password, adminRole } = req.body;

        const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
        if (existingAdmin) {
            return res.status(400).json({ success: false, message: 'An admin with this email already exists.' });
        }

        const newAdmin = new Admin({
            fullName,
            email: email.toLowerCase(),
            password,
            adminRole,
        });

        await newAdmin.save();

        // Log action by creating admin
        req.user.logAction('ADMIN_CREATED', 'Admin', newAdmin._id, `Created ${adminRole}: ${fullName}`, req.ip);
        await req.user.save({ validateBeforeSave: false });

        res.status(201).json({
            success: true,
            message: 'Admin created successfully!',
            data: { admin: newAdmin.toSafeObject() },
        });
    } catch (error) {
        console.error('Create admin error:', error);
        if (error.code === 11000) return res.status(400).json({ success: false, message: 'Email already exists.' });
        res.status(500).json({ success: false, message: 'Failed to create admin.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Get current admin profile
// @route   GET /api/admin/auth/me
// @access  Private (Admin)
// ---------------------------------------------------------------------------
const getAdminProfile = async (req, res) => {
    try {
        const admin = await Admin.findById(req.user._id);
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });
        res.status(200).json({ success: true, data: { admin: admin.toSafeObject() } });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch profile.' }); }
};

// ---------------------------------------------------------------------------
// @desc    Change admin password
// @route   PUT /api/admin/auth/change-password
// @access  Private (Admin)
// ---------------------------------------------------------------------------
const changeAdminPassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const admin = await Admin.findById(req.user._id).select('+password');
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });
        const isMatch = await admin.comparePassword(currentPassword);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
        admin.password = newPassword;
        const { accessToken, refreshToken } = generateTokenPair(admin._id, 'admin');
        admin.refreshToken = refreshToken;
        admin.logAction('PASSWORD_CHANGED', 'Admin', admin._id, 'Password changed', req.ip);
        await admin.save();
        res.status(200).json({ success: true, message: 'Password changed!', data: { accessToken, refreshToken } });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to change password.' }); }
};

// ---------------------------------------------------------------------------
// @desc    Admin forgot password
// @route   POST /api/admin/auth/forgot-password
// @access  Public
// ---------------------------------------------------------------------------
const forgotAdminPassword = async (req, res) => {
    try {
        const admin = await Admin.findOne({ email: req.body.email.toLowerCase() });
        if (!admin) return res.status(200).json({ success: true, message: 'If an account exists, a reset link has been sent.' });
        const resetToken = admin.generateResetPasswordToken();
        await admin.save({ validateBeforeSave: false });
        await sendPasswordResetEmail(admin.email, admin.fullName, resetToken, 'admin');
        res.status(200).json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Request failed.' }); }
};

// ---------------------------------------------------------------------------
// @desc    Admin reset password
// @route   POST /api/admin/auth/reset-password
// @access  Public
// ---------------------------------------------------------------------------
const resetAdminPassword = async (req, res) => {
    try {
        const hashedToken = crypto.createHash('sha256').update(req.body.token).digest('hex');
        const admin = await Admin.findOne({ resetPasswordToken: hashedToken, resetPasswordExpire: { $gt: Date.now() } });
        if (!admin) return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
        admin.password = req.body.password;
        admin.resetPasswordToken = null;
        admin.resetPasswordExpire = null;
        admin.refreshToken = null;
        await admin.save();
        res.status(200).json({ success: true, message: 'Password reset successful!' });
    } catch (error) { res.status(500).json({ success: false, message: 'Reset failed.' }); }
};

// ---------------------------------------------------------------------------
// @desc    Refresh admin token
// @route   POST /api/admin/auth/refresh-token
// @access  Public
// ---------------------------------------------------------------------------
const refreshAdminToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token required.' });
        const jwt = require('jsonwebtoken');
        let decoded;
        try { decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, { issuer: 'medislot', audience: 'medislot-app' }); }
        catch (e) { return res.status(401).json({ success: false, message: 'Invalid refresh token.' }); }
        const admin = await Admin.findById(decoded.id).select('+refreshToken');
        if (!admin || admin.refreshToken !== refreshToken) return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
        const tokens = generateTokenPair(admin._id, 'admin');
        admin.refreshToken = tokens.refreshToken;
        await admin.save({ validateBeforeSave: false });
        res.status(200).json({ success: true, data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } });
    } catch (error) { res.status(500).json({ success: false, message: 'Token refresh failed.' }); }
};

// ---------------------------------------------------------------------------
// @desc    Logout admin
// @route   POST /api/admin/auth/logout
// @access  Private (Admin)
// ---------------------------------------------------------------------------
const logoutAdmin = async (req, res) => {
    try {
        const admin = await Admin.findById(req.user._id).select('+refreshToken');
        if (admin) { admin.refreshToken = null; await admin.save({ validateBeforeSave: false }); }
        res.status(200).json({ success: true, message: 'Logged out successfully.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Logout failed.' }); }
};

// ---------------------------------------------------------------------------
// @desc    Get all admins (Super Admin only)
// @route   GET /api/admin/auth/list
// @access  Private (Super Admin)
// ---------------------------------------------------------------------------
const getAllAdmins = async (req, res) => {
    try {
        const admins = await Admin.find().select('-actionLog -loginHistory').sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: admins.length,
            data: { admins: admins.map(a => a.toSafeObject()) },
        });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch admins.' }); }
};

// ---------------------------------------------------------------------------
// @desc    Get admin login history
// @route   GET /api/admin/auth/login-history
// @access  Private (Admin)
// ---------------------------------------------------------------------------
const getLoginHistory = async (req, res) => {
    try {
        const admin = await Admin.findById(req.user._id).select('loginHistory');
        res.status(200).json({
            success: true,
            data: { loginHistory: admin.loginHistory || [] },
        });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch login history.' }); }
};

module.exports = {
    loginAdmin, verify2FALogin, setup2FA, confirm2FA, disable2FA,
    createAdmin, getAdminProfile, changeAdminPassword,
    forgotAdminPassword, resetAdminPassword, refreshAdminToken,
    logoutAdmin, getAllAdmins, getLoginHistory,
};
