const crypto = require('crypto');
const Doctor = require('../models/Doctor');
const { generateTokenPair } = require('../utils/generateToken');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/sendEmail');

const registerDoctor = async (req, res) => {
    try {
        const {
            fullName, email, mobileNumber, password, specializations,
            medicalRegistrationNumber, yearsOfExperience, consultationFees,
            clinicName, address, profilePhoto, languagesSpoken, qualifications, aboutDoctor,
        } = req.body;

        const existingEmail = await Doctor.findOne({ email: email.toLowerCase() });
        if (existingEmail) return res.status(400).json({ success: false, message: 'An account with this email already exists.' });

        const existingMobile = await Doctor.findOne({ mobileNumber });
        if (existingMobile) return res.status(400).json({ success: false, message: 'An account with this mobile number already exists.' });

        const existingReg = await Doctor.findOne({ medicalRegistrationNumber });
        if (existingReg) return res.status(400).json({ success: false, message: 'This medical registration number is already registered.' });

        const doctorData = {
            fullName, email: email.toLowerCase(), mobileNumber, password, specializations,
            medicalRegistrationNumber, yearsOfExperience: parseInt(yearsOfExperience),
            consultationFees: { online: parseFloat(consultationFees.online), offline: parseFloat(consultationFees.offline) },
            profilePhoto: profilePhoto || '', languagesSpoken: languagesSpoken || ['English'],
            qualifications: qualifications || [], aboutDoctor: aboutDoctor || '', verificationStatus: 'pending',
        };

        if (clinicName) {
            doctorData.clinics = [{ clinicName, address: address || {}, isActive: true }];
        }

        const defaultSlots = [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '18:00' }];
        const defaultBreak = [{ start: '13:00', end: '14:00' }];
        doctorData.weeklySchedule = {};
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(day => {
            doctorData.weeklySchedule[day] = { isAvailable: true, slots: defaultSlots, breakTimes: defaultBreak };
        });
        ['saturday', 'sunday'].forEach(day => {
            doctorData.weeklySchedule[day] = { isAvailable: false, slots: [], breakTimes: [] };
        });

        const doctor = new Doctor(doctorData);
        const verificationToken = doctor.generateEmailVerificationToken();
        await doctor.save();
        await sendVerificationEmail(doctor.email, doctor.fullName, verificationToken, 'doctor');
        const { accessToken, refreshToken } = generateTokenPair(doctor._id, 'doctor');
        doctor.refreshToken = refreshToken;
        await doctor.save({ validateBeforeSave: false });

        res.status(201).json({
            success: true,
            message: 'Registration successful! Please verify your email. Your profile will be reviewed by our admin team.',
            data: { doctor: doctor.toSafeObject(), accessToken, refreshToken },
        });
    } catch (error) {
        console.error('Doctor registration error:', error);
        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            return res.status(400).json({ success: false, message: `An account with this ${field} already exists.` });
        }
        res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
    }
};

const loginDoctor = async (req, res) => {
    try {
        const { email, password } = req.body;
        const doctor = await Doctor.findOne({ email: email.toLowerCase() }).select('+password');
        if (!doctor) return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        if (doctor.isBlocked) return res.status(403).json({ success: false, message: 'Your account has been blocked.', reason: doctor.blockReason || '' });
        if (!doctor.isActive) return res.status(403).json({ success: false, message: 'Your account has been deactivated.' });

        const isMatch = await doctor.comparePassword(password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        doctor.recordLogin(req.ip, req.headers['user-agent'] || '', req.headers['x-device-type'] || 'unknown');
        const { accessToken, refreshToken } = generateTokenPair(doctor._id, 'doctor');
        doctor.refreshToken = refreshToken;
        await doctor.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true, message: 'Login successful!',
            data: { doctor: doctor.toSafeObject(), accessToken, refreshToken, isEmailVerified: doctor.isEmailVerified, verificationStatus: doctor.verificationStatus },
        });
    } catch (error) {
        console.error('Doctor login error:', error);
        res.status(500).json({ success: false, message: 'Login failed.' });
    }
};

const verifyDoctorEmail = async (req, res) => {
    try {
        const hashedToken = crypto.createHash('sha256').update(req.body.token).digest('hex');
        const doctor = await Doctor.findOne({ emailVerificationToken: hashedToken, emailVerificationExpire: { $gt: Date.now() } });
        if (!doctor) return res.status(400).json({ success: false, message: 'Invalid or expired verification token.' });
        if (doctor.isEmailVerified) return res.status(400).json({ success: false, message: 'Email already verified.' });
        doctor.isEmailVerified = true; doctor.emailVerificationToken = null; doctor.emailVerificationExpire = null;
        await doctor.save({ validateBeforeSave: false });
        res.status(200).json({ success: true, message: 'Email verified successfully!' });
    } catch (error) { res.status(500).json({ success: false, message: 'Verification failed.' }); }
};

const resendDoctorVerification = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.user._id);
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found.' });
        if (doctor.isEmailVerified) return res.status(400).json({ success: false, message: 'Already verified.' });
        const token = doctor.generateEmailVerificationToken();
        await doctor.save({ validateBeforeSave: false });
        await sendVerificationEmail(doctor.email, doctor.fullName, token, 'doctor');
        res.status(200).json({ success: true, message: 'Verification email sent.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to resend.' }); }
};

const forgotDoctorPassword = async (req, res) => {
    try {
        const doctor = await Doctor.findOne({ email: req.body.email.toLowerCase() });
        if (!doctor) return res.status(200).json({ success: true, message: 'If an account exists, a reset link has been sent.' });
        const resetToken = doctor.generateResetPasswordToken();
        await doctor.save({ validateBeforeSave: false });
        await sendPasswordResetEmail(doctor.email, doctor.fullName, resetToken, 'doctor');
        res.status(200).json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to process request.' }); }
};

const resetDoctorPassword = async (req, res) => {
    try {
        const hashedToken = crypto.createHash('sha256').update(req.body.token).digest('hex');
        const doctor = await Doctor.findOne({ resetPasswordToken: hashedToken, resetPasswordExpire: { $gt: Date.now() } });
        if (!doctor) return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
        doctor.password = req.body.password; doctor.resetPasswordToken = null; doctor.resetPasswordExpire = null; doctor.refreshToken = null;
        await doctor.save();
        res.status(200).json({ success: true, message: 'Password reset successful!' });
    } catch (error) { res.status(500).json({ success: false, message: 'Reset failed.' }); }
};

const changeDoctorPassword = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.user._id).select('+password');
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found.' });
        const isMatch = await doctor.comparePassword(req.body.currentPassword);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
        doctor.password = req.body.newPassword;
        const { accessToken, refreshToken } = generateTokenPair(doctor._id, 'doctor');
        doctor.refreshToken = refreshToken;
        await doctor.save();
        res.status(200).json({ success: true, message: 'Password changed!', data: { accessToken, refreshToken } });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to change password.' }); }
};

const getDoctorProfile = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.user._id);
        if (!doctor) return res.status(404).json({ success: false, message: 'Not found.' });
        res.status(200).json({ success: true, data: { doctor: doctor.toSafeObject() } });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch profile.' }); }
};

const updateDoctorProfile = async (req, res) => {
    try {
        const allowed = ['fullName', 'profilePhoto', 'aboutDoctor', 'qualifications', 'languagesSpoken', 'specializations', 'consultationFees', 'clinics', 'diseasesTreated', 'proceduresOffered', 'showPhoneNumber', 'isOnlineConsultationEnabled', 'isInstantConsultationEnabled', 'maxDailyAppointments', 'slotConfig', 'weeklySchedule', 'bankDetails', 'payoutCycle', 'notificationPreferences'];
        const updates = {};
        allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
        const doctor = await Doctor.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
        if (!doctor) return res.status(404).json({ success: false, message: 'Not found.' });
        res.status(200).json({ success: true, message: 'Profile updated!', data: { doctor: doctor.toSafeObject() } });
    } catch (error) { res.status(500).json({ success: false, message: 'Update failed.' }); }
};

const refreshDoctorToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token required.' });
        const jwt = require('jsonwebtoken');
        let decoded;
        try { decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, { issuer: 'medislot', audience: 'medislot-app' }); }
        catch (e) { return res.status(401).json({ success: false, message: 'Invalid refresh token.' }); }
        const doctor = await Doctor.findById(decoded.id).select('+refreshToken');
        if (!doctor || doctor.refreshToken !== refreshToken) return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
        const tokens = generateTokenPair(doctor._id, 'doctor');
        doctor.refreshToken = tokens.refreshToken;
        await doctor.save({ validateBeforeSave: false });
        res.status(200).json({ success: true, data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } });
    } catch (error) { res.status(500).json({ success: false, message: 'Token refresh failed.' }); }
};

const logoutDoctor = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.user._id).select('+refreshToken');
        if (doctor) { doctor.refreshToken = null; doctor.fcmToken = null; await doctor.save({ validateBeforeSave: false }); }
        res.status(200).json({ success: true, message: 'Logged out successfully.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Logout failed.' }); }
};

const uploadDocuments = async (req, res) => {
    try {
        const { medicalDegreeCertificate, medicalCouncilRegistration, governmentId } = req.body;
        const doctor = await Doctor.findById(req.user._id);
        if (!doctor) return res.status(404).json({ success: false, message: 'Not found.' });
        if (medicalDegreeCertificate) doctor.documents.medicalDegreeCertificate = { fileUrl: medicalDegreeCertificate, uploadedAt: new Date(), verified: false };
        if (medicalCouncilRegistration) doctor.documents.medicalCouncilRegistration = { fileUrl: medicalCouncilRegistration, uploadedAt: new Date(), verified: false };
        if (governmentId) doctor.documents.governmentId = { fileUrl: governmentId, uploadedAt: new Date(), verified: false };
        if (doctor.verificationStatus === 'rejected') { doctor.verificationStatus = 'resubmitted'; doctor.rejectionReason = ''; }
        await doctor.save({ validateBeforeSave: false });
        res.status(200).json({ success: true, message: 'Documents uploaded. Admin will review.', data: { documents: doctor.documents, verificationStatus: doctor.verificationStatus } });
    } catch (error) { res.status(500).json({ success: false, message: 'Upload failed.' }); }
};

const updateDoctorFCMToken = async (req, res) => {
    try {
        if (!req.body.fcmToken) return res.status(400).json({ success: false, message: 'FCM token required.' });
        await Doctor.findByIdAndUpdate(req.user._id, { fcmToken: req.body.fcmToken });
        res.status(200).json({ success: true, message: 'FCM token updated.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed.' }); }
};

module.exports = {
    registerDoctor, loginDoctor, verifyDoctorEmail, resendDoctorVerification,
    forgotDoctorPassword, resetDoctorPassword, changeDoctorPassword,
    getDoctorProfile, updateDoctorProfile, refreshDoctorToken, logoutDoctor,
    uploadDocuments, updateDoctorFCMToken,
};
