const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const doctorSchema = new mongoose.Schema(
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
        // Professional Information (Mandatory)
        // -----------------------------------------------------------------------
        specializations: {
            type: [String],
            required: [true, 'At least one specialization is required'],
            validate: {
                validator: function (v) {
                    return v && v.length > 0;
                },
                message: 'At least one specialization is required',
            },
        },
        medicalRegistrationNumber: {
            type: String,
            required: [true, 'Medical registration number is required'],
            unique: true,
            trim: true,
        },
        yearsOfExperience: {
            type: Number,
            required: [true, 'Years of experience is required'],
            min: [0, 'Experience cannot be negative'],
            max: [70, 'Experience seems unrealistic'],
        },
        consultationFees: {
            online: {
                type: Number,
                required: [true, 'Online consultation fee is required'],
                min: [0, 'Fee cannot be negative'],
            },
            offline: {
                type: Number,
                required: [true, 'Offline consultation fee is required'],
                min: [0, 'Fee cannot be negative'],
            },
        },

        // -----------------------------------------------------------------------
        // Optional Information
        // -----------------------------------------------------------------------
        title: {
            type: String,
            enum: ['Dr.', 'Prof.', 'Surgeon', ''],
            default: 'Dr.',
        },
        qualifications: {
            type: [String],
            default: [],
        },
        aboutDoctor: {
            type: String,
            default: '',
            maxlength: [2000, 'About section cannot exceed 2000 characters'],
        },
        languagesSpoken: {
            type: [String],
            default: ['English'],
        },
        profilePhoto: {
            type: String,
            default: '',
        },
        diseasesTreated: {
            type: [String],
            default: [],
        },
        proceduresOffered: {
            type: [String],
            default: [],
        },

        // -----------------------------------------------------------------------
        // Clinic / Hospital Management
        // -----------------------------------------------------------------------
        clinics: [
            {
                clinicName: { type: String, required: true, trim: true },
                address: {
                    street: { type: String, default: '' },
                    city: { type: String, default: '' },
                    state: { type: String, default: '' },
                    zipCode: { type: String, default: '' },
                    country: { type: String, default: 'India' },
                },
                coordinates: {
                    latitude: { type: Number, default: null },
                    longitude: { type: Number, default: null },
                },
                consultationFee: { type: Number, default: 0 },
                contactNumber: { type: String, default: '' },
                workingDays: {
                    type: [String],
                    default: [],
                    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                },
                workingHours: {
                    start: { type: String, default: '09:00' },
                    end: { type: String, default: '18:00' },
                },
                isActive: { type: Boolean, default: true },
                _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
            },
        ],

        // -----------------------------------------------------------------------
        // Document Verification
        // -----------------------------------------------------------------------
        documents: {
            medicalDegreeCertificate: {
                fileUrl: { type: String, default: '' },
                uploadedAt: { type: Date, default: null },
                verified: { type: Boolean, default: false },
            },
            medicalCouncilRegistration: {
                fileUrl: { type: String, default: '' },
                uploadedAt: { type: Date, default: null },
                verified: { type: Boolean, default: false },
            },
            governmentId: {
                fileUrl: { type: String, default: '' },
                uploadedAt: { type: Date, default: null },
                verified: { type: Boolean, default: false },
            },
        },

        // -----------------------------------------------------------------------
        // Verification Status
        // -----------------------------------------------------------------------
        verificationStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'resubmitted'],
            default: 'pending',
        },
        verificationNote: {
            type: String,
            default: '',
        },
        verifiedAt: {
            type: Date,
            default: null,
        },
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },
        rejectionReason: {
            type: String,
            default: '',
        },

        // -----------------------------------------------------------------------
        // Account Status
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
        // Consultation Settings
        // -----------------------------------------------------------------------
        isOnlineConsultationEnabled: {
            type: Boolean,
            default: true,
        },
        isInstantConsultationEnabled: {
            type: Boolean,
            default: false,
        },
        maxDailyAppointments: {
            type: Number,
            default: 30,
        },

        // -----------------------------------------------------------------------
        // Privacy Controls
        // -----------------------------------------------------------------------
        showPhoneNumber: {
            type: Boolean,
            default: false,
        },

        // -----------------------------------------------------------------------
        // Slot Configuration
        // -----------------------------------------------------------------------
        slotConfig: {
            slotDuration: { type: Number, default: 15, enum: [10, 15, 30] }, // minutes
            bufferTime: { type: Number, default: 5 }, // minutes between slots
            maxAppointmentsPerSlot: { type: Number, default: 1 },
        },

        // -----------------------------------------------------------------------
        // Availability
        // -----------------------------------------------------------------------
        weeklySchedule: {
            monday: {
                isAvailable: { type: Boolean, default: true },
                slots: [{ start: String, end: String }],
                breakTimes: [{ start: String, end: String }],
            },
            tuesday: {
                isAvailable: { type: Boolean, default: true },
                slots: [{ start: String, end: String }],
                breakTimes: [{ start: String, end: String }],
            },
            wednesday: {
                isAvailable: { type: Boolean, default: true },
                slots: [{ start: String, end: String }],
                breakTimes: [{ start: String, end: String }],
            },
            thursday: {
                isAvailable: { type: Boolean, default: true },
                slots: [{ start: String, end: String }],
                breakTimes: [{ start: String, end: String }],
            },
            friday: {
                isAvailable: { type: Boolean, default: true },
                slots: [{ start: String, end: String }],
                breakTimes: [{ start: String, end: String }],
            },
            saturday: {
                isAvailable: { type: Boolean, default: false },
                slots: [{ start: String, end: String }],
                breakTimes: [{ start: String, end: String }],
            },
            sunday: {
                isAvailable: { type: Boolean, default: false },
                slots: [{ start: String, end: String }],
                breakTimes: [{ start: String, end: String }],
            },
        },
        customDateOverrides: [
            {
                date: { type: Date, required: true },
                isAvailable: { type: Boolean, default: false },
                reason: { type: String, default: '' },
                slots: [{ start: String, end: String }],
            },
        ],
        holidays: [
            {
                date: { type: Date, required: true },
                reason: { type: String, default: 'Holiday' },
            },
        ],

        // -----------------------------------------------------------------------
        // Ratings & Reviews Summary
        // -----------------------------------------------------------------------
        ratingSummary: {
            averageRating: { type: Number, default: 0, min: 0, max: 5 },
            totalReviews: { type: Number, default: 0 },
            totalAppointments: { type: Number, default: 0 },
            cancellationRate: { type: Number, default: 0 },
        },

        // -----------------------------------------------------------------------
        // Earnings Summary
        // -----------------------------------------------------------------------
        earningsSummary: {
            totalEarnings: { type: Number, default: 0 },
            pendingPayout: { type: Number, default: 0 },
            totalPaidOut: { type: Number, default: 0 },
        },

        // -----------------------------------------------------------------------
        // Bank / Payout Details
        // -----------------------------------------------------------------------
        bankDetails: {
            accountHolderName: { type: String, default: '' },
            bankName: { type: String, default: '' },
            accountNumber: { type: String, default: '' },
            ifscCode: { type: String, default: '' },
            upiId: { type: String, default: '' },
        },
        payoutCycle: {
            type: String,
            enum: ['weekly', 'monthly'],
            default: 'weekly',
        },

        // -----------------------------------------------------------------------
        // Commission
        // -----------------------------------------------------------------------
        commissionOverride: {
            type: Number,
            default: null, // null means use global commission
            min: 0,
            max: 100,
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
        // Notification Preferences
        // -----------------------------------------------------------------------
        notificationPreferences: {
            inApp: { type: Boolean, default: true },
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
        },

        // -----------------------------------------------------------------------
        // Two Factor Auth
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

        // -----------------------------------------------------------------------
        // Role
        // -----------------------------------------------------------------------
        role: {
            type: String,
            default: 'doctor',
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
doctorSchema.index({ email: 1 });
doctorSchema.index({ mobileNumber: 1 });
doctorSchema.index({ medicalRegistrationNumber: 1 });
doctorSchema.index({ specializations: 1 });
doctorSchema.index({ verificationStatus: 1 });
doctorSchema.index({ isActive: 1, isBlocked: 1 });
doctorSchema.index({ 'ratingSummary.averageRating': -1 });
doctorSchema.index({ 'clinics.address.city': 1 });
doctorSchema.index({ 'consultationFees.online': 1 });
doctorSchema.index({ createdAt: -1 });

// ---------------------------------------------------------------------------
// Pre-save: Hash password
// ---------------------------------------------------------------------------
doctorSchema.pre('save', async function (next) {
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
doctorSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// ---------------------------------------------------------------------------
// Method: Generate Email Verification Token
// ---------------------------------------------------------------------------
doctorSchema.methods.generateEmailVerificationToken = function () {
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
doctorSchema.methods.generateResetPasswordToken = function () {
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
doctorSchema.methods.recordLogin = function (ipAddress, userAgent, device) {
    this.lastLogin = new Date();
    this.loginHistory.unshift({
        timestamp: new Date(),
        ipAddress,
        userAgent,
        device,
    });
    if (this.loginHistory.length > 20) {
        this.loginHistory = this.loginHistory.slice(0, 20);
    }
};

// ---------------------------------------------------------------------------
// Method: To safe JSON
// ---------------------------------------------------------------------------
doctorSchema.methods.toSafeObject = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.refreshToken;
    delete obj.twoFactorSecret;
    delete obj.emailVerificationToken;
    delete obj.emailVerificationExpire;
    delete obj.resetPasswordToken;
    delete obj.resetPasswordExpire;
    delete obj.loginHistory;
    delete obj.__v;
    return obj;
};

const Doctor = mongoose.model('Doctor', doctorSchema);

module.exports = Doctor;
