const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const Notification = require('../models/Notification');
const Prescription = require('../models/Prescription');

// @desc    Get patient dashboard overview
// @route   GET /api/patient/dashboard
exports.getDashboardOverview = async (req, res, next) => {
    try {
        const patientId = req.user._id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Upcoming appointments
        const upcomingAppointments = await Appointment.find({
            patient: patientId,
            status: { $in: ['confirmed', 'pending'] },
            appointmentDate: { $gte: today },
        })
            .populate('doctor', 'fullName specializations profilePhoto consultationFees')
            .sort({ appointmentDate: 1, 'timeSlot.start': 1 })
            .limit(5)
            .lean();

        // Today's appointments
        const todayAppointments = await Appointment.find({
            patient: patientId,
            status: { $in: ['confirmed', 'in-progress'] },
            appointmentDate: { $gte: today, $lt: tomorrow },
        })
            .populate('doctor', 'fullName specializations profilePhoto')
            .sort({ 'timeSlot.start': 1 })
            .lean();

        // Recent prescriptions
        const recentPrescriptions = await Prescription.find({
            patient: patientId,
            status: 'sent',
        })
            .populate('doctor', 'fullName specializations')
            .sort({ createdAt: -1 })
            .limit(3)
            .lean();

        // Unread notifications count
        const unreadNotifications = await Notification.countDocuments({
            recipient: patientId,
            recipientModel: 'User',
            isRead: false,
        });

        // Recommended doctors (based on past specializations)
        const pastAppointments = await Appointment.find({
            patient: patientId,
            status: 'completed',
        }).populate('doctor', 'specializations').lean();

        const pastSpecializations = [...new Set(pastAppointments.flatMap(a => a.doctor?.specializations || []))];

        let recommendedDoctors = [];
        if (pastSpecializations.length > 0) {
            recommendedDoctors = await Doctor.find({
                specializations: { $in: pastSpecializations },
                verificationStatus: 'approved',
                isActive: true,
            })
                .select('fullName specializations profilePhoto yearsOfExperience consultationFees averageRating totalReviews')
                .sort({ averageRating: -1 })
                .limit(5)
                .lean();
        } else {
            recommendedDoctors = await Doctor.find({
                verificationStatus: 'approved',
                isActive: true,
            })
                .select('fullName specializations profilePhoto yearsOfExperience consultationFees averageRating totalReviews')
                .sort({ averageRating: -1, totalReviews: -1 })
                .limit(5)
                .lean();
        }

        // Stats
        const totalAppointments = await Appointment.countDocuments({ patient: patientId });
        const completedAppointments = await Appointment.countDocuments({ patient: patientId, status: 'completed' });

        res.status(200).json({
            success: true,
            data: {
                upcomingAppointments,
                todayAppointments,
                recentPrescriptions,
                unreadNotifications,
                recommendedDoctors,
                stats: { totalAppointments, completedAppointments },
            },
        });
    } catch (error) {
        next(error);
    }
};
