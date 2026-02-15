const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
    validatePatientRegister, validateLogin, validateForgotPassword,
    validateResetPassword, validateChangePassword, validateEmailVerification, validateRefreshToken,
} = require('../validators/authValidator');
const {
    registerPatient, loginPatient, verifyEmail, verifyEmailDirect, resendVerificationEmail,
    forgotPassword, resetPassword, changePassword, getMe, updateProfile,
    refreshAccessToken, logoutPatient, updateFCMToken,
} = require('../controllers/authController');

// Public routes
router.post('/register', validatePatientRegister, registerPatient);
router.post('/login', validateLogin, loginPatient);
router.post('/verify-email', validateEmailVerification, verifyEmail);
router.get('/verify-email-direct', verifyEmailDirect); // Direct GET verification
router.post('/forgot-password', validateForgotPassword, forgotPassword);
router.post('/reset-password', validateResetPassword, resetPassword);
router.post('/refresh-token', validateRefreshToken, refreshAccessToken);

// Protected routes (Patient only)
router.use(protect);
router.use(authorize('patient'));

router.get('/me', getMe);
router.put('/profile', updateProfile);
router.put('/change-password', validateChangePassword, changePassword);
router.post('/resend-verification', resendVerificationEmail);
router.post('/logout', logoutPatient);
router.put('/fcm-token', updateFCMToken);

module.exports = router;
