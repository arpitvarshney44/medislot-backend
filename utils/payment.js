/**
 * Payment Gateway Integration (Razorpay)
 * Handles order creation, verification, refunds, and payouts
 */

const crypto = require('crypto');
const Payment = require('../models/Payment');

let razorpayInstance = null;

const getRazorpay = () => {
    if (!razorpayInstance) {
        const Razorpay = require('razorpay');
        razorpayInstance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
    }
    return razorpayInstance;
};

/**
 * Create a Razorpay order for appointment payment
 */
const createOrder = async ({ amount, currency = 'INR', appointmentId, patientId, doctorId, notes = {} }) => {
    try {
        const razorpay = getRazorpay();
        const options = {
            amount: Math.round(amount * 100), // paise
            currency,
            receipt: `apt_${appointmentId}`,
            notes: {
                appointmentId: appointmentId.toString(),
                patientId: patientId.toString(),
                doctorId: doctorId.toString(),
                ...notes,
            },
        };

        const order = await razorpay.orders.create(options);

        // Calculate commission breakdown
        const onlinePaymentFee = Math.round(amount * 0.02 * 100) / 100;
        const doctorEarning = amount - onlinePaymentFee;

        await Payment.create({
            appointment: appointmentId,
            patient: patientId,
            doctor: doctorId,
            amount,
            currency,
            paymentGateway: 'razorpay',
            status: 'pending',
            gatewayOrderId: order.id,
            breakdown: {
                consultationFee: amount,
                platformCommission: onlinePaymentFee,
                commissionPercentage: 2,
                onlinePaymentFee,
                doctorEarning,
            },
        });

        return { success: true, order };
    } catch (error) {
        console.error('❌ Razorpay order creation failed:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Verify Razorpay payment signature
 */
const verifyPayment = ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
    try {
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');
        return expectedSignature === razorpay_signature;
    } catch (error) {
        console.error('❌ Payment verification failed:', error);
        return false;
    }
};

/**
 * Process successful payment after signature verification
 */
const processPaymentSuccess = async ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
    try {
        const payment = await Payment.findOne({ gatewayOrderId: razorpay_order_id });
        if (!payment) return { success: false, message: 'Payment record not found' };

        const isValid = verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
        if (!isValid) {
            payment.status = 'failed';
            payment.failureReason = 'Signature verification failed';
            await payment.save();
            return { success: false, message: 'Payment verification failed' };
        }

        payment.status = 'completed';
        payment.gatewayPaymentId = razorpay_payment_id;
        payment.gatewaySignature = razorpay_signature;
        payment.paidAt = new Date();
        payment.transactionId = razorpay_payment_id;
        await payment.save();

        // Update appointment payment reference
        const Appointment = require('../models/Appointment');
        await Appointment.findByIdAndUpdate(payment.appointment, {
            payment: payment._id,
        });

        return { success: true, payment };
    } catch (error) {
        console.error('❌ Payment processing failed:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Process refund (full or partial)
 */
const processRefund = async ({ paymentId, amount, reason, refundedBy }) => {
    try {
        const payment = await Payment.findById(paymentId);
        if (!payment || payment.status !== 'completed') {
            return { success: false, message: 'Payment not found or not eligible for refund' };
        }

        const refundAmount = amount || payment.amount;
        const razorpay = getRazorpay();

        const refund = await razorpay.payments.refund(payment.gatewayPaymentId, {
            amount: Math.round(refundAmount * 100),
            notes: { reason: reason || 'Appointment cancellation' },
        });

        payment.status = refundAmount >= payment.amount ? 'refunded' : 'partially_refunded';
        payment.refund = {
            amount: refundAmount,
            reason: reason || 'Appointment cancellation',
            refundedAt: new Date(),
            refundedBy: refundedBy || null,
            transactionId: refund.id,
            type: refundAmount >= payment.amount ? 'full' : 'partial',
        };
        await payment.save();

        return { success: true, refund, payment };
    } catch (error) {
        console.error('❌ Refund failed:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Create payout record for doctor earnings
 */
const createPayout = async ({ doctorId, amount, bankDetails }) => {
    try {
        // Find unpaid completed payments for this doctor
        const payments = await Payment.find({
            doctor: doctorId,
            status: 'completed',
            'payout.status': { $in: ['', 'pending'] },
        });

        if (!payments.length) {
            return { success: false, message: 'No pending payouts found' };
        }

        // Mark payments as processing
        const paymentIds = payments.map(p => p._id);
        await Payment.updateMany(
            { _id: { $in: paymentIds } },
            {
                'payout.status': 'processing',
                'payout.amount': amount,
                'payout.processedAt': new Date(),
                'payout.bankReference': bankDetails?.accountNumber?.slice(-4) || '',
            }
        );

        return { success: true, paymentIds, totalAmount: amount };
    } catch (error) {
        console.error('❌ Payout creation failed:', error);
        return { success: false, error: error.message };
    }
};

module.exports = { createOrder, verifyPayment, processPaymentSuccess, processRefund, createPayout, getRazorpay };
