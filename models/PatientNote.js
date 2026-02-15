const mongoose = require('mongoose');

const patientNoteSchema = new mongoose.Schema(
    {
        // -----------------------------------------------------------------------
        // References
        // -----------------------------------------------------------------------
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
        appointment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Appointment',
            default: null,
        },

        // -----------------------------------------------------------------------
        // Note Content (Private - only visible to doctor)
        // -----------------------------------------------------------------------
        note: {
            type: String,
            required: [true, 'Note content is required'],
            maxlength: [5000, 'Note cannot exceed 5000 characters'],
        },

        // -----------------------------------------------------------------------
        // Tags for categorization
        // -----------------------------------------------------------------------
        tags: {
            type: [String],
            default: [],
            enum: [
                'chronic',
                'follow_up',
                'critical',
                'allergic',
                'diabetic',
                'hypertensive',
                'pregnant',
                'elderly',
                'pediatric',
                'surgical',
                'mental_health',
                'post_operative',
                'medication_sensitive',
                'non_compliant',
                'vip',
                'other',
            ],
        },

        // -----------------------------------------------------------------------
        // Priority
        // -----------------------------------------------------------------------
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'low',
        },

        // -----------------------------------------------------------------------
        // Reminder
        // -----------------------------------------------------------------------
        reminder: {
            enabled: { type: Boolean, default: false },
            date: { type: Date, default: null },
            message: { type: String, default: '', maxlength: 500 },
        },

        // -----------------------------------------------------------------------
        // Status
        // -----------------------------------------------------------------------
        isArchived: {
            type: Boolean,
            default: false,
        },
        isPinned: {
            type: Boolean,
            default: false,
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
patientNoteSchema.index({ doctor: 1, patient: 1, createdAt: -1 });
patientNoteSchema.index({ doctor: 1, createdAt: -1 });
patientNoteSchema.index({ tags: 1 });
patientNoteSchema.index({ priority: 1 });
patientNoteSchema.index({ isPinned: -1, createdAt: -1 });
patientNoteSchema.index({ 'reminder.enabled': 1, 'reminder.date': 1 });

// Compound unique index to prevent duplicate notes for same doctor-patient-appointment
patientNoteSchema.index(
    { doctor: 1, patient: 1, appointment: 1 },
    { unique: true, partialFilterExpression: { appointment: { $ne: null } } }
);

const PatientNote = mongoose.model('PatientNote', patientNoteSchema);

module.exports = PatientNote;