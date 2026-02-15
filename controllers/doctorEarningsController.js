const Payment = require('../models/Payment');
const Doctor = require('../models/Doctor');
const mongoose = require('mongoose');

/**
 * @desc    Get earnings dashboard
 * @route   GET /api/doctor/earnings
 * @access  Private (Doctor)
 */
const getEarningsDashboard = async (req, res) => {
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

        const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

        const [
            todayEarnings,
            weeklyEarnings,
            monthlyEarnings,
            lastMonthEarnings,
            onlineEarnings,
            offlineEarnings,
            doctor,
            dailyBreakdown,
            pendingPayouts,
            recentTransactions,
            refundTotal,
        ] = await Promise.all([
            // Today
            Payment.aggregate([
                { $match: { doctor: new mongoose.Types.ObjectId(doctorId), status: 'completed', paidAt: { $gte: today, $lt: tomorrow } } },
                { $group: { _id: null, total: { $sum: '$breakdown.doctorEarning' }, count: { $sum: 1 }, grossTotal: { $sum: '$amount' }, commission: { $sum: '$breakdown.platformCommission' } } },
            ]),

            // Weekly
            Payment.aggregate([
                { $match: { doctor: new mongoose.Types.ObjectId(doctorId), status: 'completed', paidAt: { $gte: startOfWeek, $lt: endOfWeek } } },
                { $group: { _id: null, total: { $sum: '$breakdown.doctorEarning' }, count: { $sum: 1 }, grossTotal: { $sum: '$amount' }, commission: { $sum: '$breakdown.platformCommission' } } },
            ]),

            // Monthly
            Payment.aggregate([
                { $match: { doctor: new mongoose.Types.ObjectId(doctorId), status: 'completed', paidAt: { $gte: startOfMonth, $lte: endOfMonth } } },
                { $group: { _id: null, total: { $sum: '$breakdown.doctorEarning' }, count: { $sum: 1 }, grossTotal: { $sum: '$amount' }, commission: { $sum: '$breakdown.platformCommission' } } },
            ]),

            // Last month (for comparison)
            Payment.aggregate([
                { $match: { doctor: new mongoose.Types.ObjectId(doctorId), status: 'completed', paidAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
                { $group: { _id: null, total: { $sum: '$breakdown.doctorEarning' }, count: { $sum: 1 } } },
            ]),

            // Online earnings this month
            Payment.aggregate([
                {
                    $match: { doctor: new mongoose.Types.ObjectId(doctorId), status: 'completed', paidAt: { $gte: startOfMonth, $lte: endOfMonth } },
                },
                {
                    $lookup: { from: 'appointments', localField: 'appointment', foreignField: '_id', as: 'appointmentInfo' },
                },
                { $unwind: '$appointmentInfo' },
                { $match: { 'appointmentInfo.consultationType': 'online' } },
                { $group: { _id: null, total: { $sum: '$breakdown.doctorEarning' }, count: { $sum: 1 } } },
            ]),

            // Offline earnings this month
            Payment.aggregate([
                {
                    $match: { doctor: new mongoose.Types.ObjectId(doctorId), status: 'completed', paidAt: { $gte: startOfMonth, $lte: endOfMonth } },
                },
                {
                    $lookup: { from: 'appointments', localField: 'appointment', foreignField: '_id', as: 'appointmentInfo' },
                },
                { $unwind: '$appointmentInfo' },
                { $match: { 'appointmentInfo.consultationType': 'offline' } },
                { $group: { _id: null, total: { $sum: '$breakdown.doctorEarning' }, count: { $sum: 1 } } },
            ]),

            // Doctor summary
            Doctor.findById(doctorId).select('earningsSummary bankDetails payoutCycle').lean(),

            // Daily breakdown for chart (last 30 days)
            Payment.aggregate([
                {
                    $match: {
                        doctor: new mongoose.Types.ObjectId(doctorId),
                        status: 'completed',
                        paidAt: { $gte: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000) },
                    },
                },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } },
                        earnings: { $sum: '$breakdown.doctorEarning' },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),

            // Pending payouts
            Payment.aggregate([
                {
                    $match: {
                        doctor: new mongoose.Types.ObjectId(doctorId),
                        status: 'completed',
                        'payout.status': { $in: ['pending', ''] },
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

            // Recent transactions
            Payment.find({ doctor: doctorId, status: { $in: ['completed', 'refunded'] } })
                .populate('appointment', 'appointmentDate timeSlot consultationType')
                .populate('patient', 'fullName profilePhoto')
                .sort({ createdAt: -1 })
                .limit(10)
                .lean(),

            // Total refunds
            Payment.aggregate([
                {
                    $match: {
                        doctor: new mongoose.Types.ObjectId(doctorId),
                        status: { $in: ['refunded', 'partially_refunded'] },
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$refund.amount' },
                        count: { $sum: 1 },
                    },
                },
            ]),
        ]);

        // Calculate month-over-month growth
        const currentMonthTotal = monthlyEarnings[0]?.total || 0;
        const lastMonthTotal = lastMonthEarnings[0]?.total || 0;
        const monthlyGrowth = lastMonthTotal > 0
            ? Math.round(((currentMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 * 100) / 100
            : 0;

        res.status(200).json({
            success: true,
            data: {
                summary: {
                    today: { earnings: todayEarnings[0]?.total || 0, count: todayEarnings[0]?.count || 0 },
                    weekly: { earnings: weeklyEarnings[0]?.total || 0, count: weeklyEarnings[0]?.count || 0 },
                    monthly: {
                        earnings: currentMonthTotal,
                        count: monthlyEarnings[0]?.count || 0,
                        grossTotal: monthlyEarnings[0]?.grossTotal || 0,
                        commission: monthlyEarnings[0]?.commission || 0,
                        growth: monthlyGrowth,
                    },
                    online: { earnings: onlineEarnings[0]?.total || 0, count: onlineEarnings[0]?.count || 0 },
                    offline: { earnings: offlineEarnings[0]?.total || 0, count: offlineEarnings[0]?.count || 0 },
                    totalEarnings: doctor?.earningsSummary?.totalEarnings || 0,
                    pendingPayout: pendingPayouts[0]?.total || 0,
                    pendingPayoutCount: pendingPayouts[0]?.count || 0,
                    totalPaidOut: doctor?.earningsSummary?.totalPaidOut || 0,
                    totalRefunds: refundTotal[0]?.total || 0,
                    refundCount: refundTotal[0]?.count || 0,
                },
                bankDetails: doctor?.bankDetails || {},
                payoutCycle: doctor?.payoutCycle || 'weekly',
                dailyChart: dailyBreakdown,
                recentTransactions,
            },
        });
    } catch (error) {
        console.error('Get earnings dashboard error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch earnings data.' });
    }
};
/**
 
* @desc    Get transaction history with pagination
 * @route   GET /api/doctor/earnings/transactions
 * @access  Private (Doctor)
 */
const getTransactions = async (req, res) => {
    try {
        const doctorId = req.user._id;
        const {
            page = 1,
            limit = 20,
            status,
            startDate,
            endDate,
            paymentMethod,
        } = req.query;

        const query = { doctor: doctorId };

        if (status) {
            query.status = status;
        } else {
            query.status = { $in: ['completed', 'refunded', 'partially_refunded', 'failed'] };
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        if (paymentMethod) query.paymentMethod = paymentMethod;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [transactions, total] = await Promise.all([
            Payment.find(query)
                .populate('appointment', 'appointmentDate timeSlot consultationType status')
                .populate('patient', 'fullName email profilePhoto')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Payment.countDocuments(query),
        ]);

        res.status(200).json({
            success: true,
            data: {
                transactions,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    hasMore: skip + transactions.length < total,
                },
            },
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch transactions.' });
    }
};

/**
 * @desc    Get payout history
 * @route   GET /api/doctor/earnings/payouts
 * @access  Private (Doctor)
 */
const getPayoutHistory = async (req, res) => {
    try {
        const doctorId = req.user._id;
        const { page = 1, limit = 20, status } = req.query;

        const query = {
            doctor: doctorId,
            'payout.status': { $ne: '' },
        };

        if (status) query['payout.status'] = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [payouts, total] = await Promise.all([
            Payment.find(query)
                .select('amount breakdown payout createdAt invoiceNumber')
                .sort({ 'payout.processedAt': -1, createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Payment.countDocuments(query),
        ]);

        res.status(200).json({
            success: true,
            data: {
                payouts,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / parseInt(limit)),
                },
            },
        });
    } catch (error) {
        console.error('Get payout history error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch payout history.' });
    }
};

module.exports = {
    getEarningsDashboard,
    getTransactions,
    getPayoutHistory,
};