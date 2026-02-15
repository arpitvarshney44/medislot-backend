const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
    createPaymentOrder,
    verifyPaymentHandler,
    razorpayWebhook,
    requestRefund,
    getPaymentDetails,
} = require('../controllers/paymentController');

// Webhook (no auth - called by Razorpay servers)
router.post('/webhook', express.raw({ type: 'application/json' }), razorpayWebhook);

// Patient payment flow
router.post('/create-order', protect, authorize('patient'), createPaymentOrder);
router.post('/verify', protect, authorize('patient'), verifyPaymentHandler);

// Payment details
router.get('/:paymentId', protect, getPaymentDetails);

// Admin refund
router.post('/:paymentId/refund', protect, authorize('admin'), requestRefund);

module.exports = router;
