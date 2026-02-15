const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
    {
        // -----------------------------------------------------------------------
        // Patient & Doctor
        // -----------------------------------------------------------------------
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Patient is required'],
        },
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
            required: [true, 'Doctor is required'],
        },

        // -----------------------------------------------------------------------
        // Appointment Details
        // -----------------------------------------------------------------------
        appointmentDate: {
            type: Date,
            required: [true, 'Appointment date is required'],
        },
        timeSlot: {
            start: { type: String, required: true }, // "09:00"
            end: { type: String, required: true },   // "09:30"
        },
        consultationType: {
            type: String,
            enum: ['online', 'offline'],
            required: [true, 'Consultation type is required'],
        },

        // -----------------------------------------------------------------------
        // Status
        // -----------------------------------------------------------------------
        status: {
            type: String,
            enum: ['pending', 'confirmed', 'ongoing', 'completed', 'cancelled', 'no_show', 'rescheduled'],
            default: 'pending',
        },
        cancellationReason: {
            type: String,
            default: '',
        },
        cancelledBy: {
            type: String,
            enum: ['patient', 'doctor', 'admin', ''],
            default: '',
        },
        cancelledAt: {
            type: Date,
            default: null,
        },
        rescheduledFrom: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Appointment',
            default: null,
        },

        // -----------------------------------------------------------------------
        // Consultation Details
        // -----------------------------------------------------------------------
        symptoms: {
            type: String,
            default: '',
        },
        diagnosis: {
            type: String,
            default: '',
        },
        prescription: {
            type: String,
            default: '',
        },
        notes: {
            type: String,
            default: '',
        },
        attachments: [
            {
                fileName: { type: String },
                fileUrl: { type: String },
                fileType: { type: String },
                uploadedAt: { type: Date, default: Date.now },
            },
        ],

        // -----------------------------------------------------------------------
        // Video Consultation
        // -----------------------------------------------------------------------
        videoSession: {
            sessionId: { type: String, default: '' },
            startedAt: { type: Date, default: null },
            endedAt: { type: Date, default: null },
            duration: { type: Number, default: 0 }, // minutes
        },

        // -----------------------------------------------------------------------
        // Payment Reference
        // -----------------------------------------------------------------------
        payment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Payment',
            default: null,
        },
        consultationFee: {
            type: Number,
            required: [true, 'Consultation fee is required'],
            min: 0,
        },

        // -----------------------------------------------------------------------
        // Clinic (for offline)
        // -----------------------------------------------------------------------
        clinic: {
            clinicId: { type: mongoose.Schema.Types.ObjectId, default: null },
            clinicName: { type: String, default: '' },
            address: { type: String, default: '' },
        },

        // -----------------------------------------------------------------------
        // Follow-up
        // -----------------------------------------------------------------------
        isFollowUp: {
            type: Boolean,
            default: false,
        },
        followUpDate: {
            type: Date,
            default: null,
        },
        parentAppointment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Appointment',
            default: null,
        },

        // -----------------------------------------------------------------------
        // Rating (post-consultation)
        // -----------------------------------------------------------------------
        hasReview: {
            type: Boolean,
            default: false,
        },
        review: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Review',
            default: null,
        },

        // -----------------------------------------------------------------------
        // Admin Actions
        // -----------------------------------------------------------------------
        adminNotes: {
            type: String,
            default: '',
        },
        assignedAlternateDoctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Indexes
appointmentSchema.index({ patient: 1, appointmentDate: -1 });
appointmentSchema.index({ doctor: 1, appointmentDate: -1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ appointmentDate: 1 });
appointmentSchema.index({ createdAt: -1 });

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;
