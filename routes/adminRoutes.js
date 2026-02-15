const express = require('express');
const router = express.Router();
const { protect, authorize, checkPermission } = require('../middleware/auth');

// ─── Controllers ────────────────────────────────────────────────────────────
const { getDashboardOverview, getDashboardTrends, getRecentActivity } = require('../controllers/adminDashboardController');

const { getAllDoctors, getDoctorById, approveDoctor, rejectDoctor, toggleBlockDoctor, updateDoctorByAdmin, getDoctorDocuments, getSpecializations } = require('../controllers/adminDoctorController');

const { getAllUsers, getUserById, toggleBlockUser, updateUserByAdmin, resetUserPassword, deleteUser, getUserStats } = require('../controllers/adminUserController');

const { getAllAppointments, getAppointmentById, getAppointmentStats, cancelAppointment, rescheduleAppointment, assignAlternateDoctor } = require('../controllers/adminAppointmentController');

const { getAllPayments, getRevenueDashboard, getPayouts, processRefund, processPayout } = require('../controllers/adminPaymentController');

const { getCommissionSettings, updateGlobalCommission, setDoctorCommission, updateMinConsultationFee, updateOnlinePaymentFee, updateCoupons } = require('../controllers/adminCommissionController');

const { getAllReviews, getReviewStats, toggleFlag, toggleVisibility, deleteReview } = require('../controllers/adminReviewController');

const { getAllNotifications, sendNotification, broadcastNotification, getNotificationStats, deleteNotification } = require('../controllers/adminNotificationController');

const { getAllPages, getPageById, createPage, updatePage, deletePage } = require('../controllers/adminCMSController');

const { appointmentsReport, revenueReport, doctorPerformanceReport, getKPIs } = require('../controllers/adminReportController');

const { getAllTickets, getTicketById, getTicketStats, updateTicketStatus, assignTicket, respondToTicket, resolveTicket } = require('../controllers/adminSupportController');

const { getAllSettings, getSetting, updateSetting, bulkUpdateSettings, deleteSetting, initializeDefaults } = require('../controllers/adminSettingsController');

const { getAuditLogs, getLoginHistory, getSecurityOverview, createAuditLog, getComplianceReport } = require('../controllers/adminSecurityController');

// ─── All routes require admin authentication ────────────────────────────────
router.use(protect);
router.use(authorize('admin'));

// ============================================================================
// DASHBOARD
// ============================================================================
router.get('/dashboard/overview', getDashboardOverview);
router.get('/dashboard/trends', getDashboardTrends);
router.get('/dashboard/activity', getRecentActivity);

// ============================================================================
// DOCTOR MANAGEMENT
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
// USER (PATIENT) MANAGEMENT
// ============================================================================
router.get('/users/stats', checkPermission('users', 'view'), getUserStats);
router.get('/users', checkPermission('users', 'view'), getAllUsers);
router.get('/users/:id', checkPermission('users', 'view'), getUserById);
router.put('/users/:id', checkPermission('users', 'edit'), updateUserByAdmin);
router.put('/users/:id/block', checkPermission('users', 'block'), toggleBlockUser);
router.put('/users/:id/reset-password', checkPermission('users', 'edit'), resetUserPassword);
router.delete('/users/:id', checkPermission('users', 'delete'), deleteUser);

// ============================================================================
// APPOINTMENT MANAGEMENT
// ============================================================================
router.get('/appointments/stats', checkPermission('appointments', 'view'), getAppointmentStats);
router.get('/appointments', checkPermission('appointments', 'view'), getAllAppointments);
router.get('/appointments/:id', checkPermission('appointments', 'view'), getAppointmentById);
router.put('/appointments/:id/cancel', checkPermission('appointments', 'edit'), cancelAppointment);
router.put('/appointments/:id/reschedule', checkPermission('appointments', 'edit'), rescheduleAppointment);
router.put('/appointments/:id/assign-doctor', checkPermission('appointments', 'edit'), assignAlternateDoctor);

// ============================================================================
// PAYMENTS & FINANCIAL
// ============================================================================
router.get('/payments/revenue', checkPermission('payments', 'view'), getRevenueDashboard);
router.get('/payments/payouts', checkPermission('payments', 'view'), getPayouts);
router.get('/payments', checkPermission('payments', 'view'), getAllPayments);
router.put('/payments/:id/refund', checkPermission('payments', 'refund'), processRefund);
router.put('/payments/:id/payout', checkPermission('payments', 'edit'), processPayout);

// ============================================================================
// COMMISSION & PRICING
// ============================================================================
router.get('/commission', checkPermission('payments', 'view'), getCommissionSettings);
router.put('/commission/global', checkPermission('payments', 'edit'), updateGlobalCommission);
router.put('/commission/doctor/:doctorId', checkPermission('payments', 'edit'), setDoctorCommission);
router.put('/commission/min-fee', checkPermission('payments', 'edit'), updateMinConsultationFee);
router.put('/commission/online-fee', checkPermission('payments', 'edit'), updateOnlinePaymentFee);
router.put('/commission/coupons', checkPermission('payments', 'edit'), updateCoupons);

// ============================================================================
// REVIEWS MODERATION
// ============================================================================
router.get('/reviews/stats', checkPermission('reviews', 'view'), getReviewStats);
router.get('/reviews', checkPermission('reviews', 'view'), getAllReviews);
router.put('/reviews/:id/flag', checkPermission('reviews', 'edit'), toggleFlag);
router.put('/reviews/:id/visibility', checkPermission('reviews', 'edit'), toggleVisibility);
router.delete('/reviews/:id', checkPermission('reviews', 'delete'), deleteReview);

// ============================================================================
// NOTIFICATIONS
// ============================================================================
router.get('/notifications/stats', checkPermission('notifications', 'view'), getNotificationStats);
router.get('/notifications', checkPermission('notifications', 'view'), getAllNotifications);
router.post('/notifications/send', checkPermission('notifications', 'create'), sendNotification);
router.post('/notifications/broadcast', checkPermission('notifications', 'create'), broadcastNotification);
router.delete('/notifications/:id', checkPermission('notifications', 'delete'), deleteNotification);

// ============================================================================
// CMS & CONTENT
// ============================================================================
router.get('/cms', checkPermission('cms', 'view'), getAllPages);
router.get('/cms/:id', checkPermission('cms', 'view'), getPageById);
router.post('/cms', checkPermission('cms', 'create'), createPage);
router.put('/cms/:id', checkPermission('cms', 'edit'), updatePage);
router.delete('/cms/:id', checkPermission('cms', 'delete'), deletePage);

// ============================================================================
// REPORTS & ANALYTICS
// ============================================================================
router.get('/reports/kpis', checkPermission('reports', 'view'), getKPIs);
router.get('/reports/appointments', checkPermission('reports', 'view'), appointmentsReport);
router.get('/reports/revenue', checkPermission('reports', 'view'), revenueReport);
router.get('/reports/doctor-performance', checkPermission('reports', 'view'), doctorPerformanceReport);

// ============================================================================
// SUPPORT & DISPUTES
// ============================================================================
router.get('/support/stats', checkPermission('support', 'view'), getTicketStats);
router.get('/support', checkPermission('support', 'view'), getAllTickets);
router.get('/support/:id', checkPermission('support', 'view'), getTicketById);
router.put('/support/:id/status', checkPermission('support', 'edit'), updateTicketStatus);
router.put('/support/:id/assign', checkPermission('support', 'edit'), assignTicket);
router.post('/support/:id/respond', checkPermission('support', 'edit'), respondToTicket);
router.put('/support/:id/resolve', checkPermission('support', 'edit'), resolveTicket);

// ============================================================================
// SYSTEM SETTINGS
// ============================================================================
router.get('/settings', checkPermission('settings', 'view'), getAllSettings);
router.get('/settings/:key', checkPermission('settings', 'view'), getSetting);
router.put('/settings', checkPermission('settings', 'edit'), updateSetting);
router.put('/settings/bulk', checkPermission('settings', 'edit'), bulkUpdateSettings);
router.post('/settings/initialize', checkPermission('settings', 'edit'), initializeDefaults);
router.delete('/settings/:key', checkPermission('settings', 'delete'), deleteSetting);

// ============================================================================
// SECURITY, LOGS & COMPLIANCE
// ============================================================================
router.get('/security/overview', checkPermission('security', 'view'), getSecurityOverview);
router.get('/security/logs', checkPermission('security', 'view'), getAuditLogs);
router.get('/security/login-history', checkPermission('security', 'view'), getLoginHistory);
router.get('/security/compliance', checkPermission('security', 'view'), getComplianceReport);
router.post('/security/log', checkPermission('security', 'create'), createAuditLog);

module.exports = router;
