const express = require('express');
const router = express.Router();
const { protect, authorize, checkPermission } = require('../middleware/auth');

// Controllers
const {
    getDashboardOverview,
    getDashboardTrends,
    getRecentActivity,
} = require('../controllers/adminDashboardController');

const {
    getAllDoctors,
    getDoctorById,
    approveDoctor,
    rejectDoctor,
    toggleBlockDoctor,
    updateDoctorByAdmin,
    getDoctorDocuments,
    getSpecializations,
} = require('../controllers/adminDoctorController');

const {
    getAllUsers,
    getUserById,
    toggleBlockUser,
    updateUserByAdmin,
    resetUserPassword,
    deleteUser,
    getUserStats,
} = require('../controllers/adminUserController');

// All routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

// ============================================================================
// DASHBOARD ROUTES
// ============================================================================
router.get('/dashboard/overview', getDashboardOverview);
router.get('/dashboard/trends', getDashboardTrends);
router.get('/dashboard/activity', getRecentActivity);

// ============================================================================
// DOCTOR MANAGEMENT ROUTES
// ============================================================================
router.get('/doctors/specializations', checkPermission('doctors', 'view'), getSpecializations);
router.get('/doctors', checkPermission('doctors', 'view'), getAllDoctors);
router.get('/doctors/:id', checkPermission('doctors', 'view'), getDoctorById);
router.get('/doctors/:id/documents', checkPermission('doctors', 'view'), getDoctorDocuments);
router.put('/doctors/:id', checkPermission('doctors', 'edit'), updateDoctorByAdmin);
router.put('/doctors/:id/approve', checkPermission('doctors', 'approve'), approveDoctor);
router.put('/doctors/:id/reject', checkPermission('doctors', 'approve'), rejectDoctor);
router.put('/doctors/:id/block', checkPermission('doctors', 'block'), toggleBlockDoctor);

// ============================================================================
// USER (PATIENT) MANAGEMENT ROUTES
// ============================================================================
router.get('/users/stats', checkPermission('users', 'view'), getUserStats);
router.get('/users', checkPermission('users', 'view'), getAllUsers);
router.get('/users/:id', checkPermission('users', 'view'), getUserById);
router.put('/users/:id', checkPermission('users', 'edit'), updateUserByAdmin);
router.put('/users/:id/block', checkPermission('users', 'block'), toggleBlockUser);
router.put('/users/:id/reset-password', checkPermission('users', 'edit'), resetUserPassword);
router.delete('/users/:id', checkPermission('users', 'delete'), deleteUser);

module.exports = router;
