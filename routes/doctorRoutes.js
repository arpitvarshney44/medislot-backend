const express = require('express');
const router = express.Router();
const { protect, authorize, requireEmailVerification, requireDoctorVerification } = require('../middleware/auth');

// Controllers
const dashboardController = require('../controllers/doctorDashboardController');
const profileController = require('../controllers/doctorProfileController');
const availabilityController = require('../controllers/doctorAvailabilityController');
const appointmentController = require('../controllers/doctorAppointmentController');
const prescriptionController = require('../controllers/doctorPrescriptionController');
const patientController = require('../controllers/doctorPatientController');
const earningsController = require('../controllers/doctorEarningsController');
const reviewController = require('../controllers/doctorReviewController');
const notificationController = require('../controllers/doctorNotificationController');
const settingsController = require('../controllers/doctorSettingsController');

// All routes require authentication as doctor
router.use(protect, authorize('doctor'), requireEmailVerification);

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
router.get('/dashboard', requireDoctorVerification, dashboardController.getDashboardOverview);
router.get('/dashboard/today-schedule', requireDoctorVerification, dashboardController.getTodaySchedule);
router.get('/dashboard/quick-stats', requireDoctorVerification, dashboardController.getQuickStats);

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
router.get('/profile', profileController.getProfile);
router.put('/profile', profileController.updateProfile);
router.put('/profile/fees', profileController.updateConsultationFees);
router.put('/profile/privacy', profileController.updatePrivacyControls);
router.put('/profile/consultation-settings', profileController.updateConsultationSettings);
router.put('/profile/bank-details', profileController.updateBankDetails);
router.put('/profile/payout-cycle', profileController.updatePayoutCycle);

// Clinic management
router.get('/profile/clinics', profileController.getClinics);
router.post('/profile/clinics', profileController.addClinic);
router.put('/profile/clinics/:clinicId', profileController.updateClinic);
router.delete('/profile/clinics/:clinicId', profileController.deleteClinic);

// ═══════════════════════════════════════════════════════════════════════════
// AVAILABILITY & SLOT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
router.get('/availability', requireDoctorVerification, availabilityController.getAvailability);
router.put('/availability/weekly-schedule', requireDoctorVerification, availabilityController.updateWeeklySchedule);
router.put('/availability/slot-config', requireDoctorVerification, availabilityController.updateSlotConfig);
router.post('/availability/custom-date', requireDoctorVerification, availabilityController.addCustomDateOverride);
router.delete('/availability/custom-date/:overrideId', requireDoctorVerification, availabilityController.removeCustomDateOverride);
router.post('/availability/holidays', requireDoctorVerification, availabilityController.addHoliday);
router.delete('/availability/holidays/:holidayId', requireDoctorVerification, availabilityController.removeHoliday);
router.get('/availability/slots/:date', requireDoctorVerification, availabilityController.getAvailableSlots);
router.put('/availability/block-slot', requireDoctorVerification, availabilityController.toggleSlotBlock);
// 
// ══════════════════════════════════════════════════════════════════════════
// APPOINTMENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
router.get('/appointments', requireDoctorVerification, appointmentController.getAppointments);
router.get('/appointments/:appointmentId', requireDoctorVerification, appointmentController.getAppointmentDetails);
router.put('/appointments/:appointmentId/accept', requireDoctorVerification, appointmentController.acceptAppointment);
router.put('/appointments/:appointmentId/reject', requireDoctorVerification, appointmentController.rejectAppointment);
router.put('/appointments/:appointmentId/cancel', requireDoctorVerification, appointmentController.cancelAppointment);
router.put('/appointments/:appointmentId/reschedule', requireDoctorVerification, appointmentController.rescheduleAppointment);
router.put('/appointments/:appointmentId/complete', requireDoctorVerification, appointmentController.completeAppointment);
router.put('/appointments/:appointmentId/start-consultation', requireDoctorVerification, appointmentController.startConsultation);
router.put('/appointments/:appointmentId/end-consultation', requireDoctorVerification, appointmentController.endConsultation);

// ═══════════════════════════════════════════════════════════════════════════
// PRESCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
router.get('/prescriptions', requireDoctorVerification, prescriptionController.getPrescriptions);
router.post('/prescriptions', requireDoctorVerification, prescriptionController.createPrescription);
router.get('/prescriptions/:prescriptionId', requireDoctorVerification, prescriptionController.getPrescription);
router.put('/prescriptions/:prescriptionId', requireDoctorVerification, prescriptionController.updatePrescription);
router.put('/prescriptions/:prescriptionId/send', requireDoctorVerification, prescriptionController.sendPrescription);
router.delete('/prescriptions/:prescriptionId', requireDoctorVerification, prescriptionController.deletePrescription);
router.get('/prescriptions/patient/:patientId', requireDoctorVerification, prescriptionController.getPatientPrescriptions);

// ═══════════════════════════════════════════════════════════════════════════
// PATIENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
router.get('/patients', requireDoctorVerification, patientController.getPatients);
router.get('/patients/:patientId', requireDoctorVerification, patientController.getPatientProfile);
router.post('/patients/:patientId/notes', requireDoctorVerification, patientController.addPatientNote);
router.put('/patients/notes/:noteId', requireDoctorVerification, patientController.updatePatientNote);
router.delete('/patients/notes/:noteId', requireDoctorVerification, patientController.deletePatientNote);

// ═══════════════════════════════════════════════════════════════════════════
// EARNINGS & PAYMENTS
// ═══════════════════════════════════════════════════════════════════════════
router.get('/earnings', requireDoctorVerification, earningsController.getEarningsDashboard);
router.get('/earnings/transactions', requireDoctorVerification, earningsController.getTransactions);
router.get('/earnings/payouts', requireDoctorVerification, earningsController.getPayoutHistory);

// ═══════════════════════════════════════════════════════════════════════════
// RATINGS & REVIEWS
// ═══════════════════════════════════════════════════════════════════════════
router.get('/reviews', requireDoctorVerification, reviewController.getReviews);
router.put('/reviews/:reviewId/reply', requireDoctorVerification, reviewController.replyToReview);
router.put('/reviews/:reviewId/report', requireDoctorVerification, reviewController.reportReview);

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════
router.get('/notifications', notificationController.getNotifications);
router.put('/notifications/read-all', notificationController.markAllAsRead);
router.put('/notifications/:notificationId/read', notificationController.markAsRead);
router.delete('/notifications/:notificationId', notificationController.deleteNotification);
router.get('/notifications/preferences', notificationController.getNotificationPreferences);
router.put('/notifications/preferences', notificationController.updateNotificationPreferences);

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
router.get('/settings', settingsController.getSettings);
router.put('/settings/change-password', settingsController.changePassword);
router.post('/settings/2fa/setup', settingsController.setup2FA);
router.post('/settings/2fa/verify', settingsController.verify2FA);
router.post('/settings/2fa/disable', settingsController.disable2FA);

module.exports = router;