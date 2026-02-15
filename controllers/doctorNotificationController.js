const Notification = require('../models/Notification');
const Doctor = require('../models/Doctor');

/**
 * @desc    Get doctor's notifications
 * @route   GET /api/doctor/notifications
 * @access  Private (Doctor)
 */
const getNotifications = async (req, res) => {
    try {
        const doctorId = req.user._id;
        const { page = 1, limit = 20, unreadOnly, type } = req.query;

        const query = {
            $or: [
                { recipient: doctorId, recipientModel: 'Doctor' },
                { isBroadcast: true, broadcastTarget: { $in: ['all', 'doctors'] } },
            ],
        };

        if (unreadOnly === 'true') {
            query.isRead = false;
        }

        if (type) {
            query.type = type;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Notification.countDocuments(query),
            Notification.countDocuments({
                ...query,
                isRead: false,
            }),
        ]);

        res.status(200).json({
            success: true,
            data: {
                notifications,
                unreadCount,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    hasMore: skip + notifications.length < total,
                },
            },
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
    }
};

/**
 * @desc    Mark notification as read
 * @route   PUT /api/doctor/notifications/:notificationId/read
 * @access  Private (Doctor)
 */
const markAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;

        const notification = await Notification.findOneAndUpdate(
            {
                _id: notificationId,
                recipient: req.user._id,
                recipientModel: 'Doctor',
            },
            {
                $set: { isRead: true, readAt: new Date() },
            },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Notification marked as read.',
            data: { notification },
        });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({ success: false, message: 'Failed to mark notification as read.' });
    }
};

/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/doctor/notifications/read-all
 * @access  Private (Doctor)
 */
const markAllAsRead = async (req, res) => {
    try {
        const result = await Notification.updateMany(
            {
                recipient: req.user._id,
                recipientModel: 'Doctor',
                isRead: false,
            },
            {
                $set: { isRead: true, readAt: new Date() },
            }
        );

        res.status(200).json({
            success: true,
            message: `${result.modifiedCount} notifications marked as read.`,
            data: { modifiedCount: result.modifiedCount },
        });
    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({ success: false, message: 'Failed to mark notifications as read.' });
    }
};

/**
 * @desc    Delete a notification
 * @route   DELETE /api/doctor/notifications/:notificationId
 * @access  Private (Doctor)
 */
const deleteNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;

        const result = await Notification.findOneAndDelete({
            _id: notificationId,
            recipient: req.user._id,
            recipientModel: 'Doctor',
        });

        if (!result) {
            return res.status(404).json({ success: false, message: 'Notification not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Notification deleted.',
        });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete notification.' });
    }
};

/**
 * @desc    Get notification preferences
 * @route   GET /api/doctor/notifications/preferences
 * @access  Private (Doctor)
 */
const getNotificationPreferences = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.user._id)
            .select('notificationPreferences')
            .lean();

        res.status(200).json({
            success: true,
            data: { preferences: doctor?.notificationPreferences || {} },
        });
    } catch (error) {
        console.error('Get notification preferences error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch preferences.' });
    }
};

/**
 * @desc    Update notification preferences
 * @route   PUT /api/doctor/notifications/preferences
 * @access  Private (Doctor)
 */
const updateNotificationPreferences = async (req, res) => {
    try {
        const { inApp, email, sms } = req.body;

        const updates = {};
        if (inApp !== undefined) updates['notificationPreferences.inApp'] = inApp;
        if (email !== undefined) updates['notificationPreferences.email'] = email;
        if (sms !== undefined) updates['notificationPreferences.sms'] = sms;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid preferences to update.',
            });
        }

        const doctor = await Doctor.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true }
        ).select('notificationPreferences');

        res.status(200).json({
            success: true,
            message: 'Notification preferences updated.',
            data: { preferences: doctor.notificationPreferences },
        });
    } catch (error) {
        console.error('Update notification preferences error:', error);
        res.status(500).json({ success: false, message: 'Failed to update preferences.' });
    }
};

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getNotificationPreferences,
    updateNotificationPreferences,
};