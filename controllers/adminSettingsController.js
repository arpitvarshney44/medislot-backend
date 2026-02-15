const SystemSettings = require('../models/SystemSettings');
const ErrorResponse = require('../utils/errorResponse');

// ============================================================================
// @desc    Get all settings (grouped by category)
// @route   GET /api/admin/settings
// ============================================================================
exports.getAllSettings = async (req, res, next) => {
    try {
        const { category } = req.query;
        const filter = category ? { category } : {};
        const settings = await SystemSettings.find(filter)
            .populate('lastUpdatedBy', 'fullName')
            .sort({ category: 1, key: 1 });

        // Group by category
        const grouped = {};
        settings.forEach((s) => {
            if (!grouped[s.category]) grouped[s.category] = [];
            grouped[s.category].push(s);
        });

        res.status(200).json({ success: true, data: { settings: grouped, all: settings } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Get setting by key
// @route   GET /api/admin/settings/:key
// ============================================================================
exports.getSetting = async (req, res, next) => {
    try {
        const setting = await SystemSettings.findOne({ key: req.params.key })
            .populate('lastUpdatedBy', 'fullName');
        if (!setting) return next(new ErrorResponse('Setting not found', 404));
        res.status(200).json({ success: true, data: { setting } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Update/create a setting
// @route   PUT /api/admin/settings
// ============================================================================
exports.updateSetting = async (req, res, next) => {
    try {
        const { key, value, category, description } = req.body;
        if (!key) return next(new ErrorResponse('Setting key is required', 400));

        const setting = await SystemSettings.setSetting(key, value, category, description, req.user._id);

        if (req.user.logAction) {
            await req.user.logAction('update_setting', `Updated setting: ${key}`);
        }

        res.status(200).json({ success: true, message: 'Setting updated', data: { setting } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Bulk update settings
// @route   PUT /api/admin/settings/bulk
// ============================================================================
exports.bulkUpdateSettings = async (req, res, next) => {
    try {
        const { settings } = req.body; // [{key, value, category, description}]
        if (!Array.isArray(settings) || !settings.length) {
            return next(new ErrorResponse('Settings array is required', 400));
        }

        const results = await Promise.all(
            settings.map((s) => SystemSettings.setSetting(s.key, s.value, s.category, s.description, req.user._id))
        );

        if (req.user.logAction) {
            await req.user.logAction('bulk_update_settings', `Updated ${settings.length} settings`);
        }

        res.status(200).json({ success: true, message: `${results.length} settings updated`, data: { settings: results } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Delete a setting
// @route   DELETE /api/admin/settings/:key
// ============================================================================
exports.deleteSetting = async (req, res, next) => {
    try {
        const setting = await SystemSettings.findOneAndDelete({ key: req.params.key });
        if (!setting) return next(new ErrorResponse('Setting not found', 404));

        res.status(200).json({ success: true, message: 'Setting deleted' });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Initialize default settings (run once)
// @route   POST /api/admin/settings/initialize
// ============================================================================
exports.initializeDefaults = async (req, res, next) => {
    try {
        const defaults = [
            { key: 'global_commission_percentage', value: 15, category: 'commission', description: 'Global platform commission %' },
            { key: 'min_consultation_fee', value: 100, category: 'commission', description: 'Minimum consultation fee in INR' },
            { key: 'online_payment_fee_percentage', value: 2, category: 'commission', description: 'Online payment processing fee %' },
            { key: 'max_cancellation_window_hours', value: 4, category: 'consultation', description: 'Hours before appointment to allow free cancellation' },
            { key: 'default_slot_duration_minutes', value: 30, category: 'consultation', description: 'Default appointment slot duration' },
            { key: 'video_session_timeout_minutes', value: 30, category: 'consultation', description: 'Video consultation auto-timeout' },
            { key: 'enable_online_consultations', value: true, category: 'general', description: 'Enable/disable online consultations globally' },
            { key: 'enable_notifications_email', value: true, category: 'notification', description: 'Enable email notifications' },
            { key: 'enable_notifications_sms', value: false, category: 'notification', description: 'Enable SMS notifications' },
            { key: 'enable_notifications_push', value: true, category: 'notification', description: 'Enable push notifications' },
            { key: 'maintenance_mode', value: false, category: 'general', description: 'Enable maintenance mode' },
            { key: 'max_login_attempts', value: 5, category: 'security', description: 'Max login attempts before lockout' },
            { key: 'lockout_duration_minutes', value: 30, category: 'security', description: 'Account lockout duration' },
            { key: 'password_min_length', value: 8, category: 'security', description: 'Minimum password length' },
            { key: 'session_timeout_hours', value: 24, category: 'security', description: 'Admin session timeout' },
        ];

        let created = 0;
        for (const d of defaults) {
            const exists = await SystemSettings.findOne({ key: d.key });
            if (!exists) {
                await SystemSettings.create({ ...d, lastUpdatedBy: req.user._id });
                created++;
            }
        }

        res.status(200).json({ success: true, message: `${created} default settings initialized` });
    } catch (err) {
        next(err);
    }
};
