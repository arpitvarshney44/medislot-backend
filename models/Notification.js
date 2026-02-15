const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        // Target
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'recipientModel',
            default: null,
        },
        recipientModel: {
            type: String,
            enum: ['User', 'Doctor', 'Admin'],
            default: 'User',
        },
        isBroadcast: {
            type: Boolean,
            default: false,
        },
        broadcastTarget: {
            type: String,
            enum: ['all', 'patients', 'doctors', 'admins', ''],
            default: '',
        },

        // Content
        title: {
            type: String,
            required: [true, 'Notification title is required'],
            trim: true,
            maxlength: 200,
        },
        message: {
            type: String,
            required: [true, 'Notification message is required'],
            maxlength: 2000,
        },
        type: {
            type: String,
            enum: [
                'appointment_reminder', 'appointment_confirmed', 'appointment_cancelled',
                'payment_received', 'payment_failed', 'payout_completed',
                'doctor_approved', 'doctor_rejected', 'account_blocked',
                'review_received', 'system_update', 'promotion',
                'broadcast', 'custom',
            ],
            default: 'custom',
        },

        // Metadata
        data: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        actionUrl: {
            type: String,
            default: '',
        },

        // Status
        isRead: {
            type: Boolean,
            default: false,
        },
        readAt: {
            type: Date,
            default: null,
        },

        // Channels
        channels: {
            push: { type: Boolean, default: true },
            email: { type: Boolean, default: false },
            sms: { type: Boolean, default: false },
            inApp: { type: Boolean, default: true },
        },
        emailSent: { type: Boolean, default: false },
        smsSent: { type: Boolean, default: false },
        pushSent: { type: Boolean, default: false },

        // Sender
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ isBroadcast: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ isRead: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
