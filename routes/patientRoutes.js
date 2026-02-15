const express = require('express');
const router = express.Router();
const { protect, authorize, requireEmailVerification } = require('../middleware/auth');

const dashboardController = require('../controllers/patientDashboardController');
const doctorController = require('../controllers/patientDoctorController');
const appointmentController = require('../controllers/patientAppointmentController');
const prescriptionController = require('../controllers/patientPrescriptionController');
const reviewController = require('../controllers/patientReviewController');
const notificationController = require('../controllers/patientNotificationController');
const profileController = require('../controllers/patientProfileController');

// All routes require patient auth
router.use(protect, authorize('patient'), requireEmailVerification);

// Dashboard
router.get('/dashboard', dashboardController.getDashboardOverview);

// Doctor Search & Discovery
router.get('/doctors/search', doctorController.searchDoctors);
router.get('/doctors/:doctorId', doctorController.getDoctorProfile);
router.get('/doctors/:doctorId/slots/:date', doctorController.getDoctorSlots);

// Appointments
router.post('/appointments', appointmentController.bookAppointment);
router.get('/appointments', appointmentController.getAppointments);
router.get('/appointments/:appointmentId', appointmentController.getAppointmentDetails);
router.put('/appointments/:appointmentId/cancel', appointmentController.cancelAppointment);
router.put('/appointments/:appointmentId/reschedule', appointmentController.rescheduleAppointment);
router.put('/appointments/:appointmentId/join', appointmentController.joinConsultation);

// Prescriptions
router.get('/prescriptions', prescriptionController.getPrescriptions);
router.get('/prescriptions/:prescriptionId', prescriptionController.getPrescription);

// Reviews
router.post('/reviews', reviewController.submitReview);
router.get('/reviews', reviewController.getMyReviews);

// Notifications
router.get('/notifications', notificationController.getNotifications);
router.put('/notifications/read-all', notificationController.markAllAsRead);
router.put('/notifications/:notificationId/read', notificationController.markAsRead);
router.delete('/notifications/:notificationId', notificationController.deleteNotification);
router.put('/notifications/preferences', notificationController.updatePreferences);

// Profile & Settings
router.get('/profile', profileController.getProfile);
router.put('/profile', profileController.updateProfile);
router.post('/profile/family', profileController.addFamilyMember);
router.delete('/profile/family/:memberId', profileController.removeFamilyMember);
router.post('/profile/medical-records', profileController.uploadMedicalRecord);
router.delete('/profile/medical-records/:recordId', profileController.deleteMedicalRecord);
router.put('/profile/preferences', profileController.updatePreferences);

module.exports = router;
