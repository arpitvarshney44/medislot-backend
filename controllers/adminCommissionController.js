const SystemSettings = require('../models/SystemSettings');
const Doctor = require('../models/Doctor');
const ErrorResponse = require('../utils/errorResponse');

// ============================================================================
// @desc    Get commission settings
// @route   GET /api/admin/commission
// ============================================================================
exports.getCommissionSettings = async (req, res, next) => {
    try {
        const globalCommission = await SystemSettings.getSetting('global_commission_percentage', 15);
        const minConsultationFee = await SystemSettings.getSetting('min_consultation_fee', 100);
        const onlinePaymentFee = await SystemSettings.getSetting('online_payment_fee_percentage', 2);
        const discountRules = await SystemSettings.getSetting('discount_rules', []);
        const activeCoupons = await SystemSettings.getSetting('active_coupons', []);

        // Doctor-specific overrides
        const doctorOverrides = await Doctor.find(
            { 'commissionOverride': { $exists: true, $ne: null } },
            'fullName email specializations commissionOverride'
        ).lean();

        res.status(200).json({
            success: true,
            data: {
                globalCommission,
                minConsultationFee,
                onlinePaymentFee,
                discountRules,
                activeCoupons,
                doctorOverrides,
            },
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Update global commission
// @route   PUT /api/admin/commission/global
// ============================================================================
exports.updateGlobalCommission = async (req, res, next) => {
    try {
        const { percentage } = req.body;
        if (percentage === undefined || percentage < 0 || percentage > 100) {
            return next(new ErrorResponse('Commission must be between 0-100%', 400));
        }

        await SystemSettings.setSetting('global_commission_percentage', percentage, 'commission', 'Global platform commission %', req.user._id);

        if (req.user.logAction) {
            await req.user.logAction('update_commission', `Global commission updated to ${percentage}%`);
        }

        res.status(200).json({ success: true, message: `Global commission set to ${percentage}%` });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Set doctor-specific commission override
// @route   PUT /api/admin/commission/doctor/:doctorId
// ============================================================================
exports.setDoctorCommission = async (req, res, next) => {
    try {
        const { percentage } = req.body;
        const doctor = await Doctor.findById(req.params.doctorId);
        if (!doctor) return next(new ErrorResponse('Doctor not found', 404));

        if (percentage === null || percentage === undefined) {
            doctor.commissionOverride = undefined;
        } else if (percentage < 0 || percentage > 100) {
            return next(new ErrorResponse('Commission must be between 0-100%', 400));
        } else {
            doctor.commissionOverride = percentage;
        }

        await doctor.save();

        if (req.user.logAction) {
            await req.user.logAction('set_doctor_commission', `Commission override for Dr. ${doctor.fullName}: ${percentage ?? 'removed'}%`);
        }

        res.status(200).json({ success: true, message: 'Doctor commission override updated' });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Update min consultation fee
// @route   PUT /api/admin/commission/min-fee
// ============================================================================
exports.updateMinConsultationFee = async (req, res, next) => {
    try {
        const { amount } = req.body;
        if (!amount || amount < 0) return next(new ErrorResponse('Invalid amount', 400));

        await SystemSettings.setSetting('min_consultation_fee', amount, 'commission', 'Minimum consultation fee', req.user._id);

        res.status(200).json({ success: true, message: `Min consultation fee set to ₹${amount}` });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Update online payment fee
// @route   PUT /api/admin/commission/online-fee
// ============================================================================
exports.updateOnlinePaymentFee = async (req, res, next) => {
    try {
        const { percentage } = req.body;
        if (percentage === undefined || percentage < 0 || percentage > 100) {
            return next(new ErrorResponse('Fee must be between 0-100%', 400));
        }

        await SystemSettings.setSetting('online_payment_fee_percentage', percentage, 'commission', 'Online payment processing fee %', req.user._id);

        res.status(200).json({ success: true, message: `Online fee set to ${percentage}%` });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Manage discount/coupon rules
// @route   PUT /api/admin/commission/coupons
// ============================================================================
exports.updateCoupons = async (req, res, next) => {
    try {
        const { coupons } = req.body;
        await SystemSettings.setSetting('active_coupons', coupons || [], 'commission', 'Active coupon codes', req.user._id);

        res.status(200).json({ success: true, message: 'Coupons updated' });
    } catch (err) {
        next(err);
    }
};
