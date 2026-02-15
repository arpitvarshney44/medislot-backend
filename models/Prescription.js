const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Medicine name is required'],
            trim: true,
            maxlength: [200, 'Medicine name cannot exceed 200 characters'],
        },
        dosage: {
            type: String,
            required: [true, 'Dosage is required'],
            trim: true,
            maxlength: [100, 'Dosage cannot exceed 100 characters'],
        },
        frequency: {
            type: String,
            required: [true, 'Frequency is required'],
            trim: true,
            maxlength: [100, 'Frequency cannot exceed 100 characters'],
            // e.g., "Once daily", "Twice daily", "Three times daily", "As needed"
        },
        duration: {
            type: String,
            required: [true, 'Duration is required'],
            trim: true,
            maxlength: [100, 'Duration cannot exceed 100 characters'],
            // e.g., "7 days", "2 weeks", "1 month"
        },
        timing: {
            type: String,
            enum: ['before_meal', 'after_meal', 'with_meal', 'empty_stomach', 'bedtime', 'as_needed', 'other'],
            default: 'after_meal',
        },
        route: {
            type: String,
            enum: ['oral', 'topical', 'injection', 'inhalation', 'sublingual', 'rectal', 'ophthalmic', 'otic', 'nasal', 'other'],
            default: 'oral',
        },
        instructions: {
            type: String,
            default: '',
            maxlength: [500, 'Instructions cannot exceed 500 characters'],
        },
    },
    { _id: true }
);

const labTestSchema = new mongoose.Schema(
    {
        testName: {
            type: String,
            required: [true, 'Test name is required'],
            trim: true,
            maxlength: [200, 'Test name cannot exceed 200 characters'],
        },
        urgency: {
            type: String,
            enum: ['routine', 'urgent', 'stat'],
            default: 'routine',
        },
        instructions: {
            type: String,
            default: '',
            maxlength: [500, 'Instructions cannot exceed 500 characters'],
        },
        fasting: {
            type: Boolean,
            default: false,
        },
    },
    { _id: true }
);

const prescriptionSchema = new mongoose.Schema(
    {
        // -----------------------------------------------------------------------
        // References
        // -----------------------------------------------------------------------
        appointment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Appointment',
            required: [true, 'Appointment reference is required'],
        },
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
            required: [true, 'Doctor reference is required'],
        },
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Patient reference is required'],
        },

        // -----------------------------------------------------------------------
        // Prescription Number (auto-generated)
        // -----------------------------------------------------------------------
        prescriptionNumber: {
            type: String,
            unique: true,
            required: true,
        },

        // -----------------------------------------------------------------------
        // Diagnosis
        // -----------------------------------------------------------------------
        diagnosis: {
            primary: {
                type: String,
                required: [true, 'Primary diagnosis is required'],
                trim: true,
                maxlength: [500, 'Primary diagnosis cannot exceed 500 characters'],
            },
            secondary: {
                type: [String],
                default: [],
            },
            icdCodes: {
                type: [String],
                default: [],
            },
            notes: {
                type: String,
                default: '',
                maxlength: [2000, 'Diagnosis notes cannot exceed 2000 characters'],
            },
        },

        // -----------------------------------------------------------------------
        // Medicines
        // -----------------------------------------------------------------------
        medicines: {
            type: [medicineSchema],
            validate: {
                validator: function (v) {
                    return v && v.length > 0;
                },
                message: 'At least one medicine is required',
            },
        },

        // -----------------------------------------------------------------------
        // Lab Tests
        // -----------------------------------------------------------------------
        labTests: {
            type: [labTestSchema],
            default: [],
        },

        // -----------------------------------------------------------------------
        // Advice & Notes
        // -----------------------------------------------------------------------
        advice: {
            type: String,
            default: '',
            maxlength: [3000, 'Advice cannot exceed 3000 characters'],
        },
        dietaryInstructions: {
            type: String,
            default: '',
            maxlength: [1000, 'Dietary instructions cannot exceed 1000 characters'],
        },
        lifestyleRecommendations: {
            type: String,
            default: '',
            maxlength: [1000, 'Lifestyle recommendations cannot exceed 1000 characters'],
        },

        // -----------------------------------------------------------------------
        // Vitals (recorded during consultation)
        // -----------------------------------------------------------------------
        vitals: {
            bloodPressure: {
                systolic: { type: Number, default: null },
                diastolic: { type: Number, default: null },
            },
            heartRate: { type: Number, default: null },
            temperature: { type: Number, default: null },
            weight: { type: Number, default: null },
            height: { type: Number, default: null },
            oxygenSaturation: { type: Number, default: null },
            bloodSugar: { type: Number, default: null },
            respiratoryRate: { type: Number, default: null },
        },

        // -----------------------------------------------------------------------
        // Follow-up
        // -----------------------------------------------------------------------
        followUp: {
            required: {
                type: Boolean,
                default: false,
            },
            date: {
                type: Date,
                default: null,
            },
            notes: {
                type: String,
                default: '',
                maxlength: [500, 'Follow-up notes cannot exceed 500 characters'],
            },
        },

        // -----------------------------------------------------------------------
        // PDF
        // -----------------------------------------------------------------------
        pdfUrl: {
            type: String,
            default: '',
        },
        pdfGeneratedAt: {
            type: Date,
            default: null,
        },

        // -----------------------------------------------------------------------
        // Status
        // -----------------------------------------------------------------------
        status: {
            type: String,
            enum: ['draft', 'finalized', 'sent', 'viewed'],
            default: 'draft',
        },
        sentAt: {
            type: Date,
            default: null,
        },
        viewedAt: {
            type: Date,
            default: null,
        },
        viewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },

        // -----------------------------------------------------------------------
        // Validity
        // -----------------------------------------------------------------------
        validUntil: {
            type: Date,
            default: function () {
                const date = new Date();
                date.setMonth(date.getMonth() + 3); // 3 months validity
                return date;
            },
        },

        // -----------------------------------------------------------------------
        // Edit History
        // -----------------------------------------------------------------------
        editHistory: [
            {
                editedAt: { type: Date, default: Date.now },
                editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
                changes: { type: String, default: '' },
            },
        ],
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
prescriptionSchema.index({ doctor: 1, createdAt: -1 });
prescriptionSchema.index({ patient: 1, createdAt: -1 });
prescriptionSchema.index({ appointment: 1 });
prescriptionSchema.index({ prescriptionNumber: 1 });
prescriptionSchema.index({ status: 1 });
prescriptionSchema.index({ 'followUp.date': 1 });

// ---------------------------------------------------------------------------
// Virtual: isExpired
// ---------------------------------------------------------------------------
prescriptionSchema.virtual('isExpired').get(function () {
    return this.validUntil && new Date() > this.validUntil;
});

// ---------------------------------------------------------------------------
// Virtual: medicineCount
// ---------------------------------------------------------------------------
prescriptionSchema.virtual('medicineCount').get(function () {
    return this.medicines ? this.medicines.length : 0;
});

// ---------------------------------------------------------------------------
// Virtual: labTestCount
// ---------------------------------------------------------------------------
prescriptionSchema.virtual('labTestCount').get(function () {
    return this.labTests ? this.labTests.length : 0;
});

// ---------------------------------------------------------------------------
// Pre-save: Generate prescription number
// ---------------------------------------------------------------------------
prescriptionSchema.pre('save', async function (next) {
    if (this.isNew && !this.prescriptionNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');

        // Count prescriptions created today for sequential numbering
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        const count = await mongoose.model('Prescription').countDocuments({
            createdAt: { $gte: startOfDay, $lt: endOfDay },
        });

        const sequence = (count + 1).toString().padStart(4, '0');
        this.prescriptionNumber = `RX${year}${month}${day}${sequence}`;
    }
    next();
});

// ---------------------------------------------------------------------------
// Static: Find by doctor with pagination
// ---------------------------------------------------------------------------
prescriptionSchema.statics.findByDoctor = function (doctorId, options = {}) {
    const {
        page = 1,
        limit = 20,
        status,
        patientId,
        startDate,
        endDate,
        search,
    } = options;

    const query = { doctor: doctorId };

    if (status) query.status = status;
    if (patientId) query.patient = patientId;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    if (search) {
        query.$or = [
            { prescriptionNumber: { $regex: search, $options: 'i' } },
            { 'diagnosis.primary': { $regex: search, $options: 'i' } },
        ];
    }

    return this.find(query)
        .populate('patient', 'fullName email mobileNumber profilePhoto')
        .populate('appointment', 'appointmentDate timeSlot consultationType status')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
};

// ---------------------------------------------------------------------------
// Static: Find by patient with pagination
// ---------------------------------------------------------------------------
prescriptionSchema.statics.findByPatient = function (patientId, options = {}) {
    const { page = 1, limit = 20, doctorId } = options;

    const query = { patient: patientId, status: { $in: ['finalized', 'sent', 'viewed'] } };
    if (doctorId) query.doctor = doctorId;

    return this.find(query)
        .populate('doctor', 'fullName specializations profilePhoto qualifications')
        .populate('appointment', 'appointmentDate timeSlot consultationType')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
};

const Prescription = mongoose.model('Prescription', prescriptionSchema);

module.exports = Prescription;