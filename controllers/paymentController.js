/**
 * Payment Controller
 * Handles payment creation, verification, webhooks, and refunds
 */

const { createOrder, processPaymentSuccess, processRefund, getRazorpay } = require('../utils/payment');
const Payment = require('../models/Payment');
const Appointment = require('../models/Appointment');
const crypto = require('crypto');

/**
 * @desc    Create payment order for an appointment
 * @route   POST /api/payments/create-order
 * @access  Private (Patient)
 */
const createPaymentOrder = async (req, res) => {
    try {
        const { appointmentId } = req.body;

        const appointment = await Appointment.findById(appointmentId).populate('doctor', 'name');
        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }

        if (appointment.patient.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const result = await createOrder({
            amount: appointment.consultationFee,
            appointmentId: appointment._id,
            patientId: req.user._id,
            doctorId: appointment.doctor._id || appointment.doctor,
        });

        if (!result.success) {
            return res.status(500).json({ success: false, message: result.error });
        }

        res.status(200).json({
            success: true,
            order: result.order,
            key: process.env.RAZORPAY_KEY_ID,
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ success: false, message: 'Failed to create payment order' });
    }
};

/**
 * @desc    Verify payment after Razorpay checkout
 * @route   POST /api/payments/verify
 * @access  Private (Patient)
 */
const verifyPaymentHandler = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Missing payment details' });
        }

        const result = await processPaymentSuccess({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        });

        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message || result.error });
        }

        // Send notification to patient & doctor
        try {
            const { sendNotification } = require('../utils/notifications');
            const User = require('../models/User');
            const Doctor = require('../models/Doctor');

            const payment = result.payment;
            const appointment = await Appointment.findById(payment.appointment);
            const patient = await User.findById(payment.patient);
            const doctor = await Doctor.findById(payment.doctor);

            if (patient) {
                await sendNotification({
                    recipientId: patient._id,
                    recipientModel: 'User',
                    type: 'payment_received',
                    title: 'Payment Successful',
                    message: `Payment of ₹${payment.amount} for your appointment with Dr. ${doctor?.name || 'Doctor'} was successful.`,
                    data: { appointmentId: appointment?._id, paymentId: payment._id },
                    channels: { push: true, email: true, sms: false },
                    emailTemplate: {
                        template: 'paymentReceipt',
                        vars: {
                            name: patient.name,
                            amount: payment.amount,
                            doctorName: doctor?.name || 'Doctor',
                            date: appointment?.appointmentDate?.toLocaleDateString() || '',
                            transactionId: payment.transactionId,
                        },
                    },
                    recipient: patient,
                });
            }
        } catch (notifErr) {
            console.error('Payment notification error:', notifErr.message);
        }

        res.status(200).json({ success: true, message: 'Payment verified successfully', payment: result.payment });
    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).json({ success: false, message: 'Payment verification failed' });
    }
};

/**
 * @desc    Razorpay webhook handler
 * @route   POST /api/payments/webhook
 * @access  Public (Razorpay server)
 */
const razorpayWebhook = async (req, res) => {
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

        // Verify webhook signature
        if (webhookSecret) {
            const signature = req.headers['x-razorpay-signature'];
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(JSON.stringify(req.body))
                .digest('hex');

            if (signature !== expectedSignature) {
                return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
            }
        }

        const { event, payload } = req.body;

        switch (event) {
            case 'payment.captured': {
                const paymentEntity = payload.payment.entity;
                const payment = await Payment.findOne({ gatewayOrderId: paymentEntity.order_id });
                if (payment && payment.status === 'pending') {
                    payment.status = 'completed';
                    payment.gatewayPaymentId = paymentEntity.id;
                    payment.paymentMethod = paymentEntity.method || 'other';
                    payment.paidAt = new Date();
                    payment.transactionId = paymentEntity.id;
                    await payment.save();

                    await Appointment.findByIdAndUpdate(payment.appointment, { payment: payment._id });
                }
                break;
            }

            case 'payment.failed': {
                const failedPayment = payload.payment.entity;
                const payment = await Payment.findOne({ gatewayOrderId: failedPayment.order_id });
                if (payment) {
                    payment.status = 'failed';
                    payment.failureReason = failedPayment.error_description || 'Payment failed';
                    await payment.save();
                }
                break;
            }

            case 'refund.processed': {
                const refundEntity = payload.refund.entity;
                const payment = await Payment.findOne({ gatewayPaymentId: refundEntity.payment_id });
                if (payment) {
                    payment.refund.transactionId = refundEntity.id;
                    payment.refund.refundedAt = new Date();
                    await payment.save();
                }
                break;
            }

            default:
                console.log(`Unhandled webhook event: ${event}`);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false });
    }
};

/**
 * @desc    Request refund for a payment
 * @route   POST /api/payments/:paymentId/refund
 * @access  Private (Admin)
 */
const requestRefund = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { amount, reason } = req.body;

        const result = await processRefund({
            paymentId,
            amount,
            reason,
            refundedBy: req.user._id,
        });

        if (!result.success) {
            return res.status(400).json({ success: false, message: result.message || result.error });
        }

        res.status(200).json({ success: true, message: 'Refund processed', payment: result.payment });
    } catch (error) {
        console.error('Refund error:', error);
        res.status(500).json({ success: false, message: 'Refund processing failed' });
    }
};

/**
 * @desc    Get payment details
 * @route   GET /api/payments/:paymentId
 * @access  Private
 */
const getPaymentDetails = async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.paymentId)
            .populate('patient', 'name email')
            .populate('doctor', 'name email')
            .populate('appointment', 'appointmentDate timeSlot consultationType');

        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }

        res.status(200).json({ success: true, payment });
    } catch (error) {
        console.error('Get payment error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch payment details' });
    }
};

module.exports = {
    createPaymentOrder,
    verifyPaymentHandler,
    razorpayWebhook,
    requestRefund,
    getPaymentDetails,
};
