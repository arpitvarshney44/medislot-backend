const Review = require('../models/Review');
const Doctor = require('../models/Doctor');

/**
 * @desc    Get all reviews for the doctor
 * @route   GET /api/doctor/reviews
 * @access  Private (Doctor)
 */
const getReviews = async (req, res) => {
    try {
        const doctorId = req.user._id;
        const {
            page = 1,
            limit = 20,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            rating,
            hasReply,
        } = req.query;

        const query = { doctor: doctorId, isHidden: false };

        if (rating) {
            query.rating = parseInt(rating);
        }

        if (hasReply === 'true') {
            query['doctorReply.comment'] = { $ne: '' };
        } else if (hasReply === 'false') {
            query.$or = [
                { 'doctorReply.comment': '' },
                { 'doctorReply.comment': { $exists: false } },
            ];
        }

        const sortConfig = {};
        sortConfig[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [reviews, total, ratingDistribution] = await Promise.all([
            Review.find(query)
                .populate('patient', 'fullName profilePhoto')
                .populate('appointment', 'appointmentDate consultationType')
                .sort(sortConfig)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Review.countDocuments(query),
            // Rating distribution
            Review.aggregate([
                { $match: { doctor: doctorId, isHidden: false } },
                {
                    $group: {
                        _id: '$rating',
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: -1 } },
            ]),
        ]);

        // Build distribution object
        const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        ratingDistribution.forEach((r) => {
            distribution[r._id] = r.count;
        });

        // Get doctor's rating summary
        const doctor = await Doctor.findById(doctorId)
            .select('ratingSummary')
            .lean();

        res.status(200).json({
            success: true,
            data: {
                reviews,
                ratingSummary: doctor?.ratingSummary || {},
                ratingDistribution: distribution,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    hasMore: skip + reviews.length < total,
                },
            },
        });
    } catch (error) {
        console.error('Get reviews error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch reviews.' });
    }
};

/**
 * @desc    Reply to a review
 * @route   PUT /api/doctor/reviews/:reviewId/reply
 * @access  Private (Doctor)
 */
const replyToReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { comment } = req.body;

        if (!comment || !comment.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Reply comment is required.',
            });
        }

        if (comment.trim().length > 1000) {
            return res.status(400).json({
                success: false,
                message: 'Reply cannot exceed 1000 characters.',
            });
        }

        const review = await Review.findOne({
            _id: reviewId,
            doctor: req.user._id,
        });

        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found.' });
        }

        review.doctorReply = {
            comment: comment.trim(),
            repliedAt: new Date(),
        };
        await review.save();

        res.status(200).json({
            success: true,
            message: 'Reply posted successfully.',
            data: { review },
        });
    } catch (error) {
        console.error('Reply to review error:', error);
        res.status(500).json({ success: false, message: 'Failed to post reply.' });
    }
};

/**
 * @desc    Report an abusive review
 * @route   PUT /api/doctor/reviews/:reviewId/report
 * @access  Private (Doctor)
 */
const reportReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Report reason is required.',
            });
        }

        const review = await Review.findOne({
            _id: reviewId,
            doctor: req.user._id,
        });

        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found.' });
        }

        if (review.isFlagged) {
            return res.status(400).json({
                success: false,
                message: 'This review has already been reported.',
            });
        }

        review.isFlagged = true;
        review.flagReason = reason.trim();
        await review.save();

        res.status(200).json({
            success: true,
            message: 'Review reported to admin for moderation.',
            data: { review },
        });
    } catch (error) {
        console.error('Report review error:', error);
        res.status(500).json({ success: false, message: 'Failed to report review.' });
    }
};

module.exports = {
    getReviews,
    replyToReview,
    reportReview,
};