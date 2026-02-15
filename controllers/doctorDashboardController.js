const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const Doctor = require('../models/Doctor');

/**
 * @desc    Get doctor dashboard overview
 * @route   GET /api/doctor/dashboard
 * @access  Private (Doctor)
 */
const getDashboardOverview = async (req, res) => {
    try {
        const doctorId = req.user._id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const startOfWeek = new Date(today);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 7);

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

        // Run all queries in parallel for performance
        const [
            todayAppointments,
            todayAppointmentCount,
            upcomingAppointments,
            pendingRequests,
            pendingRequestCount,
            todayEarnings,
            weeklyEarnings,
            monthlyEarnings,
            totalCompletedToday,
            totalCancelledToday,
            recentReviews,
            unreadNotifications,
            doctor,
            monthlyAppointmentStats,
            onlineVsOfflineToday,
        ] = await Promise.all([
            // Today's appointments (all statuses)
            Appointment.find({
                doctor: doctorId,
                appointmentDate: { $gte: today, $lt: tomorrow },
                status: { $in: ['confirmed', 'ongoing', 'completed', 'pending'] },
            })
                .populate('patient', 'fullName email mobileNumber profilePhoto gender')
                .sort({ 'timeSlot.start': 1 })
                .lean(),

            // Today's appointment count
            Appointment.countDocuments({
                doctor: doctorId,
                appointmentDate: { $gte: today, $lt: tomorrow },
                status: { $in: ['confirmed', 'ongoing', 'completed', 'pending'] },
            }),

            // Upcoming appointments (next 7 days, confirmed only)
            Appointment.find({
                doctor: doctorId,
                appointmentDate: { $gte: today, $lte: endOfWeek },
                status: { $in: ['confirmed', 'pending'] },
            })
                .populate('patient', 'fullName email mobileNumber profilePhoto gender')
                .sort({ appointmentDate: 1, 'timeSlot.start': 1 })
                .limit(10)
                .lean(),

            // Pending appointment requests
            Appointment.find({
                doctor: doctorId,
                status: 'pending',
            })
                .populate('patient', 'fullName email mobileNumber profilePhoto gender')
                .sort({ createdAt: -1 })
                .limit(10)
                .lean(),

            // Pending request count
            Appointment.countDocuments({
                doctor: doctorId,
                status: 'pending',
            }),

            // Today's earnings
            Payment.aggregate([
                {
                    $match: {
                        doctor: doctorId,
                        status: 'completed',
                        paidAt: { $gte: today, $lt: tomorrow },
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$breakdown.doctorEarning' },
                        count: { $sum: 1 },
                    },
                },
            ]),

            // Weekly earnings
            Payment.aggregate([
                {
                    $match: {
                        doctor: doctorId,
                        status: 'completed',
                        paidAt: { $gte: startOfWeek, $lt: endOfWeek },
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$breakdown.doctorEarning' },
                        count: { $sum: 1 },
                    },
                },
            ]),

            // Monthly earnings
            Payment.aggregate([
                {
                    $match: {
                        doctor: doctorId,
                        status: 'completed',
                        paidAt: { $gte: startOfMonth, $lte: endOfMonth },
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$breakdown.doctorEarning' },
                        count: { $sum: 1 },
                    },
                },
            ]),

            // Completed today
            Appointment.countDocuments({
                doctor: doctorId,
                appointmentDate: { $gte: today, $lt: tomorrow },
                status: 'completed',
            }),

            // Cancelled today
            Appointment.countDocuments({
                doctor: doctorId,
                appointmentDate: { $gte: today, $lt: tomorrow },
                status: 'cancelled',
            }),

            // Recent reviews
            Review.find({ doctor: doctorId, isHidden: false })
                .populate('patient', 'fullName profilePhoto')
                .sort({ createdAt: -1 })
                .limit(5)
                .lean(),

            // Unread notifications count
            Notification.countDocuments({
                recipient: doctorId,
                recipientModel: 'Doctor',
                isRead: false,
            }),

            // Doctor profile for summary data
            Doctor.findById(doctorId)
                .select('ratingSummary earningsSummary verificationStatus fullName profilePhoto')
                .lean(),

            // Monthly appointment stats (for chart)
            Appointment.aggregate([
                {
                    $match: {
                        doctor: doctorId,
                        appointmentDate: { $gte: startOfMonth, $lte: endOfMonth },
                    },
                },
                {
                    $group: {
                        _id: {
                            date: { $dateToString: { format: '%Y-%m-%d', date: '$appointmentDate' } },
                            status: '$status',
                        },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { '_id.date': 1 } },
            ]),

            // Online vs Offline today
            Appointment.aggregate([
                {
                    $match: {
                        doctor: doctorId,
                        appointmentDate: { $gte: today, $lt: tomorrow },
                        status: { $in: ['confirmed', 'ongoing', 'completed', 'pending'] },
                    },
                },
                {
                    $group: {
                        _id: '$consultationType',
                        count: { $sum: 1 },
                    },
                },
            ]),
        ]);

        // Process online vs offline counts
        const onlineCount = onlineVsOfflineToday.find((o) => o._id === 'online')?.count || 0;
        const offlineCount = onlineVsOfflineToday.find((o) => o._id === 'offline')?.count || 0;

        // Process monthly stats for chart data
        const chartData = {};
        monthlyAppointmentStats.forEach((stat) => {
            if (!chartData[stat._id.date]) {
                chartData[stat._id.date] = { date: stat._id.date, completed: 0, cancelled: 0, pending: 0, confirmed: 0, total: 0 };
            }
            chartData[stat._id.date][stat._id.status] = stat.count;
            chartData[stat._id.date].total += stat.count;
        });

        res.status(200).json({
            success: true,
            data: {
                // Doctor info
                doctor: {
                    fullName: doctor?.fullName,
                    profilePhoto: doctor?.profilePhoto,
                    verificationStatus: doctor?.verificationStatus,
                    ratingSummary: doctor?.ratingSummary,
                },

                // Today's summary
                todaySummary: {
                    totalAppointments: todayAppointmentCount,
                    completed: totalCompletedToday,
                    cancelled: totalCancelledToday,
                    pending: pendingRequestCount,
                    online: onlineCount,
                    offline: offlineCount,
                },

                // Earnings
                earnings: {
                    today: todayEarnings[0]?.total || 0,
                    todayCount: todayEarnings[0]?.count || 0,
                    weekly: weeklyEarnings[0]?.total || 0,
                    weeklyCount: weeklyEarnings[0]?.count || 0,
                    monthly: monthlyEarnings[0]?.total || 0,
                    monthlyCount: monthlyEarnings[0]?.count || 0,
                    totalEarnings: doctor?.earningsSummary?.totalEarnings || 0,
                    pendingPayout: doctor?.earningsSummary?.pendingPayout || 0,
                },

                // Appointments
                todayAppointments,
                upcomingAppointments,
                pendingRequests,

                // Reviews
                recentReviews,
                averageRating: doctor?.ratingSummary?.averageRating || 0,
                totalReviews: doctor?.ratingSummary?.totalReviews || 0,

                // Notifications
                unreadNotifications,

                // Chart data
                monthlyChart: Object.values(chartData),
            },
        });
    } catch (error) {
        console.error('Dashboard overview error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load dashboard data.',
        });
    }
};
/*
*
 * @desc    Get today's appointment schedule
 * @route   GET /api/doctor/dashboard/today-schedule
 * @access  Private (Doctor)
 */
const getTodaySchedule = async (req, res) => {
    try {
        const doctorId = req.user._id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const appointments = await Appointment.find({
            doctor: doctorId,
            appointmentDate: { $gte: today, $lt: tomorrow },
            status: { $in: ['confirmed', 'ongoing', 'completed', 'pending'] },
        })
            .populate('patient', 'fullName email mobileNumber profilePhoto gender dateOfBirth')
            .populate('payment', 'status amount')
            .sort({ 'timeSlot.start': 1 })
            .lean();

        // Group by status
        const grouped = {
            pending: appointments.filter((a) => a.status === 'pending'),
            confirmed: appointments.filter((a) => a.status === 'confirmed'),
            ongoing: appointments.filter((a) => a.status === 'ongoing'),
            completed: appointments.filter((a) => a.status === 'completed'),
        };

        res.status(200).json({
            success: true,
            data: {
                total: appointments.length,
                appointments,
                grouped,
            },
        });
    } catch (error) {
        console.error('Today schedule error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load today\'s schedule.',
        });
    }
};

/**
 * @desc    Get quick stats for dashboard cards
 * @route   GET /api/doctor/dashboard/quick-stats
 * @access  Private (Doctor)
 */
const getQuickStats = async (req, res) => {
    try {
        const doctorId = req.user._id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const [
            totalPatients,
            totalAppointments,
            pendingCount,
            todayCount,
            completedCount,
            totalReviews,
        ] = await Promise.all([
            Appointment.distinct('patient', { doctor: doctorId, status: 'completed' }).then((ids) => ids.length),
            Appointment.countDocuments({ doctor: doctorId }),
            Appointment.countDocuments({ doctor: doctorId, status: 'pending' }),
            Appointment.countDocuments({
                doctor: doctorId,
                appointmentDate: { $gte: today, $lt: tomorrow },
                status: { $in: ['confirmed', 'ongoing', 'completed', 'pending'] },
            }),
            Appointment.countDocuments({ doctor: doctorId, status: 'completed' }),
            Review.countDocuments({ doctor: doctorId, isHidden: false }),
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalPatients,
                totalAppointments,
                pendingRequests: pendingCount,
                todayAppointments: todayCount,
                completedAppointments: completedCount,
                totalReviews,
            },
        });
    } catch (error) {
        console.error('Quick stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load quick stats.',
        });
    }
};

module.exports = {
    getDashboardOverview,
    getTodaySchedule,
    getQuickStats,
};