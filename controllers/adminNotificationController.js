const Notification = require('../models/Notification');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const ErrorResponse = require('../utils/errorResponse');

// ============================================================================
// @desc    Get all notifications (admin view)
// @route   GET /api/admin/notifications
// ============================================================================
exports.getAllNotifications = async (req, res, next) => {
    try {
        const { page = 1, limit = 15, type, isBroadcast } = req.query;

        const filter = {};
        if (type) filter.type = type;
        if (isBroadcast !== undefined) filter.isBroadcast = isBroadcast === 'true';

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Notification.countDocuments(filter);

        const notifications = await Notification.find(filter)
            .populate('createdBy', 'fullName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            data: {
                notifications,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalNotifications: total,
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
// @desc    Send notification to a specific user
// @route   POST /api/admin/notifications/send
// ============================================================================
exports.sendNotification = async (req, res, next) => {
    try {
        const { recipientId, recipientModel, title, message, type, channels } = req.body;

        if (!title || !message) return next(new ErrorResponse('Title and message are required', 400));

        const notification = await Notification.create({
            recipient: recipientId || null,
            recipientModel: recipientModel || 'User',
            title,
            message,
            type: type || 'custom',
            channels: channels || { push: true, inApp: true },
            createdBy: req.user._id,
        });

        res.status(201).json({ success: true, message: 'Notification sent', data: { notification } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Broadcast notification
// @route   POST /api/admin/notifications/broadcast
// ============================================================================
exports.broadcastNotification = async (req, res, next) => {
    try {
        const { target, title, message, type, channels } = req.body;

        if (!title || !message) return next(new ErrorResponse('Title and message are required', 400));
        if (!['all', 'patients', 'doctors', 'admins'].includes(target)) {
            return next(new ErrorResponse('Invalid broadcast target', 400));
        }

        const notification = await Notification.create({
            isBroadcast: true,
            broadcastTarget: target,
            title,
            message,
            type: type || 'broadcast',
            channels: channels || { push: true, inApp: true },
            createdBy: req.user._id,
        });

        if (req.user.logAction) {
            await req.user.logAction('broadcast_notification', `Broadcast to ${target}: ${title}`);
        }

        res.status(201).json({ success: true, message: `Broadcast sent to ${target}`, data: { notification } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Get notification stats
// @route   GET /api/admin/notifications/stats
// ============================================================================
exports.getNotificationStats = async (req, res, next) => {
    try {
        const [total, broadcasts, byType] = await Promise.all([
            Notification.countDocuments(),
            Notification.countDocuments({ isBroadcast: true }),
            Notification.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sentToday = await Notification.countDocuments({ createdAt: { $gte: today } });

        res.status(200).json({
            success: true,
            data: { total, broadcasts, sentToday, byType },
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Delete a notification
// @route   DELETE /api/admin/notifications/:id
// ============================================================================
exports.deleteNotification = async (req, res, next) => {
    try {
        const notif = await Notification.findByIdAndDelete(req.params.id);
        if (!notif) return next(new ErrorResponse('Notification not found', 404));

        res.status(200).json({ success: true, message: 'Notification deleted' });
    } catch (err) {
        next(err);
    }
};
