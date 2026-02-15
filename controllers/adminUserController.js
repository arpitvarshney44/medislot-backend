const User = require('../models/User');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ---------------------------------------------------------------------------
// @desc    Get all users/patients (with filters, search, pagination)
// @route   GET /api/admin/users
// @access  Private (Admin - users.view)
// ---------------------------------------------------------------------------
const getAllUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            isActive,
            isBlocked,
            isEmailVerified,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = req.query;

        const pageNum = Math.max(parseInt(page), 1);
        const limitNum = Math.min(Math.max(parseInt(limit), 1), 50);
        const skip = (pageNum - 1) * limitNum;

        // Build filter
        const filter = {};

        if (search) {
            filter.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { mobileNumber: { $regex: search, $options: 'i' } },
            ];
        }

        if (isActive === 'true') filter.isActive = true;
        else if (isActive === 'false') filter.isActive = false;

        if (isBlocked === 'true') filter.isBlocked = true;
        else if (isBlocked === 'false') filter.isBlocked = false;

        if (isEmailVerified === 'true') filter.isEmailVerified = true;
        else if (isEmailVerified === 'false') filter.isEmailVerified = false;

        // Sort
        const sortObj = {};
        const allowedSorts = ['createdAt', 'fullName', 'email', 'lastLogin'];
        sortObj[allowedSorts.includes(sortBy) ? sortBy : 'createdAt'] = sortOrder === 'asc' ? 1 : -1;

        const [users, total] = await Promise.all([
            User.find(filter)
                .select('-password -refreshToken -emailVerificationToken -resetPasswordToken')
                .sort(sortObj)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            User.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: {
                users,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    totalUsers: total,
                    limit: limitNum,
                    hasNext: pageNum * limitNum < total,
                    hasPrev: pageNum > 1,
                },
            },
        });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Get single user by ID
// @route   GET /api/admin/users/:id
// @access  Private (Admin - users.view)
// ---------------------------------------------------------------------------
const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password -refreshToken -emailVerificationToken -resetPasswordToken')
            .lean();

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        res.status(200).json({ success: true, data: { user } });
    } catch (error) {
        console.error('Get user by ID error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch user details.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Block / Unblock a user
// @route   PUT /api/admin/users/:id/block
// @access  Private (Admin - users.block)
// ---------------------------------------------------------------------------
const toggleBlockUser = async (req, res) => {
    try {
        const { action, reason } = req.body;

        if (!action || !['block', 'unblock'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Action must be "block" or "unblock".' });
        }

        if (action === 'block' && (!reason || !reason.trim())) {
            return res.status(400).json({ success: false, message: 'Block reason is required.' });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        if (action === 'block') {
            user.isBlocked = true;
            user.blockReason = reason.trim();
        } else {
            user.isBlocked = false;
            user.blockReason = '';
        }

        await user.save();

        // Log admin action
        if (req.user.logAction) {
            await req.user.logAction(
                action === 'block' ? 'user_blocked' : 'user_unblocked',
                `${action === 'block' ? 'Blocked' : 'Unblocked'} user: ${user.fullName} (${user.email})`,
                req.ip
            );
        }

        res.status(200).json({
            success: true,
            message: `User ${user.fullName} has been ${action}ed.`,
            data: {
                user: {
                    id: user._id,
                    fullName: user.fullName,
                    email: user.email,
                    isBlocked: user.isBlocked,
                    blockReason: user.blockReason,
                },
            },
        });
    } catch (error) {
        console.error('Toggle block user error:', error);
        res.status(500).json({ success: false, message: 'Failed to update user status.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Update user profile (admin editing)
// @route   PUT /api/admin/users/:id
// @access  Private (Admin - users.edit)
// ---------------------------------------------------------------------------
const updateUserByAdmin = async (req, res) => {
    try {
        const allowedUpdates = [
            'fullName', 'email', 'mobileNumber', 'dateOfBirth', 'gender',
            'address', 'isActive',
        ];

        const updates = {};
        for (const key of allowedUpdates) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: 'No valid fields to update.' });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-password -refreshToken -emailVerificationToken -resetPasswordToken');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Log admin action
        if (req.user.logAction) {
            await req.user.logAction(
                'user_updated',
                `Updated user profile: ${user.fullName} — Fields: ${Object.keys(updates).join(', ')}`,
                req.ip
            );
        }

        res.status(200).json({
            success: true,
            message: 'User profile updated.',
            data: { user },
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ success: false, message: 'Failed to update user profile.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Admin reset user password
// @route   PUT /api/admin/users/:id/reset-password
// @access  Private (Admin - users.edit)
// ---------------------------------------------------------------------------
const resetUserPassword = async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
        }

        const user = await User.findById(req.params.id).select('+password');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        user.password = newPassword; // Pre-save hook will hash it
        await user.save();

        // Log admin action
        if (req.user.logAction) {
            await req.user.logAction(
                'user_password_reset',
                `Reset password for user: ${user.fullName} (${user.email})`,
                req.ip
            );
        }

        res.status(200).json({
            success: true,
            message: `Password reset for ${user.fullName}.`,
        });
    } catch (error) {
        console.error('Reset user password error:', error);
        res.status(500).json({ success: false, message: 'Failed to reset password.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Delete a user (soft delete by deactivating)
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin - users.delete)
// ---------------------------------------------------------------------------
const deleteUser = async (req, res) => {
    try {
        const { permanent } = req.query;

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        if (permanent === 'true') {
            await User.findByIdAndDelete(req.params.id);
        } else {
            user.isActive = false;
            user.isBlocked = true;
            user.blockReason = 'Account deactivated by admin.';
            await user.save();
        }

        // Log admin action
        if (req.user.logAction) {
            await req.user.logAction(
                permanent === 'true' ? 'user_deleted' : 'user_deactivated',
                `${permanent === 'true' ? 'Permanently deleted' : 'Deactivated'} user: ${user.fullName} (${user.email})`,
                req.ip
            );
        }

        res.status(200).json({
            success: true,
            message: `User ${user.fullName} has been ${permanent === 'true' ? 'permanently deleted' : 'deactivated'}.`,
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete user.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Get user stats summary
// @route   GET /api/admin/users/stats
// @access  Private (Admin - users.view)
// ---------------------------------------------------------------------------
const getUserStats = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const [total, active, blocked, verified, unverified, newToday, newMonth] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isActive: true, isBlocked: false }),
            User.countDocuments({ isBlocked: true }),
            User.countDocuments({ isEmailVerified: true }),
            User.countDocuments({ isEmailVerified: false }),
            User.countDocuments({ createdAt: { $gte: today } }),
            User.countDocuments({ createdAt: { $gte: monthStart } }),
        ]);

        res.status(200).json({
            success: true,
            data: {
                total,
                active,
                blocked,
                verified,
                unverified,
                newToday,
                newThisMonth: newMonth,
            },
        });
    } catch (error) {
        console.error('User stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch user stats.' });
    }
};

module.exports = {
    getAllUsers,
    getUserById,
    toggleBlockUser,
    updateUserByAdmin,
    resetUserPassword,
    deleteUser,
    getUserStats,
};
