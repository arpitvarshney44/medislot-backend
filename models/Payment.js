const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
    {
        // -----------------------------------------------------------------------
        // References
        // -----------------------------------------------------------------------
        appointment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Appointment',
            required: true,
        },
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
            required: true,
        },

        // -----------------------------------------------------------------------
        // Payment Details
        // -----------------------------------------------------------------------
        amount: {
            type: Number,
            required: [true, 'Payment amount is required'],
            min: 0,
        },
        currency: {
            type: String,
            default: 'INR',
        },
        paymentMethod: {
            type: String,
            enum: ['card', 'upi', 'netbanking', 'wallet', 'cash', 'other'],
            default: 'other',
        },
        paymentGateway: {
            type: String,
            enum: ['razorpay', 'stripe', 'paytm', 'cash', 'manual', 'other'],
            default: 'other',
        },

        // -----------------------------------------------------------------------
        // Transaction Info
        // -----------------------------------------------------------------------
        transactionId: {
            type: String,
            default: '',
        },
        gatewayOrderId: {
            type: String,
            default: '',
        },
        gatewayPaymentId: {
            type: String,
            default: '',
        },
        gatewaySignature: {
            type: String,
            default: '',
        },

        // -----------------------------------------------------------------------
        // Status
        // -----------------------------------------------------------------------
        status: {
            type: String,
            enum: ['pending', 'completed', 'failed', 'refunded', 'partially_refunded'],
            default: 'pending',
        },
        paidAt: {
            type: Date,
            default: null,
        },
        failureReason: {
            type: String,
            default: '',
        },

        // -----------------------------------------------------------------------
        // Commission Breakdown
        // -----------------------------------------------------------------------
        breakdown: {
            consultationFee: { type: Number, default: 0 },
            platformCommission: { type: Number, default: 0 },
            commissionPercentage: { type: Number, default: 0 },
            onlinePaymentFee: { type: Number, default: 0 }, // 2% processing
            doctorEarning: { type: Number, default: 0 },
            tax: { type: Number, default: 0 },
        },

        // -----------------------------------------------------------------------
        // Refund
        // -----------------------------------------------------------------------
        refund: {
            amount: { type: Number, default: 0 },
            reason: { type: String, default: '' },
            refundedAt: { type: Date, default: null },
            refundedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Admin',
                default: null,
            },
            transactionId: { type: String, default: '' },
            type: {
                type: String,
                enum: ['full', 'partial', ''],
                default: '',
            },
        },

        // -----------------------------------------------------------------------
        // Payout (to doctor)
        // -----------------------------------------------------------------------
        payout: {
            status: {
                type: String,
                enum: ['pending', 'processing', 'completed', 'failed', ''],
                default: '',
            },
            amount: { type: Number, default: 0 },
            processedAt: { type: Date, default: null },
            transactionId: { type: String, default: '' },
            bankReference: { type: String, default: '' },
        },

        // -----------------------------------------------------------------------
        // Invoice
        // -----------------------------------------------------------------------
        invoiceNumber: {
            type: String,
            default: '',
        },
        invoiceUrl: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Indexes
paymentSchema.index({ appointment: 1 });
paymentSchema.index({ patient: 1 });
paymentSchema.index({ doctor: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ transactionId: 1 });
paymentSchema.index({ 'payout.status': 1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
