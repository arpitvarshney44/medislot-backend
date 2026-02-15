/**
 * Unified Notification Service
 * Handles push notifications (FCM), email, SMS, and in-app notifications
 */

const Notification = require('../models/Notification');
const { sendEmail } = require('./sendEmail');

// ─────────────────────────────────────────────────────────────
// FCM Push Notifications
// ─────────────────────────────────────────────────────────────

let firebaseAdmin = null;

const getFirebaseAdmin = () => {
    if (!firebaseAdmin) {
        try {
            const admin = require('firebase-admin');
            if (!admin.apps.length) {
                const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
                    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
                    : null;

                if (serviceAccount) {
                    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
                } else if (process.env.FIREBASE_PROJECT_ID) {
                    admin.initializeApp({
                        credential: admin.credential.applicationDefault(),
                        projectId: process.env.FIREBASE_PROJECT_ID,
                    });
                } else {
                    console.warn('⚠️ Firebase not configured. Push notifications disabled.');
                    return null;
                }
            }
            firebaseAdmin = admin;
        } catch (error) {
            console.warn('⚠️ Firebase init failed:', error.message);
            return null;
        }
    }
    return firebaseAdmin;
};

/**
 * Send FCM push notification
 */
const sendPushNotification = async ({ fcmToken, title, body, data = {} }) => {
    try {
        const admin = getFirebaseAdmin();
        if (!admin || !fcmToken) return { success: false, reason: 'FCM not available or no token' };

        const message = {
            token: fcmToken,
            notification: { title, body },
            data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
            android: {
                priority: 'high',
                notification: {
                    channelId: 'medislot_default',
                    sound: 'default',
                    clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                },
            },
        };

        const response = await admin.messaging().send(message);
        console.log(`📱 Push sent: ${response}`);
        return { success: true, messageId: response };
    } catch (error) {
        console.error('❌ Push notification failed:', error.message);
        return { success: false, error: error.message };
    }
};

// ─────────────────────────────────────────────────────────────
// SMS Notifications (Twilio)
// ─────────────────────────────────────────────────────────────

let twilioClient = null;

const getTwilio = () => {
    if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        try {
            const twilio = require('twilio');
            twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        } catch (error) {
            console.warn('⚠️ Twilio init failed:', error.message);
        }
    }
    return twilioClient;
};

/**
 * Send SMS notification
 */
const sendSMS = async ({ to, message }) => {
    try {
        const client = getTwilio();
        if (!client) return { success: false, reason: 'SMS service not configured' };

        const fromNumber = process.env.TWILIO_PHONE_NUMBER;
        if (!fromNumber) return { success: false, reason: 'Twilio phone number not set' };

        const result = await client.messages.create({
            body: message,
            from: fromNumber,
            to: to.startsWith('+') ? to : `+91${to}`, // Default India
        });

        console.log(`📲 SMS sent to ${to}: ${result.sid}`);
        return { success: true, sid: result.sid };
    } catch (error) {
        console.error('❌ SMS failed:', error.message);
        return { success: false, error: error.message };
    }
};

// ─────────────────────────────────────────────────────────────
// Email Notification Templates
// ─────────────────────────────────────────────────────────────

const EMAIL_TEMPLATES = {
    appointmentConfirmed: ({ patientName, doctorName, date, time, type }) => ({
        subject: '✅ Appointment Confirmed - Medi Slot',
        html: buildEmailTemplate({
            title: 'Appointment Confirmed',
            gradientColors: ['#00BFA6', '#6C63FF'],
            body: `
                <p>Hello <strong>${patientName}</strong>,</p>
                <p>Your appointment has been confirmed!</p>
                <div style="background: rgba(0,191,166,0.1); border-radius: 12px; padding: 16px; margin: 16px 0;">
                    <p style="margin: 4px 0;"><strong>Doctor:</strong> Dr. ${doctorName}</p>
                    <p style="margin: 4px 0;"><strong>Date:</strong> ${date}</p>
                    <p style="margin: 4px 0;"><strong>Time:</strong> ${time}</p>
                    <p style="margin: 4px 0;"><strong>Type:</strong> ${type}</p>
                </div>
            `,
        }),
    }),

    appointmentCancelled: ({ name, doctorName, date, reason }) => ({
        subject: '❌ Appointment Cancelled - Medi Slot',
        html: buildEmailTemplate({
            title: 'Appointment Cancelled',
            gradientColors: ['#FF6584', '#FF8A65'],
            body: `
                <p>Hello <strong>${name}</strong>,</p>
                <p>Your appointment with Dr. ${doctorName} on ${date} has been cancelled.</p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                <p>If a payment was made, a refund will be processed automatically.</p>
            `,
        }),
    }),

    appointmentReminder: ({ name, doctorName, date, time, type }) => ({
        subject: '⏰ Appointment Reminder - Medi Slot',
        html: buildEmailTemplate({
            title: 'Appointment Reminder',
            gradientColors: ['#FFB347', '#FF6584'],
            body: `
                <p>Hello <strong>${name}</strong>,</p>
                <p>This is a reminder for your upcoming appointment:</p>
                <div style="background: rgba(255,179,71,0.1); border-radius: 12px; padding: 16px; margin: 16px 0;">
                    <p style="margin: 4px 0;"><strong>Doctor:</strong> Dr. ${doctorName}</p>
                    <p style="margin: 4px 0;"><strong>Date:</strong> ${date}</p>
                    <p style="margin: 4px 0;"><strong>Time:</strong> ${time}</p>
                    <p style="margin: 4px 0;"><strong>Type:</strong> ${type}</p>
                </div>
                ${type === 'Online Video' ? '<p>Please ensure you have a stable internet connection for the video consultation.</p>' : ''}
            `,
        }),
    }),

    prescriptionReady: ({ patientName, doctorName, diagnosis }) => ({
        subject: '💊 New Prescription Available - Medi Slot',
        html: buildEmailTemplate({
            title: 'Prescription Available',
            gradientColors: ['#6C63FF', '#A78BFA'],
            body: `
                <p>Hello <strong>${patientName}</strong>,</p>
                <p>Dr. ${doctorName} has sent you a new prescription.</p>
                ${diagnosis ? `<p><strong>Diagnosis:</strong> ${diagnosis}</p>` : ''}
                <p>Open the MediSlot app to view your prescription details.</p>
            `,
        }),
    }),

    paymentReceipt: ({ name, amount, doctorName, date, transactionId }) => ({
        subject: '🧾 Payment Receipt - Medi Slot',
        html: buildEmailTemplate({
            title: 'Payment Receipt',
            gradientColors: ['#10B981', '#06B6D4'],
            body: `
                <p>Hello <strong>${name}</strong>,</p>
                <p>Your payment has been processed successfully.</p>
                <div style="background: rgba(16,185,129,0.1); border-radius: 12px; padding: 16px; margin: 16px 0;">
                    <p style="margin: 4px 0;"><strong>Amount:</strong> ₹${amount}</p>
                    <p style="margin: 4px 0;"><strong>Doctor:</strong> Dr. ${doctorName}</p>
                    <p style="margin: 4px 0;"><strong>Date:</strong> ${date}</p>
                    <p style="margin: 4px 0;"><strong>Transaction ID:</strong> ${transactionId}</p>
                </div>
            `,
        }),
    }),
};

function buildEmailTemplate({ title, gradientColors, body }) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background-color:#0B1426;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 20px;"><tr><td>
    <table width="100%" style="background:linear-gradient(135deg,#162139,#1E2D4A);border-radius:16px;overflow:hidden;">
    <tr><td style="padding:30px;text-align:center;background:linear-gradient(135deg,${gradientColors[0]},${gradientColors[1]});">
    <h1 style="color:#fff;margin:0;font-size:24px;">🏥 Medi Slot</h1>
    <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:13px;">${title}</p></td></tr>
    <tr><td style="padding:30px;color:#8B9DC3;font-size:14px;line-height:1.6;">${body}</td></tr>
    <tr><td style="padding:16px 30px;text-align:center;background:rgba(0,0,0,0.2);">
    <p style="color:#5A6A8A;margin:0;font-size:11px;">© ${new Date().getFullYear()} Medi Slot. All rights reserved.</p></td></tr>
    </table></td></tr></table></body></html>`;
}

// ─────────────────────────────────────────────────────────────
// Unified Notification Dispatcher
// ─────────────────────────────────────────────────────────────

/**
 * Send notification through all configured channels
 * @param {Object} options
 * @param {string} options.recipientId - User/Doctor ID
 * @param {string} options.recipientModel - 'User' or 'Doctor'
 * @param {string} options.type - Notification type
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {Object} options.data - Additional data
 * @param {Object} options.channels - { push: bool, email: bool, sms: bool }
 * @param {Object} options.emailTemplate - { template: string, vars: object }
 * @param {string} options.smsMessage - SMS text
 * @param {Object} options.recipient - Recipient object with fcmToken, email, mobileNumber, preferences
 */
const sendNotification = async ({
    recipientId, recipientModel, type, title, message, data = {},
    channels = { push: true, email: true, sms: false },
    emailTemplate, smsMessage, recipient,
}) => {
    const results = { inApp: false, push: false, email: false, sms: false };

    try {
        // 1. Always create in-app notification
        await Notification.create({
            recipient: recipientId,
            recipientModel,
            type,
            title,
            message,
            data,
        });
        results.inApp = true;

        // Check recipient preferences
        const prefs = recipient?.preferences || {};

        // 2. Push notification
        if (channels.push && recipient?.fcmToken && prefs.pushNotifications !== false) {
            const pushResult = await sendPushNotification({
                fcmToken: recipient.fcmToken,
                title,
                body: message,
                data: { type, ...data },
            });
            results.push = pushResult.success;
        }

        // 3. Email notification
        if (channels.email && recipient?.email && prefs.emailNotifications !== false) {
            let emailContent;
            if (emailTemplate && EMAIL_TEMPLATES[emailTemplate.template]) {
                emailContent = EMAIL_TEMPLATES[emailTemplate.template](emailTemplate.vars);
            } else {
                emailContent = {
                    subject: `${title} - Medi Slot`,
                    html: buildEmailTemplate({
                        title,
                        gradientColors: ['#00BFA6', '#6C63FF'],
                        body: `<p>${message}</p>`,
                    }),
                };
            }
            const emailResult = await sendEmail({ to: recipient.email, ...emailContent });
            results.email = emailResult.success;
        }

        // 4. SMS notification
        if (channels.sms && recipient?.mobileNumber && prefs.smsNotifications !== false) {
            const smsResult = await sendSMS({
                to: recipient.mobileNumber,
                message: smsMessage || `MediSlot: ${message}`,
            });
            results.sms = smsResult.success;
        }

        return { success: true, results };
    } catch (error) {
        console.error('❌ Notification dispatch error:', error);
        return { success: false, error: error.message, results };
    }
};

module.exports = {
    sendPushNotification,
    sendSMS,
    sendNotification,
    EMAIL_TEMPLATES,
    buildEmailTemplate,
};
