const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Review = require('../models/Review');
const ErrorResponse = require('../utils/errorResponse');

// ============================================================================
// @desc    Generate appointments report
// @route   GET /api/admin/reports/appointments
// ============================================================================
exports.appointmentsReport = async (req, res, next) => {
    try {
        const { startDate, endDate, groupBy = 'day' } = req.query;

        const dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate) dateFilter.$lte = new Date(endDate);

        const matchStage = Object.keys(dateFilter).length ? { $match: { appointmentDate: dateFilter } } : { $match: {} };

        let groupId;
        if (groupBy === 'month') groupId = { year: { $year: '$appointmentDate' }, month: { $month: '$appointmentDate' } };
        else if (groupBy === 'week') groupId = { year: { $year: '$appointmentDate' }, week: { $week: '$appointmentDate' } };
        else groupId = { $dateToString: { format: '%Y-%m-%d', date: '$appointmentDate' } };

        const trend = await Appointment.aggregate([
            matchStage,
            { $group: { _id: groupId, total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }, noShow: { $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] } } } },
            { $sort: { _id: 1 } },
        ]);

        const summary = await Appointment.aggregate([
            matchStage,
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);

        const byType = await Appointment.aggregate([
            matchStage,
            { $group: { _id: '$consultationType', count: { $sum: 1 } } },
        ]);

        res.status(200).json({ success: true, data: { trend, summary, byType } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Generate revenue report
// @route   GET /api/admin/reports/revenue
// ============================================================================
exports.revenueReport = async (req, res, next) => {
    try {
        const { startDate, endDate, groupBy = 'day' } = req.query;

        const dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate) dateFilter.$lte = new Date(endDate);

        const matchStage = { $match: { status: 'completed' } };
        if (Object.keys(dateFilter).length) matchStage.$match.paidAt = dateFilter;

        let groupId;
        if (groupBy === 'month') groupId = { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } };
        else groupId = { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } };

        const trend = await Payment.aggregate([
            matchStage,
            { $group: { _id: groupId, revenue: { $sum: '$amount' }, commission: { $sum: '$breakdown.platformCommission' }, doctorPay: { $sum: '$breakdown.doctorEarning' }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]);

        const totals = await Payment.aggregate([
            matchStage,
            { $group: { _id: null, totalRevenue: { $sum: '$amount' }, totalCommission: { $sum: '$breakdown.platformCommission' }, totalDoctorEarnings: { $sum: '$breakdown.doctorEarning' }, avgTransaction: { $avg: '$amount' }, totalTransactions: { $sum: 1 } } },
        ]);

        res.status(200).json({ success: true, data: { trend, totals: totals[0] || {} } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Generate doctor performance report
// @route   GET /api/admin/reports/doctor-performance
// ============================================================================
exports.doctorPerformanceReport = async (req, res, next) => {
    try {
        const { startDate, endDate, limit = 20 } = req.query;

        const dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate) dateFilter.$lte = new Date(endDate);

        const matchStage = Object.keys(dateFilter).length ? { $match: { appointmentDate: dateFilter } } : { $match: {} };

        const performance = await Appointment.aggregate([
            matchStage,
            {
                $group: {
                    _id: '$doctor',
                    totalAppointments: { $sum: 1 },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                    noShow: { $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] } },
                    totalRevenue: { $sum: '$consultationFee' },
                },
            },
            { $sort: { totalAppointments: -1 } },
            { $limit: parseInt(limit) },
            {
                $lookup: {
                    from: 'doctors',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'doctor',
                    pipeline: [{ $project: { fullName: 1, email: 1, specializations: 1, profilePhoto: 1 } }],
                },
            },
            { $unwind: '$doctor' },
        ]);

        // Get average ratings
        const ratings = await Review.aggregate([
            { $group: { _id: '$doctor', avgRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } },
        ]);
        const ratingMap = {};
        ratings.forEach((r) => { ratingMap[r._id.toString()] = { avgRating: parseFloat(r.avgRating.toFixed(1)), reviewCount: r.reviewCount }; });

        const enriched = performance.map((p) => ({
            ...p,
            rating: ratingMap[p._id.toString()] || { avgRating: 0, reviewCount: 0 },
            completionRate: p.totalAppointments ? ((p.completed / p.totalAppointments) * 100).toFixed(1) : 0,
        }));

        res.status(200).json({ success: true, data: { doctors: enriched } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    KPI overview
// @route   GET /api/admin/reports/kpis
// ============================================================================
exports.getKPIs = async (req, res, next) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [totalUsers, newUsers30, totalDoctors, activeAppts, avgFee, totalRevenue] = await Promise.all([
            User.countDocuments({ isActive: true }),
            User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
            Doctor.countDocuments({ verificationStatus: 'approved' }),
            Appointment.countDocuments({ status: 'completed', appointmentDate: { $gte: thirtyDaysAgo } }),
            Payment.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, avg: { $avg: '$amount' } } }]),
            Payment.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        ]);

        const retention = totalUsers > 0 ? (((totalUsers - newUsers30) / totalUsers) * 100).toFixed(1) : 0;

        res.status(200).json({
            success: true,
            data: {
                totalActiveUsers: totalUsers,
                newUsersLast30Days: newUsers30,
                approvedDoctors: totalDoctors,
                completedApptsLast30Days: activeAppts,
                avgTransactionValue: avgFee[0]?.avg ? parseFloat(avgFee[0].avg.toFixed(2)) : 0,
                totalRevenue: totalRevenue[0]?.total || 0,
                retentionRate: parseFloat(retention),
            },
        });
    } catch (err) {
        next(err);
    }
};
