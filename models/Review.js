const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
    {
        appointment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Appointment',
            required: true,
        },
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        doctor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
            required: true,
        },
        rating: {
            type: Number,
            required: [true, 'Rating is required'],
            min: 1,
            max: 5,
        },
        title: {
            type: String,
            default: '',
            maxlength: 200,
        },
        comment: {
            type: String,
            default: '',
            maxlength: 2000,
        },

        // Moderation
        isFlagged: {
            type: Boolean,
            default: false,
        },
        flagReason: {
            type: String,
            default: '',
        },
        isHidden: {
            type: Boolean,
            default: false,
        },
        hiddenBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },
        hiddenAt: {
            type: Date,
            default: null,
        },
        moderationNote: {
            type: String,
            default: '',
        },

        // Doctor Response
        doctorReply: {
            comment: { type: String, default: '' },
            repliedAt: { type: Date, default: null },
        },
    },
    {
        timestamps: true,
    }
);

reviewSchema.index({ doctor: 1, createdAt: -1 });
reviewSchema.index({ patient: 1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ isFlagged: 1 });
reviewSchema.index({ isHidden: 1 });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
