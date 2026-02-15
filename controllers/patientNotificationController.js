const Notification = require('../models/Notification');
const User = require('../models/User');

// @desc    Get patient notifications
// @route   GET /api/patient/notifications
exports.getNotifications = async (req, res, next) => {
    try {
        const { page = 1, limit = 30 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const notifications = await Notification.find({
            recipient: req.user._id,
            recipientModel: 'User',
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const unreadCount = await Notification.countDocuments({
            recipient: req.user._id,
            recipientModel: 'User',
            isRead: false,
        });

        res.status(200).json({ success: true, data: { notifications, unreadCount } });
    } catch (error) {
        next(error);
    }
};

// @desc    Mark notification as read
// @route   PUT /api/patient/notifications/:notificationId/read
exports.markAsRead = async (req, res, next) => {
    try {
        await Notification.findOneAndUpdate(
            { _id: req.params.notificationId, recipient: req.user._id },
            { isRead: true }
        );
        res.status(200).json({ success: true, message: 'Marked as read' });
    } catch (error) {
        next(error);
    }
};

// @desc    Mark all as read
// @route   PUT /api/patient/notifications/read-all
exports.markAllAsRead = async (req, res, next) => {
    try {
        await Notification.updateMany(
            { recipient: req.user._id, recipientModel: 'User', isRead: false },
            { isRead: true }
        );
        res.status(200).json({ success: true, message: 'All marked as read' });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete notification
// @route   DELETE /api/patient/notifications/:notificationId
exports.deleteNotification = async (req, res, next) => {
    try {
        await Notification.findOneAndDelete({ _id: req.params.notificationId, recipient: req.user._id });
        res.status(200).json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        next(error);
    }
};

// @desc    Update notification preferences
// @route   PUT /api/patient/notifications/preferences
exports.updatePreferences = async (req, res, next) => {
    try {
        const { emailNotifications, smsNotifications, pushNotifications, reminderTimeBefore } = req.body;
        const update = {};
        if (typeof emailNotifications === 'boolean') update['preferences.emailNotifications'] = emailNotifications;
        if (typeof smsNotifications === 'boolean') update['preferences.smsNotifications'] = smsNotifications;
        if (typeof pushNotifications === 'boolean') update['preferences.pushNotifications'] = pushNotifications;
        if (reminderTimeBefore) update['preferences.reminderTimeBefore'] = reminderTimeBefore;

        await User.findByIdAndUpdate(req.user._id, update);
        res.status(200).json({ success: true, message: 'Preferences updated' });
    } catch (error) {
        next(error);
    }
};
