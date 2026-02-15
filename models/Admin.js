const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const adminSchema = new mongoose.Schema(
    {
        // -----------------------------------------------------------------------
        // Basic Information
        // -----------------------------------------------------------------------
        fullName: {
            type: String,
            required: [true, 'Full name is required'],
            trim: true,
            minlength: [2, 'Name must be at least 2 characters'],
            maxlength: [100, 'Name cannot exceed 100 characters'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [
                /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                'Please provide a valid email address',
            ],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters'],
            select: false,
        },
        profilePhoto: {
            type: String,
            default: '',
        },

        // -----------------------------------------------------------------------
        // Role & Permissions (RBAC)
        // -----------------------------------------------------------------------
        adminRole: {
            type: String,
            required: [true, 'Admin role is required'],
            enum: {
                values: ['super_admin', 'operations_admin', 'finance_admin', 'support_admin', 'content_admin'],
                message: '{VALUE} is not a valid admin role',
            },
            default: 'content_admin',
        },
        permissions: {
            // Doctor Management
            doctors: {
                view: { type: Boolean, default: false },
                create: { type: Boolean, default: false },
                edit: { type: Boolean, default: false },
                delete: { type: Boolean, default: false },
                approve: { type: Boolean, default: false },
                block: { type: Boolean, default: false },
            },
            // User (Patient) Management
            users: {
                view: { type: Boolean, default: false },
                create: { type: Boolean, default: false },
                edit: { type: Boolean, default: false },
                delete: { type: Boolean, default: false },
                block: { type: Boolean, default: false },
            },
            // Appointment Management
            appointments: {
                view: { type: Boolean, default: false },
                create: { type: Boolean, default: false },
                edit: { type: Boolean, default: false },
                cancel: { type: Boolean, default: false },
                reassign: { type: Boolean, default: false },
            },
            // Payment & Finance
            payments: {
                view: { type: Boolean, default: false },
                refund: { type: Boolean, default: false },
                payout: { type: Boolean, default: false },
                configure: { type: Boolean, default: false },
            },
            // Commission & Pricing
            commission: {
                view: { type: Boolean, default: false },
                configure: { type: Boolean, default: false },
            },
            // Reviews
            reviews: {
                view: { type: Boolean, default: false },
                moderate: { type: Boolean, default: false },
                delete: { type: Boolean, default: false },
            },
            // Notifications
            notifications: {
                view: { type: Boolean, default: false },
                create: { type: Boolean, default: false },
                broadcast: { type: Boolean, default: false },
            },
            // CMS
            cms: {
                view: { type: Boolean, default: false },
                create: { type: Boolean, default: false },
                edit: { type: Boolean, default: false },
                delete: { type: Boolean, default: false },
            },
            // Reports
            reports: {
                view: { type: Boolean, default: false },
                export: { type: Boolean, default: false },
            },
            // Support
            support: {
                view: { type: Boolean, default: false },
                respond: { type: Boolean, default: false },
                resolve: { type: Boolean, default: false },
            },
            // System Configuration
            system: {
                view: { type: Boolean, default: false },
                configure: { type: Boolean, default: false },
            },
            // Admin Management (Super Admin only)
            admins: {
                view: { type: Boolean, default: false },
                create: { type: Boolean, default: false },
                edit: { type: Boolean, default: false },
                delete: { type: Boolean, default: false },
            },
        },

        // -----------------------------------------------------------------------
        // Account Status
        // -----------------------------------------------------------------------
        isActive: {
            type: Boolean,
            default: true,
        },

        // -----------------------------------------------------------------------
        // Two Factor Authentication
        // -----------------------------------------------------------------------
        twoFactorEnabled: {
            type: Boolean,
            default: false,
        },
        twoFactorSecret: {
            type: String,
            default: null,
            select: false,
        },
        twoFactorBackupCodes: {
            type: [String],
            default: [],
            select: false,
        },

        // -----------------------------------------------------------------------
        // Password Reset
        // -----------------------------------------------------------------------
        resetPasswordToken: {
            type: String,
            default: null,
        },
        resetPasswordExpire: {
            type: Date,
            default: null,
        },

        // -----------------------------------------------------------------------
        // Refresh Token
        // -----------------------------------------------------------------------
        refreshToken: {
            type: String,
            default: null,
            select: false,
        },

        // -----------------------------------------------------------------------
        // Activity Tracking
        // -----------------------------------------------------------------------
        lastLogin: {
            type: Date,
            default: null,
        },
        loginHistory: [
            {
                timestamp: { type: Date, default: Date.now },
                ipAddress: { type: String },
                userAgent: { type: String },
                success: { type: Boolean, default: true },
            },
        ],

        // -----------------------------------------------------------------------
        // Audit Trail
        // -----------------------------------------------------------------------
        actionLog: [
            {
                action: { type: String, required: true },
                targetModel: { type: String },
                targetId: { type: mongoose.Schema.Types.ObjectId },
                details: { type: String },
                timestamp: { type: Date, default: Date.now },
                ipAddress: { type: String },
            },
        ],

        // -----------------------------------------------------------------------
        // Role
        // -----------------------------------------------------------------------
        role: {
            type: String,
            default: 'admin',
            immutable: true,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
adminSchema.index({ email: 1 });
adminSchema.index({ adminRole: 1 });
adminSchema.index({ isActive: 1 });

// ---------------------------------------------------------------------------
// Pre-save: Hash password
// ---------------------------------------------------------------------------
adminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// ---------------------------------------------------------------------------
// Pre-save: Set default permissions based on role
// ---------------------------------------------------------------------------
adminSchema.pre('save', function (next) {
    if (!this.isModified('adminRole')) return next();

    const rolePermissions = {
        super_admin: {
            doctors: { view: true, create: true, edit: true, delete: true, approve: true, block: true },
            users: { view: true, create: true, edit: true, delete: true, block: true },
            appointments: { view: true, create: true, edit: true, cancel: true, reassign: true },
            payments: { view: true, refund: true, payout: true, configure: true },
            commission: { view: true, configure: true },
            reviews: { view: true, moderate: true, delete: true },
            notifications: { view: true, create: true, broadcast: true },
            cms: { view: true, create: true, edit: true, delete: true },
            reports: { view: true, export: true },
            support: { view: true, respond: true, resolve: true },
            system: { view: true, configure: true },
            admins: { view: true, create: true, edit: true, delete: true },
        },
        operations_admin: {
            doctors: { view: true, create: false, edit: true, delete: false, approve: true, block: true },
            users: { view: true, create: false, edit: true, delete: false, block: true },
            appointments: { view: true, create: true, edit: true, cancel: true, reassign: true },
            payments: { view: true, refund: false, payout: false, configure: false },
            commission: { view: true, configure: false },
            reviews: { view: true, moderate: true, delete: false },
            notifications: { view: true, create: true, broadcast: false },
            cms: { view: true, create: false, edit: false, delete: false },
            reports: { view: true, export: true },
            support: { view: true, respond: true, resolve: true },
            system: { view: true, configure: false },
            admins: { view: false, create: false, edit: false, delete: false },
        },
        finance_admin: {
            doctors: { view: true, create: false, edit: false, delete: false, approve: false, block: false },
            users: { view: true, create: false, edit: false, delete: false, block: false },
            appointments: { view: true, create: false, edit: false, cancel: false, reassign: false },
            payments: { view: true, refund: true, payout: true, configure: true },
            commission: { view: true, configure: true },
            reviews: { view: false, moderate: false, delete: false },
            notifications: { view: true, create: false, broadcast: false },
            cms: { view: false, create: false, edit: false, delete: false },
            reports: { view: true, export: true },
            support: { view: true, respond: false, resolve: false },
            system: { view: true, configure: false },
            admins: { view: false, create: false, edit: false, delete: false },
        },
        support_admin: {
            doctors: { view: true, create: false, edit: false, delete: false, approve: false, block: false },
            users: { view: true, create: false, edit: true, delete: false, block: true },
            appointments: { view: true, create: true, edit: true, cancel: true, reassign: false },
            payments: { view: true, refund: true, payout: false, configure: false },
            commission: { view: false, configure: false },
            reviews: { view: true, moderate: true, delete: false },
            notifications: { view: true, create: true, broadcast: false },
            cms: { view: true, create: false, edit: false, delete: false },
            reports: { view: false, export: false },
            support: { view: true, respond: true, resolve: true },
            system: { view: false, configure: false },
            admins: { view: false, create: false, edit: false, delete: false },
        },
        content_admin: {
            doctors: { view: true, create: false, edit: false, delete: false, approve: false, block: false },
            users: { view: false, create: false, edit: false, delete: false, block: false },
            appointments: { view: false, create: false, edit: false, cancel: false, reassign: false },
            payments: { view: false, refund: false, payout: false, configure: false },
            commission: { view: false, configure: false },
            reviews: { view: true, moderate: false, delete: false },
            notifications: { view: true, create: true, broadcast: false },
            cms: { view: true, create: true, edit: true, delete: true },
            reports: { view: false, export: false },
            support: { view: false, respond: false, resolve: false },
            system: { view: false, configure: false },
            admins: { view: false, create: false, edit: false, delete: false },
        },
    };

    const defaultPermissions = rolePermissions[this.adminRole];
    if (defaultPermissions) {
        this.permissions = defaultPermissions;
    }

    next();
});

// ---------------------------------------------------------------------------
// Method: Compare password
// ---------------------------------------------------------------------------
adminSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// ---------------------------------------------------------------------------
// Method: Generate Password Reset Token
// ---------------------------------------------------------------------------
adminSchema.methods.generateResetPasswordToken = function () {
    const token = crypto.randomBytes(32).toString('hex');
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
    this.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour
    return token;
};

// ---------------------------------------------------------------------------
// Method: Record Login
// ---------------------------------------------------------------------------
adminSchema.methods.recordLogin = function (ipAddress, userAgent, success = true) {
    this.lastLogin = new Date();
    this.loginHistory.unshift({
        timestamp: new Date(),
        ipAddress,
        userAgent,
        success,
    });
    if (this.loginHistory.length > 50) {
        this.loginHistory = this.loginHistory.slice(0, 50);
    }
};

// ---------------------------------------------------------------------------
// Method: Log Action (Audit Trail)
// ---------------------------------------------------------------------------
adminSchema.methods.logAction = function (action, targetModel, targetId, details, ipAddress) {
    this.actionLog.unshift({
        action,
        targetModel,
        targetId,
        details,
        timestamp: new Date(),
        ipAddress,
    });
    if (this.actionLog.length > 200) {
        this.actionLog = this.actionLog.slice(0, 200);
    }
};

// ---------------------------------------------------------------------------
// Method: Check Permission
// ---------------------------------------------------------------------------
adminSchema.methods.hasPermission = function (module, action) {
    if (this.adminRole === 'super_admin') return true;
    return this.permissions?.[module]?.[action] === true;
};

// ---------------------------------------------------------------------------
// Method: To safe JSON
// ---------------------------------------------------------------------------
adminSchema.methods.toSafeObject = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.refreshToken;
    delete obj.twoFactorSecret;
    delete obj.twoFactorBackupCodes;
    delete obj.resetPasswordToken;
    delete obj.resetPasswordExpire;
    delete obj.loginHistory;
    delete obj.actionLog;
    delete obj.__v;
    return obj;
};

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;
