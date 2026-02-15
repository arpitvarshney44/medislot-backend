const Doctor = require('../models/Doctor');
const mongoose = require('mongoose');

/**
 * @desc    Get doctor's full profile
 * @route   GET /api/doctor/profile
 * @access  Private (Doctor)
 */
const getProfile = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.user._id)
            .select('-password -refreshToken -twoFactorSecret -emailVerificationToken -emailVerificationExpire -resetPasswordToken -resetPasswordExpire -loginHistory')
            .lean();

        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found.',
            });
        }

        res.status(200).json({
            success: true,
            data: { doctor },
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile.',
        });
    }
};

/**
 * @desc    Update doctor's public profile
 * @route   PUT /api/doctor/profile
 * @access  Private (Doctor)
 */
const updateProfile = async (req, res) => {
    try {
        const allowedFields = [
            'fullName', 'title', 'specializations', 'qualifications',
            'aboutDoctor', 'languagesSpoken', 'profilePhoto',
            'diseasesTreated', 'proceduresOffered', 'yearsOfExperience',
        ];

        const updates = {};
        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update.',
            });
        }

        // Validate specializations if provided
        if (updates.specializations && (!Array.isArray(updates.specializations) || updates.specializations.length === 0)) {
            return res.status(400).json({
                success: false,
                message: 'At least one specialization is required.',
            });
        }

        const doctor = await Doctor.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-password -refreshToken -twoFactorSecret -emailVerificationToken -emailVerificationExpire -resetPasswordToken -resetPasswordExpire -loginHistory');

        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor not found.',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully.',
            data: { doctor },
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile.',
        });
    }
};

/**
 * @desc    Update consultation fees
 * @route   PUT /api/doctor/profile/fees
 * @access  Private (Doctor)
 */
const updateConsultationFees = async (req, res) => {
    try {
        const { online, offline } = req.body;

        if (online === undefined && offline === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least one fee to update.',
            });
        }

        const updates = {};
        if (online !== undefined) {
            if (typeof online !== 'number' || online < 0) {
                return res.status(400).json({ success: false, message: 'Online fee must be a non-negative number.' });
            }
            updates['consultationFees.online'] = online;
        }
        if (offline !== undefined) {
            if (typeof offline !== 'number' || offline < 0) {
                return res.status(400).json({ success: false, message: 'Offline fee must be a non-negative number.' });
            }
            updates['consultationFees.offline'] = offline;
        }

        const doctor = await Doctor.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('consultationFees');

        res.status(200).json({
            success: true,
            message: 'Consultation fees updated successfully.',
            data: { consultationFees: doctor.consultationFees },
        });
    } catch (error) {
        console.error('Update fees error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update consultation fees.',
        });
    }
};
/**

 * @desc    Add a new clinic
 * @route   POST /api/doctor/profile/clinics
 * @access  Private (Doctor)
 */
const addClinic = async (req, res) => {
    try {
        const {
            clinicName, address, coordinates, consultationFee,
            contactNumber, workingDays, workingHours,
        } = req.body;

        if (!clinicName || !clinicName.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Clinic name is required.',
            });
        }

        const newClinic = {
            clinicName: clinicName.trim(),
            address: {
                street: address?.street || '',
                city: address?.city || '',
                state: address?.state || '',
                zipCode: address?.zipCode || '',
                country: address?.country || 'India',
            },
            coordinates: {
                latitude: coordinates?.latitude || null,
                longitude: coordinates?.longitude || null,
            },
            consultationFee: consultationFee || 0,
            contactNumber: contactNumber || '',
            workingDays: workingDays || [],
            workingHours: {
                start: workingHours?.start || '09:00',
                end: workingHours?.end || '18:00',
            },
            isActive: true,
        };

        const doctor = await Doctor.findByIdAndUpdate(
            req.user._id,
            { $push: { clinics: newClinic } },
            { new: true, runValidators: true }
        ).select('clinics');

        const addedClinic = doctor.clinics[doctor.clinics.length - 1];

        res.status(201).json({
            success: true,
            message: 'Clinic added successfully.',
            data: { clinic: addedClinic, totalClinics: doctor.clinics.length },
        });
    } catch (error) {
        console.error('Add clinic error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add clinic.',
        });
    }
};

/**
 * @desc    Update a clinic
 * @route   PUT /api/doctor/profile/clinics/:clinicId
 * @access  Private (Doctor)
 */
const updateClinic = async (req, res) => {
    try {
        const { clinicId } = req.params;
        const doctor = await Doctor.findById(req.user._id).select('clinics');

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        const clinic = doctor.clinics.id(clinicId);
        if (!clinic) {
            return res.status(404).json({ success: false, message: 'Clinic not found.' });
        }

        // Update allowed fields
        const allowedFields = [
            'clinicName', 'address', 'coordinates', 'consultationFee',
            'contactNumber', 'workingDays', 'workingHours', 'isActive',
        ];

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                if (field === 'address' && typeof req.body[field] === 'object') {
                    Object.keys(req.body[field]).forEach((key) => {
                        if (clinic.address[key] !== undefined) {
                            clinic.address[key] = req.body[field][key];
                        }
                    });
                } else if (field === 'coordinates' && typeof req.body[field] === 'object') {
                    clinic.coordinates.latitude = req.body[field].latitude ?? clinic.coordinates.latitude;
                    clinic.coordinates.longitude = req.body[field].longitude ?? clinic.coordinates.longitude;
                } else if (field === 'workingHours' && typeof req.body[field] === 'object') {
                    clinic.workingHours.start = req.body[field].start || clinic.workingHours.start;
                    clinic.workingHours.end = req.body[field].end || clinic.workingHours.end;
                } else {
                    clinic[field] = req.body[field];
                }
            }
        });

        await doctor.save();

        res.status(200).json({
            success: true,
            message: 'Clinic updated successfully.',
            data: { clinic },
        });
    } catch (error) {
        console.error('Update clinic error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update clinic.',
        });
    }
};

/**
 * @desc    Delete a clinic
 * @route   DELETE /api/doctor/profile/clinics/:clinicId
 * @access  Private (Doctor)
 */
const deleteClinic = async (req, res) => {
    try {
        const { clinicId } = req.params;

        const doctor = await Doctor.findById(req.user._id).select('clinics');
        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        const clinicIndex = doctor.clinics.findIndex((c) => c._id.toString() === clinicId);
        if (clinicIndex === -1) {
            return res.status(404).json({ success: false, message: 'Clinic not found.' });
        }

        doctor.clinics.splice(clinicIndex, 1);
        await doctor.save();

        res.status(200).json({
            success: true,
            message: 'Clinic deleted successfully.',
            data: { totalClinics: doctor.clinics.length },
        });
    } catch (error) {
        console.error('Delete clinic error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete clinic.',
        });
    }
};

/**
 * @desc    Get all clinics
 * @route   GET /api/doctor/profile/clinics
 * @access  Private (Doctor)
 */
const getClinics = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.user._id).select('clinics').lean();

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        res.status(200).json({
            success: true,
            data: {
                clinics: doctor.clinics,
                totalClinics: doctor.clinics.length,
            },
        });
    } catch (error) {
        console.error('Get clinics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch clinics.',
        });
    }
};

/**
 * @desc    Update privacy controls
 * @route   PUT /api/doctor/profile/privacy
 * @access  Private (Doctor)
 */
const updatePrivacyControls = async (req, res) => {
    try {
        const { showPhoneNumber, isOnlineConsultationEnabled } = req.body;

        const updates = {};
        if (showPhoneNumber !== undefined) updates.showPhoneNumber = showPhoneNumber;
        if (isOnlineConsultationEnabled !== undefined) updates.isOnlineConsultationEnabled = isOnlineConsultationEnabled;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update.',
            });
        }

        const doctor = await Doctor.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true }
        ).select('showPhoneNumber isOnlineConsultationEnabled');

        res.status(200).json({
            success: true,
            message: 'Privacy controls updated successfully.',
            data: {
                showPhoneNumber: doctor.showPhoneNumber,
                isOnlineConsultationEnabled: doctor.isOnlineConsultationEnabled,
            },
        });
    } catch (error) {
        console.error('Update privacy error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update privacy controls.',
        });
    }
};

/**
 * @desc    Update consultation settings
 * @route   PUT /api/doctor/profile/consultation-settings
 * @access  Private (Doctor)
 */
const updateConsultationSettings = async (req, res) => {
    try {
        const {
            isOnlineConsultationEnabled,
            isInstantConsultationEnabled,
            maxDailyAppointments,
        } = req.body;

        const updates = {};
        if (isOnlineConsultationEnabled !== undefined) updates.isOnlineConsultationEnabled = isOnlineConsultationEnabled;
        if (isInstantConsultationEnabled !== undefined) updates.isInstantConsultationEnabled = isInstantConsultationEnabled;
        if (maxDailyAppointments !== undefined) {
            if (typeof maxDailyAppointments !== 'number' || maxDailyAppointments < 1 || maxDailyAppointments > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Max daily appointments must be between 1 and 100.',
                });
            }
            updates.maxDailyAppointments = maxDailyAppointments;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update.',
            });
        }

        const doctor = await Doctor.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true }
        ).select('isOnlineConsultationEnabled isInstantConsultationEnabled maxDailyAppointments');

        res.status(200).json({
            success: true,
            message: 'Consultation settings updated successfully.',
            data: {
                isOnlineConsultationEnabled: doctor.isOnlineConsultationEnabled,
                isInstantConsultationEnabled: doctor.isInstantConsultationEnabled,
                maxDailyAppointments: doctor.maxDailyAppointments,
            },
        });
    } catch (error) {
        console.error('Update consultation settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update consultation settings.',
        });
    }
};

/**
 * @desc    Update bank details for payouts
 * @route   PUT /api/doctor/profile/bank-details
 * @access  Private (Doctor)
 */
const updateBankDetails = async (req, res) => {
    try {
        const { accountHolderName, bankName, accountNumber, ifscCode, upiId } = req.body;

        if (!accountHolderName && !bankName && !accountNumber && !ifscCode && !upiId) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least one bank detail field.',
            });
        }

        const updates = {};
        if (accountHolderName !== undefined) updates['bankDetails.accountHolderName'] = accountHolderName.trim();
        if (bankName !== undefined) updates['bankDetails.bankName'] = bankName.trim();
        if (accountNumber !== undefined) updates['bankDetails.accountNumber'] = accountNumber.trim();
        if (ifscCode !== undefined) updates['bankDetails.ifscCode'] = ifscCode.trim().toUpperCase();
        if (upiId !== undefined) updates['bankDetails.upiId'] = upiId.trim();

        const doctor = await Doctor.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true }
        ).select('bankDetails payoutCycle');

        res.status(200).json({
            success: true,
            message: 'Bank details updated successfully.',
            data: {
                bankDetails: doctor.bankDetails,
                payoutCycle: doctor.payoutCycle,
            },
        });
    } catch (error) {
        console.error('Update bank details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update bank details.',
        });
    }
};

/**
 * @desc    Update payout cycle preference
 * @route   PUT /api/doctor/profile/payout-cycle
 * @access  Private (Doctor)
 */
const updatePayoutCycle = async (req, res) => {
    try {
        const { payoutCycle } = req.body;

        if (!['weekly', 'monthly'].includes(payoutCycle)) {
            return res.status(400).json({
                success: false,
                message: 'Payout cycle must be either "weekly" or "monthly".',
            });
        }

        const doctor = await Doctor.findByIdAndUpdate(
            req.user._id,
            { $set: { payoutCycle } },
            { new: true }
        ).select('payoutCycle');

        res.status(200).json({
            success: true,
            message: 'Payout cycle updated successfully.',
            data: { payoutCycle: doctor.payoutCycle },
        });
    } catch (error) {
        console.error('Update payout cycle error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update payout cycle.',
        });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    updateConsultationFees,
    addClinic,
    updateClinic,
    deleteClinic,
    getClinics,
    updatePrivacyControls,
    updateConsultationSettings,
    updateBankDetails,
    updatePayoutCycle,
};