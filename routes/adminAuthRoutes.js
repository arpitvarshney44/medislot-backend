const express = require('express');
const router = express.Router();
const { protect, authorize, checkPermission } = require('../middleware/auth');
const {
    validateAdminLogin, validateAdminCreate, validateChangePassword,
    validateForgotPassword, validateResetPassword, validateTwoFactorSetup,
    validateTwoFactorVerify, validateRefreshToken,
} = require('../validators/authValidator');
const {
    loginAdmin, verify2FALogin, setup2FA, confirm2FA, disable2FA,
    createAdmin, getAdminProfile, changeAdminPassword,
    forgotAdminPassword, resetAdminPassword, refreshAdminToken,
    logoutAdmin, getAllAdmins, getLoginHistory,
} = require('../controllers/adminAuthController');

// Public routes
router.post('/login', validateAdminLogin, loginAdmin);
router.post('/verify-2fa', validateTwoFactorVerify, verify2FALogin);
router.post('/forgot-password', validateForgotPassword, forgotAdminPassword);
router.post('/reset-password', validateResetPassword, resetAdminPassword);
router.post('/refresh-token', validateRefreshToken, refreshAdminToken);

// Protected routes (Admin only)
router.use(protect);
router.use(authorize('admin'));

router.get('/me', getAdminProfile);
router.put('/change-password', validateChangePassword, changeAdminPassword);
router.post('/logout', logoutAdmin);
router.get('/login-history', getLoginHistory);

// 2FA routes
router.post('/setup-2fa', setup2FA);
router.post('/confirm-2fa', validateTwoFactorSetup, confirm2FA);
router.post('/disable-2fa', disable2FA);

// Super Admin only
router.post('/create', checkPermission('admins', 'create'), validateAdminCreate, createAdmin);
router.get('/list', checkPermission('admins', 'view'), getAllAdmins);

module.exports = router;
