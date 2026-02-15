const Payment = require('../models/Payment');
const Appointment = require('../models/Appointment');
const ErrorResponse = require('../utils/errorResponse');

// ============================================================================
// @desc    Get all payments (with filters, pagination)
// @route   GET /api/admin/payments
// ============================================================================
exports.getAllPayments = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, status, paymentMethod, startDate, endDate, search } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (paymentMethod) filter.paymentMethod = paymentMethod;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Payment.countDocuments(filter);

        const payments = await Payment.find(filter)
            .populate('patient', 'fullName email')
            .populate('doctor', 'fullName email specializations')
            .populate('appointment', 'appointmentDate consultationType status')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            data: {
                payments,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalPayments: total,
                    limit: parseInt(limit),
                    hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
                    hasPrev: parseInt(page) > 1,
                },
            },
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Get revenue dashboard stats
// @route   GET /api/admin/payments/revenue
// ============================================================================
exports.getRevenueDashboard = async (req, res, next) => {
    try {
        const today = new Date();
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const yearStart = new Date(today.getFullYear(), 0, 1);

        const [overview, monthly, byMethod, recentRefunds] = await Promise.all([
            // Overall revenue
            Payment.aggregate([
                { $match: { status: 'completed' } },
                {
                    $group: {
                        _id: null,
                        grossRevenue: { $sum: '$amount' },
                        platformCommission: { $sum: '$breakdown.platformCommission' },
                        doctorEarnings: { $sum: '$breakdown.doctorEarning' },
                        onlineFees: { $sum: '$breakdown.onlinePaymentFee' },
                        totalTransactions: { $sum: 1 },
                    },
                },
            ]),
            // Monthly breakdown
            Payment.aggregate([
                { $match: { status: 'completed', createdAt: { $gte: yearStart } } },
                {
                    $group: {
                        _id: { $month: '$createdAt' },
                        revenue: { $sum: '$amount' },
                        commission: { $sum: '$breakdown.platformCommission' },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
            // By payment method
            Payment.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            ]),
            // Recent refunds
            Payment.find({ status: { $in: ['refunded', 'partially_refunded'] } })
                .populate('patient', 'fullName email')
                .populate('doctor', 'fullName')
                .sort({ 'refund.refundedAt': -1 })
                .limit(10),
        ]);

        const pending = await Payment.aggregate([
            { $match: { status: 'pending' } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]);

        const failed = await Payment.aggregate([
            { $match: { status: 'failed' } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]);

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        res.status(200).json({
            success: true,
            data: {
                overview: overview[0] || { grossRevenue: 0, platformCommission: 0, doctorEarnings: 0, onlineFees: 0, totalTransactions: 0 },
                pending: pending[0] || { total: 0, count: 0 },
                failed: failed[0] || { total: 0, count: 0 },
                monthlyRevenue: monthly.map((m) => ({ month: monthNames[m._id - 1], revenue: m.revenue, commission: m.commission, count: m.count })),
                byMethod,
                recentRefunds,
            },
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Get payout management data
// @route   GET /api/admin/payments/payouts
// ============================================================================
exports.getPayouts = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, status } = req.query;

        const filter = { 'payout.status': { $ne: '' } };
        if (status) filter['payout.status'] = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Payment.countDocuments(filter);

        const payouts = await Payment.find(filter)
            .populate('doctor', 'fullName email mobileNumber bankDetails')
            .populate('appointment', 'appointmentDate consultationType')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const payoutStats = await Payment.aggregate([
            { $match: { 'payout.status': { $ne: '' } } },
            { $group: { _id: '$payout.status', total: { $sum: '$payout.amount' }, count: { $sum: 1 } } },
        ]);

        res.status(200).json({
            success: true,
            data: {
                payouts,
                stats: payoutStats,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalPayouts: total,
                    limit: parseInt(limit),
                    hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
                    hasPrev: parseInt(page) > 1,
                },
            },
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Process a refund
// @route   PUT /api/admin/payments/:id/refund
// ============================================================================
exports.processRefund = async (req, res, next) => {
    try {
        const { amount, reason, type } = req.body;
        const payment = await Payment.findById(req.params.id);
        if (!payment) return next(new ErrorResponse('Payment not found', 404));
        if (payment.status !== 'completed') return next(new ErrorResponse('Only completed payments can be refunded', 400));
        if (type === 'partial' && (!amount || amount <= 0 || amount >= payment.amount)) {
            return next(new ErrorResponse('Invalid refund amount', 400));
        }

        const refundAmount = type === 'full' ? payment.amount : amount;
        payment.refund = {
            amount: refundAmount,
            reason: reason || '',
            refundedAt: new Date(),
            refundedBy: req.user._id,
            type,
        };
        payment.status = type === 'full' ? 'refunded' : 'partially_refunded';
        await payment.save();

        if (req.user.logAction) {
            await req.user.logAction('process_refund', `${type} refund of ₹${refundAmount} for payment ${payment._id}`);
        }

        res.status(200).json({ success: true, message: 'Refund processed', data: { payment } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Process doctor payout
// @route   PUT /api/admin/payments/:id/payout
// ============================================================================
exports.processPayout = async (req, res, next) => {
    try {
        const { bankReference } = req.body;
        const payment = await Payment.findById(req.params.id);
        if (!payment) return next(new ErrorResponse('Payment not found', 404));
        if (payment.status !== 'completed') return next(new ErrorResponse('Payment not completed', 400));

        payment.payout = {
            status: 'completed',
            amount: payment.breakdown.doctorEarning || 0,
            processedAt: new Date(),
            transactionId: `PO-${Date.now()}`,
            bankReference: bankReference || '',
        };
        await payment.save();

        if (req.user.logAction) {
            await req.user.logAction('process_payout', `Doctor payout of ₹${payment.payout.amount} for payment ${payment._id}`);
        }

        res.status(200).json({ success: true, message: 'Payout processed', data: { payment } });
    } catch (err) {
        next(err);
    }
};
