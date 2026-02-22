const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
    validateDoctorRegister, validateLogin, validateForgotPassword,
    validateResetPassword, validateChangePassword, validateEmailVerification, validateRefreshToken,
} = require('../validators/authValidator');
const {
    registerDoctor, loginDoctor, verifyDoctorEmail, verifyDoctorEmailDirect, resendDoctorVerification,
    forgotDoctorPassword, resetDoctorPassword, resetDoctorPasswordDirect, changeDoctorPassword,
    getDoctorProfile, updateDoctorProfile, refreshDoctorToken, logoutDoctor,
    uploadDocuments, updateDoctorFCMToken,
} = require('../controllers/doctorAuthController');

// Public routes
router.post('/register', validateDoctorRegister, registerDoctor);
router.post('/login', validateLogin, loginDoctor);
router.post('/verify-email', validateEmailVerification, verifyDoctorEmail);
router.get('/verify-email-direct', verifyDoctorEmailDirect); // Direct GET verification
router.post('/forgot-password', validateForgotPassword, forgotDoctorPassword);
router.post('/reset-password', validateResetPassword, resetDoctorPassword);
router.get('/reset-password-direct', resetDoctorPasswordDirect); // Direct GET password reset
router.post('/refresh-token', validateRefreshToken, refreshDoctorToken);

// Protected routes (Doctor only)
router.use(protect);
router.use(authorize('doctor'));

router.get('/me', getDoctorProfile);
router.put('/profile', updateDoctorProfile);
router.put('/change-password', validateChangePassword, changeDoctorPassword);
router.post('/resend-verification', resendDoctorVerification);
router.post('/upload-documents', uploadDocuments);
router.post('/logout', logoutDoctor);
router.put('/fcm-token', updateDoctorFCMToken);

module.exports = router;
