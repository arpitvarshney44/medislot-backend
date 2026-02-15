const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
    {
        // -----------------------------------------------------------------------
        // Basic Information (Mandatory)
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
        mobileNumber: {
            type: String,
            required: [true, 'Mobile number is required'],
            unique: true,
            trim: true,
            match: [/^[0-9]{10,15}$/, 'Please provide a valid mobile number'],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters'],
            select: false,
        },

        // -----------------------------------------------------------------------
        // Optional Information
        // -----------------------------------------------------------------------
        dateOfBirth: {
            type: Date,
            default: null,
        },
        gender: {
            type: String,
            enum: ['male', 'female', 'other', 'prefer_not_to_say'],
            default: null,
        },
        address: {
            street: { type: String, default: '' },
            city: { type: String, default: '' },
            state: { type: String, default: '' },
            zipCode: { type: String, default: '' },
            country: { type: String, default: 'India' },
        },
        profilePhoto: {
            type: String,
            default: '',
        },

        // -----------------------------------------------------------------------
        // Family Members (for booking on behalf of others)
        // -----------------------------------------------------------------------
        familyMembers: [
            {
                name: { type: String, required: true, trim: true },
                age: { type: Number },
                gender: { type: String, enum: ['male', 'female', 'other'] },
                relation: { type: String, trim: true },
                _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
            },
        ],

        // -----------------------------------------------------------------------
        // Medical Records
        // -----------------------------------------------------------------------
        medicalRecords: [
            {
                title: { type: String, required: true, trim: true },
                fileUrl: { type: String, required: true },
                fileType: { type: String, enum: ['pdf', 'image', 'document'] },
                uploadedAt: { type: Date, default: Date.now },
                description: { type: String, default: '' },
                _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
            },
        ],

        // -----------------------------------------------------------------------
        // Account Status & Verification
        // -----------------------------------------------------------------------
        isEmailVerified: {
            type: Boolean,
            default: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isBlocked: {
            type: Boolean,
            default: false,
        },
        blockReason: {
            type: String,
            default: '',
        },
        blockedAt: {
            type: Date,
            default: null,
        },
        blockedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },

        // -----------------------------------------------------------------------
        // Email Verification Token
        // -----------------------------------------------------------------------
        emailVerificationToken: {
            type: String,
            default: null,
        },
        emailVerificationExpire: {
            type: Date,
            default: null,
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
        // Preferences
        // -----------------------------------------------------------------------
        preferences: {
            language: { type: String, default: 'en' },
            notificationsEnabled: { type: Boolean, default: true },
            emailNotifications: { type: Boolean, default: true },
            smsNotifications: { type: Boolean, default: true },
            pushNotifications: { type: Boolean, default: true },
            reminderTimeBefore: { type: Number, default: 30 }, // minutes
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
                device: { type: String },
            },
        ],

        // -----------------------------------------------------------------------
        // FCM Token for Push Notifications
        // -----------------------------------------------------------------------
        fcmToken: {
            type: String,
            default: null,
        },

        // -----------------------------------------------------------------------
        // Role
        // -----------------------------------------------------------------------
        role: {
            type: String,
            default: 'patient',
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
userSchema.index({ email: 1 });
userSchema.index({ mobileNumber: 1 });
userSchema.index({ isActive: 1, isBlocked: 1 });
userSchema.index({ createdAt: -1 });

// ---------------------------------------------------------------------------
// Virtual: Age calculation from DOB
// ---------------------------------------------------------------------------
userSchema.virtual('age').get(function () {
    if (!this.dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
});

// ---------------------------------------------------------------------------
// Pre-save: Hash password
// ---------------------------------------------------------------------------
userSchema.pre('save', async function (next) {
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
// Method: Compare password
// ---------------------------------------------------------------------------
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// ---------------------------------------------------------------------------
// Method: Generate Email Verification Token
// ---------------------------------------------------------------------------
userSchema.methods.generateEmailVerificationToken = function () {
    const token = crypto.randomBytes(32).toString('hex');
    this.emailVerificationToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
    this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    return token;
};

// ---------------------------------------------------------------------------
// Method: Generate Password Reset Token
// ---------------------------------------------------------------------------
userSchema.methods.generateResetPasswordToken = function () {
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
userSchema.methods.recordLogin = function (ipAddress, userAgent, device) {
    this.lastLogin = new Date();
    this.loginHistory.unshift({
        timestamp: new Date(),
        ipAddress,
        userAgent,
        device,
    });
    // Keep only last 20 login records
    if (this.loginHistory.length > 20) {
        this.loginHistory = this.loginHistory.slice(0, 20);
    }
};

// ---------------------------------------------------------------------------
// Method: To safe JSON (strip sensitive data)
// ---------------------------------------------------------------------------
userSchema.methods.toSafeObject = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.refreshToken;
    delete obj.emailVerificationToken;
    delete obj.emailVerificationExpire;
    delete obj.resetPasswordToken;
    delete obj.resetPasswordExpire;
    delete obj.loginHistory;
    delete obj.__v;
    return obj;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
