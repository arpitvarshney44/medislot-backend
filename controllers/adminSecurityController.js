const AuditLog = require('../models/AuditLog');
const Admin = require('../models/Admin');
const ErrorResponse = require('../utils/errorResponse');

// ============================================================================
// @desc    Get audit logs (with filters, pagination)
// @route   GET /api/admin/security/logs
// ============================================================================
exports.getAuditLogs = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, module, action, severity, adminId, startDate, endDate } = req.query;

        const filter = {};
        if (module) filter.module = module;
        if (action) filter.action = { $regex: action, $options: 'i' };
        if (severity) filter.severity = severity;
        if (adminId) filter.admin = adminId;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await AuditLog.countDocuments(filter);

        const logs = await AuditLog.find(filter)
            .populate('admin', 'fullName email adminRole')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            data: {
                logs,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalLogs: total,
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
// @desc    Get login history
// @route   GET /api/admin/security/login-history
// ============================================================================
exports.getLoginHistory = async (req, res, next) => {
    try {
        const admins = await Admin.find({}, 'fullName email adminRole lastLogin loginHistory isActive')
            .sort({ lastLogin: -1 })
            .lean();

        const history = admins.map((a) => ({
            adminId: a._id,
            fullName: a.fullName,
            email: a.email,
            role: a.adminRole,
            isActive: a.isActive,
            lastLogin: a.lastLogin,
            recentLogins: (a.loginHistory || []).slice(-10).reverse(),
        }));

        res.status(200).json({ success: true, data: { loginHistory: history } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Get security overview / stats
// @route   GET /api/admin/security/overview
// ============================================================================
exports.getSecurityOverview = async (req, res, next) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [totalLogs, todayLogs, criticalLogs, weekLogs, byModule, bySeverity] = await Promise.all([
            AuditLog.countDocuments(),
            AuditLog.countDocuments({ createdAt: { $gte: today } }),
            AuditLog.countDocuments({ severity: 'critical' }),
            AuditLog.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
            AuditLog.aggregate([{ $group: { _id: '$module', count: { $sum: 1 } } }]),
            AuditLog.aggregate([{ $group: { _id: '$severity', count: { $sum: 1 } } }]),
        ]);

        const activeAdmins = await Admin.countDocuments({ isActive: true });
        const totalAdmins = await Admin.countDocuments();

        res.status(200).json({
            success: true,
            data: {
                totalLogs,
                todayLogs,
                criticalLogs,
                weekLogs,
                byModule,
                bySeverity,
                activeAdmins,
                totalAdmins,
            },
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Create audit log entry (utility)
// @route   POST /api/admin/security/log
// ============================================================================
exports.createAuditLog = async (req, res, next) => {
    try {
        const { action, description, module, targetId, targetModel, severity } = req.body;

        const log = await AuditLog.create({
            admin: req.user._id,
            adminName: req.user.fullName,
            adminRole: req.user.adminRole,
            action,
            description,
            module: module || 'system',
            targetId,
            targetModel,
            ipAddress: req.ip || req.connection?.remoteAddress || '',
            userAgent: req.headers['user-agent'] || '',
            severity: severity || 'info',
        });

        res.status(201).json({ success: true, data: { log } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Get compliance / data access report
// @route   GET /api/admin/security/compliance
// ============================================================================
exports.getComplianceReport = async (req, res, next) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dataAccessLogs = await AuditLog.find({
            module: { $in: ['users', 'doctors', 'payments'] },
            createdAt: { $gte: thirtyDaysAgo },
        })
            .populate('admin', 'fullName adminRole')
            .sort({ createdAt: -1 })
            .limit(100);

        const sensitiveActions = await AuditLog.find({
            severity: { $in: ['warning', 'critical'] },
            createdAt: { $gte: thirtyDaysAgo },
        })
            .populate('admin', 'fullName adminRole')
            .sort({ createdAt: -1 })
            .limit(50);

        res.status(200).json({
            success: true,
            data: {
                period: '30 days',
                dataAccessLogs,
                sensitiveActions,
                totalDataAccess: dataAccessLogs.length,
                totalSensitiveActions: sensitiveActions.length,
            },
        });
    } catch (err) {
        next(err);
    }
};
