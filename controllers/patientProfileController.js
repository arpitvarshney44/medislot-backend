const User = require('../models/User');

// @desc    Get full patient profile
// @route   GET /api/patient/profile
exports.getProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id).select('-password -refreshToken -emailVerificationToken -resetPasswordToken').lean();
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.status(200).json({ success: true, data: { user } });
    } catch (error) { next(error); }
};

// @desc    Update patient profile
// @route   PUT /api/patient/profile
exports.updateProfile = async (req, res, next) => {
    try {
        const { fullName, dateOfBirth, gender, address, profilePhoto } = req.body;
        const update = {};
        if (fullName) update.fullName = fullName.trim();
        if (dateOfBirth) update.dateOfBirth = dateOfBirth;
        if (gender) update.gender = gender;
        if (address) update.address = address;
        if (profilePhoto !== undefined) update.profilePhoto = profilePhoto;

        const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true })
            .select('-password -refreshToken -emailVerificationToken -resetPasswordToken');

        res.status(200).json({ success: true, message: 'Profile updated', data: { user } });
    } catch (error) { next(error); }
};

// @desc    Add family member
// @route   POST /api/patient/profile/family
exports.addFamilyMember = async (req, res, next) => {
    try {
        const { name, age, gender, relation } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

        const user = await User.findById(req.user._id);
        user.familyMembers.push({ name: name.trim(), age, gender, relation });
        await user.save();

        res.status(201).json({ success: true, message: 'Family member added', data: { familyMembers: user.familyMembers } });
    } catch (error) { next(error); }
};

// @desc    Remove family member
// @route   DELETE /api/patient/profile/family/:memberId
exports.removeFamilyMember = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        user.familyMembers = user.familyMembers.filter(m => m._id.toString() !== req.params.memberId);
        await user.save();

        res.status(200).json({ success: true, message: 'Family member removed', data: { familyMembers: user.familyMembers } });
    } catch (error) { next(error); }
};

// @desc    Upload medical record
// @route   POST /api/patient/profile/medical-records
exports.uploadMedicalRecord = async (req, res, next) => {
    try {
        const { title, fileUrl, fileType, description } = req.body;
        if (!title || !fileUrl) return res.status(400).json({ success: false, message: 'Title and file URL are required' });

        const user = await User.findById(req.user._id);
        user.medicalRecords.push({ title: title.trim(), fileUrl, fileType: fileType || 'document', description: description || '' });
        await user.save();

        res.status(201).json({ success: true, message: 'Medical record uploaded', data: { medicalRecords: user.medicalRecords } });
    } catch (error) { next(error); }
};

// @desc    Delete medical record
// @route   DELETE /api/patient/profile/medical-records/:recordId
exports.deleteMedicalRecord = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        user.medicalRecords = user.medicalRecords.filter(r => r._id.toString() !== req.params.recordId);
        await user.save();

        res.status(200).json({ success: true, message: 'Medical record deleted', data: { medicalRecords: user.medicalRecords } });
    } catch (error) { next(error); }
};

// @desc    Update preferences
// @route   PUT /api/patient/profile/preferences
exports.updatePreferences = async (req, res, next) => {
    try {
        const { language, notificationsEnabled, emailNotifications, smsNotifications, pushNotifications, reminderTimeBefore } = req.body;
        const update = {};
        if (language) update['preferences.language'] = language;
        if (typeof notificationsEnabled === 'boolean') update['preferences.notificationsEnabled'] = notificationsEnabled;
        if (typeof emailNotifications === 'boolean') update['preferences.emailNotifications'] = emailNotifications;
        if (typeof smsNotifications === 'boolean') update['preferences.smsNotifications'] = smsNotifications;
        if (typeof pushNotifications === 'boolean') update['preferences.pushNotifications'] = pushNotifications;
        if (reminderTimeBefore) update['preferences.reminderTimeBefore'] = reminderTimeBefore;

        const user = await User.findByIdAndUpdate(req.user._id, update, { new: true })
            .select('-password -refreshToken');

        res.status(200).json({ success: true, message: 'Preferences updated', data: { preferences: user.preferences } });
    } catch (error) { next(error); }
};
