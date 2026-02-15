const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
    {
        admin: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            required: true,
        },
        adminName: { type: String, default: '' },
        adminRole: { type: String, default: '' },
        action: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: '',
        },
        module: {
            type: String,
            enum: ['doctors', 'users', 'appointments', 'payments', 'reviews', 'notifications', 'cms', 'settings', 'support', 'auth', 'system'],
            default: 'system',
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        targetModel: {
            type: String,
            default: '',
        },
        ipAddress: {
            type: String,
            default: '',
        },
        userAgent: {
            type: String,
            default: '',
        },
        previousData: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        newData: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        severity: {
            type: String,
            enum: ['info', 'warning', 'critical'],
            default: 'info',
        },
    },
    {
        timestamps: true,
    }
);

auditLogSchema.index({ admin: 1, createdAt: -1 });
auditLogSchema.index({ module: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ severity: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
