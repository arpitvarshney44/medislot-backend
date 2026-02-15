const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema(
    {
        // Submitter
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'submitterModel',
            required: true,
        },
        submitterModel: {
            type: String,
            enum: ['User', 'Doctor'],
            required: true,
        },
        submitterName: { type: String, default: '' },
        submitterEmail: { type: String, default: '' },

        // Ticket Details
        ticketNumber: {
            type: String,
            unique: true,
        },
        subject: {
            type: String,
            required: [true, 'Subject is required'],
            trim: true,
            maxlength: 300,
        },
        description: {
            type: String,
            required: [true, 'Description is required'],
            maxlength: 5000,
        },
        category: {
            type: String,
            enum: ['appointment', 'payment', 'technical', 'account', 'doctor_issue', 'refund', 'other'],
            default: 'other',
        },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'urgent'],
            default: 'medium',
        },
        status: {
            type: String,
            enum: ['open', 'in_progress', 'waiting_response', 'resolved', 'closed'],
            default: 'open',
        },

        // Related References
        relatedAppointment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Appointment',
            default: null,
        },
        relatedPayment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Payment',
            default: null,
        },

        // Attachments
        attachments: [
            {
                fileName: { type: String },
                fileUrl: { type: String },
                uploadedAt: { type: Date, default: Date.now },
            },
        ],

        // Responses
        responses: [
            {
                message: { type: String, required: true },
                respondedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    refPath: 'responses.responderModel',
                },
                responderModel: {
                    type: String,
                    enum: ['Admin', 'User', 'Doctor'],
                },
                responderName: { type: String, default: '' },
                createdAt: { type: Date, default: Date.now },
            },
        ],

        // Assignment
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },

        // Resolution
        resolvedAt: {
            type: Date,
            default: null,
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },
        resolutionNote: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true,
    }
);

// Auto-generate ticket number
supportTicketSchema.pre('save', async function (next) {
    if (!this.ticketNumber) {
        const count = await mongoose.model('SupportTicket').countDocuments();
        this.ticketNumber = `MS-${String(count + 1001).padStart(6, '0')}`;
    }
    next();
});

supportTicketSchema.index({ status: 1 });
supportTicketSchema.index({ priority: 1 });
supportTicketSchema.index({ submittedBy: 1 });
supportTicketSchema.index({ assignedTo: 1 });
supportTicketSchema.index({ createdAt: -1 });
supportTicketSchema.index({ ticketNumber: 1 });

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

module.exports = SupportTicket;
