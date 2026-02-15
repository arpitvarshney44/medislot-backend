const Review = require('../models/Review');
const ErrorResponse = require('../utils/errorResponse');

// ============================================================================
// @desc    Get all reviews (with filters, pagination)
// @route   GET /api/admin/reviews
// ============================================================================
exports.getAllReviews = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, rating, isFlagged, isHidden, doctorId } = req.query;

        const filter = {};
        if (rating) filter.rating = parseInt(rating);
        if (isFlagged !== undefined) filter.isFlagged = isFlagged === 'true';
        if (isHidden !== undefined) filter.isHidden = isHidden === 'true';
        if (doctorId) filter.doctor = doctorId;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Review.countDocuments(filter);

        const reviews = await Review.find(filter)
            .populate('patient', 'fullName email profilePhoto')
            .populate('doctor', 'fullName email specializations profilePhoto')
            .populate('appointment', 'appointmentDate consultationType')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            data: {
                reviews,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalReviews: total,
                    limit: parseInt(limit),
                    hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
                    hasPrev: parseInt(page) > 1,
                },
            },
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Get review stats
// @route   GET /api/admin/reviews/stats
// ============================================================================
exports.getReviewStats = async (req, res, next) => {
    try {
        const [total, flagged, hidden, avgRating, ratingDist] = await Promise.all([
            Review.countDocuments(),
            Review.countDocuments({ isFlagged: true }),
            Review.countDocuments({ isHidden: true }),
            Review.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' } } }]),
            Review.aggregate([{ $group: { _id: '$rating', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
        ]);

        const distribution = {};
        ratingDist.forEach((r) => { distribution[r._id] = r.count; });

        res.status(200).json({
            success: true,
            data: {
                total,
                flagged,
                hidden,
                averageRating: avgRating[0]?.avg ? parseFloat(avgRating[0].avg.toFixed(1)) : 0,
                distribution,
            },
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Flag/unflag a review
// @route   PUT /api/admin/reviews/:id/flag
// ============================================================================
exports.toggleFlag = async (req, res, next) => {
    try {
        const { flagReason } = req.body;
        const review = await Review.findById(req.params.id);
        if (!review) return next(new ErrorResponse('Review not found', 404));

        review.isFlagged = !review.isFlagged;
        review.flagReason = review.isFlagged ? (flagReason || '') : '';
        await review.save();

        res.status(200).json({
            success: true,
            message: `Review ${review.isFlagged ? 'flagged' : 'unflagged'}`,
            data: { review },
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Hide/show a review
// @route   PUT /api/admin/reviews/:id/visibility
// ============================================================================
exports.toggleVisibility = async (req, res, next) => {
    try {
        const { moderationNote } = req.body;
        const review = await Review.findById(req.params.id);
        if (!review) return next(new ErrorResponse('Review not found', 404));

        review.isHidden = !review.isHidden;
        review.hiddenBy = review.isHidden ? req.user._id : null;
        review.hiddenAt = review.isHidden ? new Date() : null;
        review.moderationNote = moderationNote || review.moderationNote;
        await review.save();

        if (req.user.logAction) {
            await req.user.logAction('moderate_review', `Review ${review._id} ${review.isHidden ? 'hidden' : 'shown'}`);
        }

        res.status(200).json({
            success: true,
            message: `Review ${review.isHidden ? 'hidden' : 'visible'}`,
            data: { review },
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Delete a review
// @route   DELETE /api/admin/reviews/:id
// ============================================================================
exports.deleteReview = async (req, res, next) => {
    try {
        const review = await Review.findByIdAndDelete(req.params.id);
        if (!review) return next(new ErrorResponse('Review not found', 404));

        if (req.user.logAction) {
            await req.user.logAction('delete_review', `Deleted review ${req.params.id}`);
        }

        res.status(200).json({ success: true, message: 'Review deleted' });
    } catch (err) {
        next(err);
    }
};
