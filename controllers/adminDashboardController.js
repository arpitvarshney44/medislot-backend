const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Admin = require('../models/Admin');

// ---------------------------------------------------------------------------
// @desc    Get dashboard overview key metrics
// @route   GET /api/admin/dashboard/overview
// @access  Private (Admin - dashboard view)
// ---------------------------------------------------------------------------
const getDashboardOverview = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - 7);

        // Run all queries in parallel
        const [
            totalUsers,
            activeUsers,
            blockedUsers,
            newUsersToday,
            newUsersMonth,
            totalDoctors,
            approvedDoctors,
            pendingDoctors,
            rejectedDoctors,
            blockedDoctors,
            newDoctorsMonth,
            onlineDoctors,
            totalAdmins,
        ] = await Promise.all([
            // User metrics
            User.countDocuments(),
            User.countDocuments({ isActive: true, isBlocked: false }),
            User.countDocuments({ isBlocked: true }),
            User.countDocuments({ createdAt: { $gte: today } }),
            User.countDocuments({ createdAt: { $gte: monthStart } }),
            // Doctor metrics
            Doctor.countDocuments(),
            Doctor.countDocuments({ verificationStatus: 'approved' }),
            Doctor.countDocuments({ verificationStatus: 'pending' }),
            Doctor.countDocuments({ verificationStatus: 'rejected' }),
            Doctor.countDocuments({ isBlocked: true }),
            Doctor.countDocuments({ createdAt: { $gte: monthStart } }),
            Doctor.countDocuments({ enableOnlineConsultation: true, verificationStatus: 'approved' }),
            // Admin metrics
            Admin.countDocuments({ isActive: true }),
        ]);

        // Revenue & appointment placeholders (will be populated when those models exist)
        // For now we return 0 – these will be computed from real Appointment & Payment models in later phases
        const revenueStats = {
            totalRevenue: 0,
            monthRevenue: 0,
            todayRevenue: 0,
            pendingPayouts: 0,
            platformCommission: 0,
        };

        const appointmentStats = {
            totalAppointments: 0,
            todayAppointments: 0,
            monthAppointments: 0,
            onlineConsultations: 0,
            offlineConsultations: 0,
            cancelledAppointments: 0,
            completedAppointments: 0,
        };

        res.status(200).json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    blocked: blockedUsers,
                    newToday: newUsersToday,
                    newThisMonth: newUsersMonth,
                },
                doctors: {
                    total: totalDoctors,
                    approved: approvedDoctors,
                    pending: pendingDoctors,
                    rejected: rejectedDoctors,
                    blocked: blockedDoctors,
                    newThisMonth: newDoctorsMonth,
                    onlineEnabled: onlineDoctors,
                },
                admins: {
                    total: totalAdmins,
                },
                revenue: revenueStats,
                appointments: appointmentStats,
            },
        });
    } catch (error) {
        console.error('Dashboard overview error:', error);
        res.status(500).json({ success: false, message: 'Failed to load dashboard data.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Get trend analytics data (registrations per day for charts)
// @route   GET /api/admin/dashboard/trends
// @access  Private (Admin - dashboard view)
// ---------------------------------------------------------------------------
const getDashboardTrends = async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const daysCount = Math.min(parseInt(days) || 30, 90);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysCount);
        startDate.setHours(0, 0, 0, 0);

        // User registration trend
        const userTrend = await User.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // Doctor registration trend
        const doctorTrend = await Doctor.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // Doctor onboarding funnel
        const onboardingFunnel = {
            registered: await Doctor.countDocuments(),
            emailVerified: await Doctor.countDocuments({ isEmailVerified: true }),
            documentsUploaded: await Doctor.countDocuments({
                $or: [
                    { 'documents.medicalDegreeCertificate.fileUrl': { $ne: '' } },
                    { 'documents.medicalCouncilCertificate.fileUrl': { $ne: '' } },
                ],
            }),
            approved: await Doctor.countDocuments({ verificationStatus: 'approved' }),
        };

        res.status(200).json({
            success: true,
            data: {
                period: `${daysCount} days`,
                userTrend: userTrend.map(t => ({ date: t._id, count: t.count })),
                doctorTrend: doctorTrend.map(t => ({ date: t._id, count: t.count })),
                onboardingFunnel,
                // Revenue and appointment trends — placeholder until those models exist
                revenueTrend: [],
                appointmentTrend: [],
            },
        });
    } catch (error) {
        console.error('Dashboard trends error:', error);
        res.status(500).json({ success: false, message: 'Failed to load trend data.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Get recent activity feed for admin dashboard
// @route   GET /api/admin/dashboard/activity
// @access  Private (Admin)
// ---------------------------------------------------------------------------
const getRecentActivity = async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const activityLimit = Math.min(parseInt(limit) || 20, 50);

        // Fetch recent users
        const recentUsers = await User.find()
            .sort({ createdAt: -1 })
            .limit(activityLimit)
            .select('fullName email createdAt profilePhoto isEmailVerified');

        // Fetch recent doctors
        const recentDoctors = await Doctor.find()
            .sort({ createdAt: -1 })
            .limit(activityLimit)
            .select('fullName email specializations verificationStatus createdAt profilePhoto');

        // Merge & sort by createdAt desc
        const activity = [
            ...recentUsers.map(u => ({
                type: 'user_registration',
                name: u.fullName,
                email: u.email,
                profilePhoto: u.profilePhoto,
                verified: u.isEmailVerified,
                createdAt: u.createdAt,
            })),
            ...recentDoctors.map(d => ({
                type: 'doctor_registration',
                name: d.fullName,
                email: d.email,
                profilePhoto: d.profilePhoto,
                specializations: d.specializations,
                status: d.verificationStatus,
                createdAt: d.createdAt,
            })),
        ]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, activityLimit);

        res.status(200).json({
            success: true,
            data: { activity },
        });
    } catch (error) {
        console.error('Recent activity error:', error);
        res.status(500).json({ success: false, message: 'Failed to load activity feed.' });
    }
};

module.exports = {
    getDashboardOverview,
    getDashboardTrends,
    getRecentActivity,
};
