const Doctor = require('../models/Doctor');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

/**
 * @desc    Change password
 * @route   PUT /api/doctor/settings/change-password
 * @access  Private (Doctor)
 */
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmNewPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password, new password, and confirmation are required.',
            });
        }

        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({
                success: false,
                message: 'New password and confirmation do not match.',
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 8 characters.',
            });
        }

        // Validate password strength
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'Password must include uppercase, lowercase, number, and special character.',
            });
        }

        const doctor = await Doctor.findById(req.user._id).select('+password');

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        const isMatch = await doctor.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect.',
            });
        }

        doctor.password = newPassword;
        await doctor.save();

        // Generate new tokens
        const { generateTokenPair } = require('../utils/generateToken');
        const tokens = generateTokenPair(doctor._id, 'doctor');

        doctor.refreshToken = tokens.refreshToken;
        await doctor.save();

        res.status(200).json({
            success: true,
            message: 'Password changed successfully.',
            data: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
            },
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, message: 'Failed to change password.' });
    }
};

/**
 * @desc    Setup two-factor authentication
 * @route   POST /api/doctor/settings/2fa/setup
 * @access  Private (Doctor)
 */
const setup2FA = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.user._id);

        if (doctor.twoFactorEnabled) {
            return res.status(400).json({
                success: false,
                message: 'Two-factor authentication is already enabled.',
            });
        }

        // Generate secret
        const secret = speakeasy.generateSecret({
            name: `MediSlot Doctors (${doctor.email})`,
            issuer: 'MediSlot',
            length: 32,
        });

        // Save secret temporarily (not enabled yet until verified)
        doctor.twoFactorSecret = secret.base32;
        await doctor.save();

        // Generate QR code
        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

        res.status(200).json({
            success: true,
            message: 'Scan the QR code with your authenticator app.',
            data: {
                secret: secret.base32,
                qrCode: qrCodeUrl,
                otpauthUrl: secret.otpauth_url,
            },
        });
    } catch (error) {
        console.error('Setup 2FA error:', error);
        res.status(500).json({ success: false, message: 'Failed to setup 2FA.' });
    }
};

/**
 * @desc    Verify and enable 2FA
 * @route   POST /api/doctor/settings/2fa/verify
 * @access  Private (Doctor)
 */
const verify2FA = async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Verification token is required.',
            });
        }

        const doctor = await Doctor.findById(req.user._id).select('+twoFactorSecret');

        if (!doctor.twoFactorSecret) {
            return res.status(400).json({
                success: false,
                message: 'Please setup 2FA first.',
            });
        }

        const verified = speakeasy.totp.verify({
            secret: doctor.twoFactorSecret,
            encoding: 'base32',
            token: token,
            window: 2,
        });

        if (!verified) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code. Please try again.',
            });
        }

        doctor.twoFactorEnabled = true;
        await doctor.save();

        res.status(200).json({
            success: true,
            message: 'Two-factor authentication enabled successfully.',
        });
    } catch (error) {
        console.error('Verify 2FA error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify 2FA.' });
    }
};

/**
 * @desc    Disable 2FA
 * @route   POST /api/doctor/settings/2fa/disable
 * @access  Private (Doctor)
 */
const disable2FA = async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password is required to disable 2FA.',
            });
        }

        const doctor = await Doctor.findById(req.user._id).select('+password');

        const isMatch = await doctor.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Incorrect password.',
            });
        }

        doctor.twoFactorEnabled = false;
        doctor.twoFactorSecret = null;
        await doctor.save();

        res.status(200).json({
            success: true,
            message: 'Two-factor authentication disabled.',
        });
    } catch (error) {
        console.error('Disable 2FA error:', error);
        res.status(500).json({ success: false, message: 'Failed to disable 2FA.' });
    }
};

/**
 * @desc    Get all settings
 * @route   GET /api/doctor/settings
 * @access  Private (Doctor)
 */
const getSettings = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.user._id)
            .select('twoFactorEnabled isOnlineConsultationEnabled isInstantConsultationEnabled maxDailyAppointments notificationPreferences showPhoneNumber payoutCycle')
            .lean();

        res.status(200).json({
            success: true,
            data: {
                account: {
                    twoFactorEnabled: doctor.twoFactorEnabled,
                },
                consultation: {
                    isOnlineConsultationEnabled: doctor.isOnlineConsultationEnabled,
                    isInstantConsultationEnabled: doctor.isInstantConsultationEnabled,
                    maxDailyAppointments: doctor.maxDailyAppointments,
                },
                privacy: {
                    showPhoneNumber: doctor.showPhoneNumber,
                },
                notifications: doctor.notificationPreferences,
                payout: {
                    payoutCycle: doctor.payoutCycle,
                },
            },
        });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch settings.' });
    }
};

module.exports = {
    changePassword,
    setup2FA,
    verify2FA,
    disable2FA,
    getSettings,
};