const Doctor = require('../models/Doctor');
const Admin = require('../models/Admin');
const { sendDoctorVerificationEmail } = require('../utils/sendEmail');

// ---------------------------------------------------------------------------
// @desc    Get all doctors (with filters, search, pagination)
// @route   GET /api/admin/doctors
// @access  Private (Admin - doctors.view)
// ---------------------------------------------------------------------------
const getAllDoctors = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            status,          // pending, approved, rejected
            specialization,
            isBlocked,
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
                { medicalRegistrationNumber: { $regex: search, $options: 'i' } },
            ];
        }

        if (status && ['pending', 'approved', 'rejected'].includes(status)) {
            filter.verificationStatus = status;
        }

        if (specialization) {
            filter.specializations = { $in: [specialization] };
        }

        if (isBlocked === 'true') filter.isBlocked = true;
        else if (isBlocked === 'false') filter.isBlocked = false;

        // Sort
        const sortObj = {};
        const allowedSorts = ['createdAt', 'fullName', 'email', 'verificationStatus', 'yearsOfExperience'];
        sortObj[allowedSorts.includes(sortBy) ? sortBy : 'createdAt'] = sortOrder === 'asc' ? 1 : -1;

        const [doctors, total] = await Promise.all([
            Doctor.find(filter)
                .select('-password -refreshToken -twoFactorSecret -twoFactorBackupCodes')
                .sort(sortObj)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Doctor.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: {
                doctors,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    totalDoctors: total,
                    limit: limitNum,
                    hasNext: pageNum * limitNum < total,
                    hasPrev: pageNum > 1,
                },
            },
        });
    } catch (error) {
        console.error('Get all doctors error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch doctors.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Get single doctor by ID
// @route   GET /api/admin/doctors/:id
// @access  Private (Admin - doctors.view)
// ---------------------------------------------------------------------------
const getDoctorById = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.params.id)
            .select('-password -refreshToken -twoFactorSecret -twoFactorBackupCodes')
            .lean();

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        res.status(200).json({ success: true, data: { doctor } });
    } catch (error) {
        console.error('Get doctor by ID error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch doctor details.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Approve a doctor
// @route   PUT /api/admin/doctors/:id/approve
// @access  Private (Admin - doctors.approve)
// ---------------------------------------------------------------------------
const approveDoctor = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.params.id);

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        if (doctor.verificationStatus === 'approved') {
            return res.status(400).json({ success: false, message: 'Doctor is already approved.' });
        }

        doctor.verificationStatus = 'approved';
        doctor.verifiedAt = new Date();
        doctor.verifiedBy = req.user._id;
        doctor.rejectionReason = '';
        await doctor.save();

        // Log admin action
        if (req.user.logAction) {
            await req.user.logAction(
                'doctor_approved',
                `Approved doctor: ${doctor.fullName} (${doctor.email})`,
                req.ip
            );
        }

        // Send notification email
        try {
            await sendDoctorVerificationEmail(doctor.email, doctor.fullName, 'approved');
        } catch (emailErr) {
            console.error('Email notification failed:', emailErr);
        }

        res.status(200).json({
            success: true,
            message: `Dr. ${doctor.fullName} has been approved.`,
            data: {
                doctor: {
                    id: doctor._id,
                    fullName: doctor.fullName,
                    email: doctor.email,
                    verificationStatus: doctor.verificationStatus,
                    verifiedAt: doctor.verifiedAt,
                },
            },
        });
    } catch (error) {
        console.error('Approve doctor error:', error);
        res.status(500).json({ success: false, message: 'Failed to approve doctor.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Reject a doctor
// @route   PUT /api/admin/doctors/:id/reject
// @access  Private (Admin - doctors.approve)
// ---------------------------------------------------------------------------
const rejectDoctor = async (req, res) => {
    try {
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
        }

        const doctor = await Doctor.findById(req.params.id);

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        doctor.verificationStatus = 'rejected';
        doctor.rejectionReason = reason.trim();
        doctor.verifiedAt = null;
        doctor.verifiedBy = null;
        await doctor.save();

        // Log admin action
        if (req.user.logAction) {
            await req.user.logAction(
                'doctor_rejected',
                `Rejected doctor: ${doctor.fullName} — Reason: ${reason}`,
                req.ip
            );
        }

        // Send notification email
        try {
            await sendDoctorVerificationEmail(doctor.email, doctor.fullName, 'rejected', reason);
        } catch (emailErr) {
            console.error('Email notification failed:', emailErr);
        }

        res.status(200).json({
            success: true,
            message: `Dr. ${doctor.fullName} has been rejected.`,
            data: {
                doctor: {
                    id: doctor._id,
                    fullName: doctor.fullName,
                    email: doctor.email,
                    verificationStatus: doctor.verificationStatus,
                    rejectionReason: doctor.rejectionReason,
                },
            },
        });
    } catch (error) {
        console.error('Reject doctor error:', error);
        res.status(500).json({ success: false, message: 'Failed to reject doctor.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Block / Unblock a doctor
// @route   PUT /api/admin/doctors/:id/block
// @access  Private (Admin - doctors.block)
// ---------------------------------------------------------------------------
const toggleBlockDoctor = async (req, res) => {
    try {
        const { action, reason } = req.body; // action: 'block' or 'unblock'

        if (!action || !['block', 'unblock'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Action must be "block" or "unblock".' });
        }

        if (action === 'block' && (!reason || !reason.trim())) {
            return res.status(400).json({ success: false, message: 'Block reason is required.' });
        }

        const doctor = await Doctor.findById(req.params.id);

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        if (action === 'block') {
            doctor.isBlocked = true;
            doctor.blockReason = reason.trim();
        } else {
            doctor.isBlocked = false;
            doctor.blockReason = '';
        }

        await doctor.save();

        // Log admin action
        if (req.user.logAction) {
            await req.user.logAction(
                action === 'block' ? 'doctor_blocked' : 'doctor_unblocked',
                `${action === 'block' ? 'Blocked' : 'Unblocked'} doctor: ${doctor.fullName}`,
                req.ip
            );
        }

        res.status(200).json({
            success: true,
            message: `Dr. ${doctor.fullName} has been ${action}ed.`,
            data: {
                doctor: {
                    id: doctor._id,
                    fullName: doctor.fullName,
                    isBlocked: doctor.isBlocked,
                    blockReason: doctor.blockReason,
                },
            },
        });
    } catch (error) {
        console.error('Toggle block doctor error:', error);
        res.status(500).json({ success: false, message: 'Failed to update doctor status.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Update doctor profile (admin editing)
// @route   PUT /api/admin/doctors/:id
// @access  Private (Admin - doctors.edit)
// ---------------------------------------------------------------------------
const updateDoctorByAdmin = async (req, res) => {
    try {
        const allowedUpdates = [
            'fullName', 'email', 'mobileNumber', 'specializations', 'title',
            'aboutDoctor', 'languagesSpoken', 'qualifications', 'yearsOfExperience',
            'enableOnlineConsultation', 'consultationFees', 'maxDailyAppointments',
        ];

        const updates = {};
        for (const key of allowedUpdates) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: 'No valid fields to update.' });
        }

        const doctor = await Doctor.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-password -refreshToken -twoFactorSecret -twoFactorBackupCodes');

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        // Log admin action
        if (req.user.logAction) {
            await req.user.logAction(
                'doctor_updated',
                `Updated doctor profile: ${doctor.fullName} — Fields: ${Object.keys(updates).join(', ')}`,
                req.ip
            );
        }

        res.status(200).json({
            success: true,
            message: 'Doctor profile updated.',
            data: { doctor },
        });
    } catch (error) {
        console.error('Update doctor error:', error);
        res.status(500).json({ success: false, message: 'Failed to update doctor profile.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Get doctor verification documents
// @route   GET /api/admin/doctors/:id/documents
// @access  Private (Admin - doctors.view)
// ---------------------------------------------------------------------------
const getDoctorDocuments = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.params.id)
            .select('fullName email documents verificationStatus rejectionReason verifiedAt verifiedBy')
            .populate('verifiedBy', 'fullName email adminRole')
            .lean();

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        res.status(200).json({
            success: true,
            data: {
                doctor: {
                    id: doctor._id,
                    fullName: doctor.fullName,
                    email: doctor.email,
                    documents: doctor.documents,
                    verificationStatus: doctor.verificationStatus,
                    rejectionReason: doctor.rejectionReason,
                    verifiedAt: doctor.verifiedAt,
                    verifiedBy: doctor.verifiedBy,
                },
            },
        });
    } catch (error) {
        console.error('Get doctor documents error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch doctor documents.' });
    }
};

// ---------------------------------------------------------------------------
// @desc    Get all unique specializations (for filters)
// @route   GET /api/admin/doctors/specializations
// @access  Private (Admin - doctors.view)
// ---------------------------------------------------------------------------
const getSpecializations = async (req, res) => {
    try {
        const specializations = await Doctor.distinct('specializations');
        res.status(200).json({
            success: true,
            data: { specializations: specializations.sort() },
        });
    } catch (error) {
        console.error('Get specializations error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch specializations.' });
    }
};

module.exports = {
    getAllDoctors,
    getDoctorById,
    approveDoctor,
    rejectDoctor,
    toggleBlockDoctor,
    updateDoctorByAdmin,
    getDoctorDocuments,
    getSpecializations,
};
