const crypto = require('crypto');
const User = require('../models/User');
const { generateTokenPair } = require('../utils/generateToken');
const { sendVerificationOTP, sendVerificationEmail, sendPasswordResetEmail } = require('../utils/sendEmail');

// ---------------------------------------------------------------------------
// @desc    Register a new patient
// @route   POST /api/auth/register
// @access  Public
// ---------------------------------------------------------------------------
const registerPatient = async (req, res) => {
    try {
        const { fullName, email, mobileNumber, password, dateOfBirth, gender, address, profilePhoto } = req.body;

        // Check if user already exists with email
        const existingEmailUser = await User.findOne({ email: email.toLowerCase() });
        if (existingEmailUser) {
            return res.status(400).json({
                success: false,
                message: 'An account with this email already exists.',
            });
        }

        // Check if user already exists with mobile number
        const existingMobileUser = await User.findOne({ mobileNumber });
        if (existingMobileUser) {
            return res.status(400).json({
                success: false,
                message: 'An account with this mobile number already exists.',
            });
        }

        // Create user
        const user = new User({
            fullName,
            email: email.toLowerCase(),
            mobileNumber,
            password,
            dateOfBirth: dateOfBirth || null,
            gender: gender || null,
            address: address || {},
            profilePhoto: profilePhoto || '',
        });

        // Generate email verification OTP (6-digit)
        const otp = user.generateEmailVerificationOTP();

        // Save user
        await user.save();

        // Send verification OTP email
        await sendVerificationOTP(user.email, user.fullName, otp, 'patient');

        // Generate auth tokens
        const { accessToken, refreshToken } = generateTokenPair(user._id, 'patient');

        // Save refresh token
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        res.status(201).json({
            success: true,
            message: 'Registration successful! Please check your email to verify your account.',
            data: {
                user: user.toSafeObject(),
                accessToken,
                refreshToken,
            },
        });
    } catch (error) {
        console.error('Patient registration error:', error);

        // Handle duplicate key errors
        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            return res.status(400).json({
                success: false,
                message: `An account with this ${field} already exists.`,
            });
        }

        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.',
        });
    }
};

// ---------------------------------------------------------------------------
// @desc    Login patient
// @route   POST /api/auth/login
// @access  Public
// ---------------------------------------------------------------------------
const loginPatient = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user and include password
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            });
        }

        // Check if account is blocked
        if (user.isBlocked) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been blocked. Please contact support.',
                reason: user.blockReason || '',
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact support.',
            });
        }

        // Compare password
        const isPasswordMatch = await user.comparePassword(password);
        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            });
        }

        // Record login activity
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || '';
        const device = req.headers['x-device-type'] || 'unknown';
        user.recordLogin(ipAddress, userAgent, device);

        // Generate auth tokens
        const { accessToken, refreshToken } = generateTokenPair(user._id, 'patient');

        // Save refresh token and login history
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: 'Login successful!',
            data: {
                user: user.toSafeObject(),
                accessToken,
                refreshToken,
                isEmailVerified: user.isEmailVerified,
            },
        });
    } catch (error) {
        console.error('Patient login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.',
        });
    }
};

// ---------------------------------------------------------------------------
// @desc    Verify email
// @route   POST /api/auth/verify-email
// @access  Public
// ---------------------------------------------------------------------------
// @desc    Verify email with OTP
// @route   POST /api/auth/verify-otp
// @access  Private (Patient)
// ---------------------------------------------------------------------------
const verifyEmailOTP = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!otp) {
            return res.status(400).json({
                success: false,
                message: 'OTP is required.',
            });
        }

        // Find user
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        // Check if already verified
        if (user.isEmailVerified) {
            return res.status(200).json({
                success: true,
                message: 'Email is already verified.',
            });
        }

        // Verify OTP
        const result = user.verifyEmailOTP(otp);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        // Save user
        await user.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: 'Email verified successfully! You can now access all features.',
        });
    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({
            success: false,
            message: 'OTP verification failed. Please try again.',
        });
    }
};

// ---------------------------------------------------------------------------
// @desc    Verify email (Legacy - Token based)
// @route   POST /api/auth/verify-email
// @access  Public
// ---------------------------------------------------------------------------
const verifyEmail = async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Token is required.',
            });
        }

        // Hash the token to compare with stored hash
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find user with matching token and not expired
        const user = await User.findOne({
            emailVerificationToken: hashedToken,
            emailVerificationExpire: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired verification token.',
            });
        }

        // Check if already verified
        if (user.isEmailVerified) {
            return res.status(200).json({
                success: true,
                message: 'Email is already verified.',
            });
        }

        // Mark email as verified
        user.isEmailVerified = true;
        user.emailVerificationToken = null;
        user.emailVerificationExpire = null;
        await user.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: 'Email verified successfully! You can now access all features.',
        });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Email verification failed. Please try again.',
        });
    }
};

// ---------------------------------------------------------------------------
// @desc    Verify email (Direct GET - for email links)
// @route   GET /api/auth/verify-email-direct
// @access  Public
// ---------------------------------------------------------------------------
const verifyEmailDirect = async (req, res) => {
    try {
        const token = req.query.token;

        if (!token) {
            return res.send(`
                <!DOCTYPE html>
                <html><body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>❌ Verification Failed</h1>
                <p>Token is missing.</p>
                </body></html>
            `);
        }

        // Hash the token to compare with stored hash
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find user with matching token and not expired
        const user = await User.findOne({
            emailVerificationToken: hashedToken,
            emailVerificationExpire: { $gt: Date.now() },
        });

        if (!user) {
            return res.send(`
                <!DOCTYPE html>
                <html><body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>❌ Verification Failed</h1>
                <p>Invalid or expired verification token.</p>
                <p><a href="${process.env.APP_URL || 'medislot://'}">Open MediSlot App</a></p>
                </body></html>
            `);
        }

        // Check if already verified
        if (user.isEmailVerified) {
            const deepLink = `${process.env.APP_URL || 'medislot://'}verify-email?success=true&message=Email is already verified`;
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head><meta http-equiv="refresh" content="1;url=${deepLink}"></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>✅ Already Verified</h1>
                <p>Your email is already verified.</p>
                <p>Redirecting to app... <a href="${deepLink}">Click here if not redirected</a></p>
                </body></html>
            `);
        }

        // Mark email as verified
        user.isEmailVerified = true;
        user.emailVerificationToken = null;
        user.emailVerificationExpire = null;
        await user.save({ validateBeforeSave: false });

        const deepLink = `${process.env.APP_URL || 'medislot://'}verify-email?success=true&message=Email verified successfully`;
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta http-equiv="refresh" content="1;url=${deepLink}"></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>✅ Email Verified!</h1>
            <p>Your email has been verified successfully.</p>
            <p>Redirecting to app... <a href="${deepLink}">Click here if not redirected</a></p>
            </body></html>
        `);
    } catch (error) {
        console.error('Email verification error:', error);
        res.send(`
            <!DOCTYPE html>
            <html><body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>❌ Verification Failed</h1>
            <p>An error occurred. Please try again.</p>
            </body></html>
        `);
    }
};

// ---------------------------------------------------------------------------
// @desc    Resend verification OTP
// @route   POST /api/auth/resend-verification
// @access  Private (Patient)
// ---------------------------------------------------------------------------
const resendVerificationEmail = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({
                success: false,
                message: 'Email is already verified.',
            });
        }

        // Generate new OTP
        const otp = user.generateEmailVerificationOTP();
        await user.save({ validateBeforeSave: false });

        // Send OTP email
        await sendVerificationOTP(user.email, user.fullName, otp, 'patient');

        res.status(200).json({
            success: true,
            message: 'Verification OTP sent successfully. Please check your inbox.',
        });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resend verification OTP. Please try again.',
        });
    }
};

// ---------------------------------------------------------------------------
// @desc    Forgot password - Send reset OTP
// @route   POST /api/auth/forgot-password
// @access  Public
// ---------------------------------------------------------------------------
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Don't reveal if user exists
            return res.status(200).json({
                success: true,
                message: 'If an account with this email exists, a password reset code has been sent.',
            });
        }

        // Generate reset OTP
        const otp = user.generateResetPasswordOTP();
        await user.save({ validateBeforeSave: false });

        // Send password reset OTP email
        const { sendPasswordResetOTP } = require('../utils/sendEmail');
        await sendPasswordResetOTP(user.email, user.fullName, otp, 'patient');

        res.status(200).json({
            success: true,
            message: 'If an account with this email exists, a password reset code has been sent.',
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process your request. Please try again.',
        });
    }
};


// ---------------------------------------------------------------------------
// @desc    Reset password with token
// @route   POST /api/auth/reset-password
// ---------------------------------------------------------------------------
// @desc    Verify password reset OTP
// @route   POST /api/auth/verify-reset-otp
// @access  Public
// ---------------------------------------------------------------------------
const verifyResetOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required.',
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        // Verify OTP
        const result = user.verifyResetPasswordOTP(otp);

        if (!result.success) {
            await user.save({ validateBeforeSave: false }); // Save attempt count
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully! You can now reset your password.',
        });
    } catch (error) {
        console.error('Verify reset OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'OTP verification failed. Please try again.',
        });
    }
};

// ---------------------------------------------------------------------------
// @desc    Reset password with OTP
// @route   POST /api/auth/reset-password-otp
// @access  Public
// ---------------------------------------------------------------------------
const resetPasswordWithOTP = async (req, res) => {
    try {
        const { email, otp, password } = req.body;

        if (!email || !otp || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email, OTP, and new password are required.',
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        // Verify OTP one more time
        const result = user.verifyResetPasswordOTP(otp);

        if (!result.success) {
            await user.save({ validateBeforeSave: false });
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        // Set new password
        user.password = password;
        user.clearResetPasswordOTP();

        // Invalidate all existing refresh tokens
        user.refreshToken = null;

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password reset successful! You can now log in with your new password.',
        });
    } catch (error) {
        console.error('Reset password with OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Password reset failed. Please try again.',
        });
    }
};

// ---------------------------------------------------------------------------
// @desc    Reset password with token (Legacy)
// @route   POST /api/auth/reset-password
// @access  Public
// ---------------------------------------------------------------------------
const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        // Hash the token to compare with stored hash
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find user with matching token and not expired
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpire: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token.',
            });
        }

        // Set new password
        user.password = password;
        user.resetPasswordToken = null;
        user.resetPasswordExpire = null;

        // Invalidate all existing refresh tokens
        user.refreshToken = null;

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password reset successful! You can now log in with your new password.',
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Password reset failed. Please try again.',
        });
    }
};

// ---------------------------------------------------------------------------
// @desc    Reset password (Direct GET - for email links)
// @route   GET /api/auth/reset-password-direct
// @access  Public
// ---------------------------------------------------------------------------
const resetPasswordDirect = async (req, res) => {
    try {
        const token = req.query.token;
        if (!token) {
            return res.send(`<!DOCTYPE html><html><body style="font-family: Arial; text-align: center; padding: 50px;"><h1>❌ Reset Failed</h1><p>Token is missing.</p></body></html>`);
        }
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({ resetPasswordToken: hashedToken, resetPasswordExpire: { $gt: Date.now() } });
        if (!user) {
            return res.send(`<!DOCTYPE html><html><body style="font-family: Arial; text-align: center; padding: 50px;"><h1>❌ Reset Failed</h1><p>Invalid or expired reset token.</p><p><a href="${process.env.APP_URL || 'medislot://'}">Open MediSlot App</a></p></body></html>`);
        }
        const deepLink = `${process.env.APP_URL || 'medislot://'}reset-password?token=${token}&type=patient`;
        res.send(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="1;url=${deepLink}"></head><body style="font-family: Arial; text-align: center; padding: 50px;"><h1>🔐 Reset Your Password</h1><p>Redirecting to app to set your new password...</p><p><a href="${deepLink}">Click here if not redirected</a></p></body></html>`);
    } catch (error) {
        console.error('Password reset error:', error);
        res.send(`<!DOCTYPE html><html><body style="font-family: Arial; text-align: center; padding: 50px;"><h1>❌ Reset Failed</h1><p>An error occurred. Please try again.</p></body></html>`);
    }
};

// ---------------------------------------------------------------------------
// @desc    Change password (logged in)
// @route   PUT /api/auth/change-password
// @access  Private (Patient)
// ---------------------------------------------------------------------------
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        const user = await User.findById(req.user._id).select('+password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        // Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect.',
            });
        }

        // Set new password
        user.password = newPassword;

        // Regenerate tokens
        const { accessToken, refreshToken } = generateTokenPair(user._id, 'patient');
        user.refreshToken = refreshToken;

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password changed successfully!',
            data: {
                accessToken,
                refreshToken,
            },
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to change password. Please try again.',
        });
    }
};

// ---------------------------------------------------------------------------
// @desc    Get current logged-in patient profile
// @route   GET /api/auth/me
// @access  Private (Patient)
// ---------------------------------------------------------------------------
const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        res.status(200).json({
            success: true,
            data: {
                user: user.toSafeObject(),
            },
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile. Please try again.',
        });
    }
};

// ---------------------------------------------------------------------------
// @desc    Update patient profile
// @route   PUT /api/auth/profile
// @access  Private (Patient)
// ---------------------------------------------------------------------------
const updateProfile = async (req, res) => {
    try {
        const allowedFields = [
            'fullName',
            'dateOfBirth',
            'gender',
            'address',
            'profilePhoto',
            'preferences',
        ];

        const updates = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        const user = await User.findByIdAndUpdate(req.user._id, updates, {
            new: true,
            runValidators: true,
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully!',
            data: {
                user: user.toSafeObject(),
            },
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile. Please try again.',
        });
    }
};

// ---------------------------------------------------------------------------
// @desc    Refresh access token
// @route   POST /api/auth/refresh-token
// @access  Public
// ---------------------------------------------------------------------------
const refreshAccessToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required.',
            });
        }

        // Verify refresh token
        const jwt = require('jsonwebtoken');
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, {
                issuer: 'medislot',
                audience: 'medislot-app',
            });
        } catch (err) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired refresh token. Please log in again.',
            });
        }

        // Find user with matching refresh token
        const user = await User.findById(decoded.id).select('+refreshToken');

        if (!user || user.refreshToken !== refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token. Please log in again.',
            });
        }

        // Generate new token pair
        const tokens = generateTokenPair(user._id, 'patient');
        user.refreshToken = tokens.refreshToken;
        await user.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: 'Token refreshed successfully.',
            data: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
            },
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh token. Please log in again.',
        });
    }
};

// ---------------------------------------------------------------------------
// @desc    Logout patient
// @route   POST /api/auth/logout
// @access  Private (Patient)
// ---------------------------------------------------------------------------
const logoutPatient = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('+refreshToken');

        if (user) {
            user.refreshToken = null;
            user.fcmToken = null;
            await user.save({ validateBeforeSave: false });
        }

        res.status(200).json({
            success: true,
            message: 'Logged out successfully.',
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed. Please try again.',
        });
    }
};

// ---------------------------------------------------------------------------
// @desc    Update FCM token for push notifications
// @route   PUT /api/auth/fcm-token
// @access  Private (Patient)
// ---------------------------------------------------------------------------
const updateFCMToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;

        if (!fcmToken) {
            return res.status(400).json({
                success: false,
                message: 'FCM token is required.',
            });
        }

        await User.findByIdAndUpdate(req.user._id, { fcmToken });

        res.status(200).json({
            success: true,
            message: 'FCM token updated successfully.',
        });
    } catch (error) {
        console.error('FCM token update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update FCM token.',
        });
    }
};

module.exports = {
    registerPatient,
    loginPatient,
    verifyEmail,
    verifyEmailOTP,
    verifyEmailDirect,
    resendVerificationEmail,
    forgotPassword,
    verifyResetOTP,
    resetPasswordWithOTP,
    resetPassword,
    resetPasswordDirect,
    changePassword,
    getMe,
    updateProfile,
    refreshAccessToken,
    logoutPatient,
    updateFCMToken,
};
