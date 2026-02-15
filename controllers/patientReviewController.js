const Review = require('../models/Review');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');

// @desc    Submit review for a doctor
// @route   POST /api/patient/reviews
exports.submitReview = async (req, res, next) => {
    try {
        const { doctor: doctorId, appointment: appointmentId, rating, comment } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
        }

        // Verify appointment exists and is completed
        const appointment = await Appointment.findOne({
            _id: appointmentId,
            patient: req.user._id,
            doctor: doctorId,
            status: 'completed',
        });

        if (!appointment) {
            return res.status(400).json({ success: false, message: 'You can only review after a completed consultation' });
        }

        // Check if already reviewed
        const existingReview = await Review.findOne({ patient: req.user._id, appointment: appointmentId });
        if (existingReview) {
            return res.status(400).json({ success: false, message: 'You have already reviewed this appointment' });
        }

        const review = await Review.create({
            patient: req.user._id,
            doctor: doctorId,
            appointment: appointmentId,
            rating,
            comment: comment?.trim() || '',
        });

        // Update doctor average rating
        const allReviews = await Review.find({ doctor: doctorId, isHidden: { $ne: true } });
        const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
        await Doctor.findByIdAndUpdate(doctorId, {
            averageRating: Math.round(avgRating * 10) / 10,
            totalReviews: allReviews.length,
        });

        res.status(201).json({ success: true, message: 'Review submitted successfully', data: { review } });
    } catch (error) {
        next(error);
    }
};

// @desc    Get patient's reviews
// @route   GET /api/patient/reviews
exports.getMyReviews = async (req, res, next) => {
    try {
        const reviews = await Review.find({ patient: req.user._id })
            .populate('doctor', 'fullName specializations profilePhoto')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({ success: true, data: { reviews } });
    } catch (error) {
        next(error);
    }
};
