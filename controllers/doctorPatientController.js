const Appointment = require('../models/Appointment');
const Prescription = require('../models/Prescription');
const PatientNote = require('../models/PatientNote');
const User = require('../models/User');
const mongoose = require('mongoose');

/**
 * @desc    Get list of all consulted patients
 * @route   GET /api/doctor/patients
 * @access  Private (Doctor)
 */
const getPatients = async (req, res) => {
    try {
        const doctorId = req.user._id;
        const { page = 1, limit = 20, search, filter } = req.query;

        // Get all unique patient IDs who have had appointments with this doctor
        const matchStage = {
            doctor: new mongoose.Types.ObjectId(doctorId),
            status: { $in: ['completed', 'confirmed', 'ongoing', 'pending'] },
        };

        const pipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: '$patient',
                    totalAppointments: { $sum: 1 },
                    completedAppointments: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                    },
                    lastVisit: { $max: '$appointmentDate' },
                    firstVisit: { $min: '$appointmentDate' },
                    consultationTypes: { $addToSet: '$consultationType' },
                },
            },
            { $sort: { lastVisit: -1 } },
        ];

        // Filter: new (first visit in last 30 days) vs returning
        if (filter === 'new') {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            pipeline.push({
                $match: { firstVisit: { $gte: thirtyDaysAgo } },
            });
        } else if (filter === 'returning') {
            pipeline.push({
                $match: { totalAppointments: { $gt: 1 } },
            });
        }

        // Get total count before pagination
        const countPipeline = [...pipeline, { $count: 'total' }];
        const countResult = await Appointment.aggregate(countPipeline);
        const total = countResult[0]?.total || 0;

        // Add pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: parseInt(limit) });

        // Lookup patient details
        pipeline.push({
            $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'patientInfo',
            },
        });
        pipeline.push({ $unwind: '$patientInfo' });

        // Search filter
        if (search) {
            pipeline.push({
                $match: {
                    $or: [
                        { 'patientInfo.fullName': { $regex: search, $options: 'i' } },
                        { 'patientInfo.email': { $regex: search, $options: 'i' } },
                        { 'patientInfo.mobileNumber': { $regex: search, $options: 'i' } },
                    ],
                },
            });
        }

        // Project final shape
        pipeline.push({
            $project: {
                _id: 0,
                patientId: '$_id',
                fullName: '$patientInfo.fullName',
                email: '$patientInfo.email',
                mobileNumber: '$patientInfo.mobileNumber',
                profilePhoto: '$patientInfo.profilePhoto',
                gender: '$patientInfo.gender',
                dateOfBirth: '$patientInfo.dateOfBirth',
                totalAppointments: 1,
                completedAppointments: 1,
                lastVisit: 1,
                firstVisit: 1,
                consultationTypes: 1,
                isReturning: { $gt: ['$totalAppointments', 1] },
            },
        });

        const patients = await Appointment.aggregate(pipeline);

        // Get notes count for each patient
        const patientIds = patients.map((p) => p.patientId);
        const notesCounts = await PatientNote.aggregate([
            {
                $match: {
                    doctor: new mongoose.Types.ObjectId(doctorId),
                    patient: { $in: patientIds },
                    isArchived: false,
                },
            },
            {
                $group: {
                    _id: '$patient',
                    count: { $sum: 1 },
                    tags: { $addToSet: '$tags' },
                },
            },
        ]);

        const notesMap = {};
        notesCounts.forEach((n) => {
            notesMap[n._id.toString()] = {
                count: n.count,
                tags: [...new Set(n.tags.flat())],
            };
        });

        // Attach notes info to patients
        const enrichedPatients = patients.map((p) => ({
            ...p,
            notes: notesMap[p.patientId.toString()] || { count: 0, tags: [] },
        }));

        res.status(200).json({
            success: true,
            data: {
                patients: enrichedPatients,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    hasMore: skip + patients.length < total,
                },
            },
        });
    } catch (error) {
        console.error('Get patients error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch patients.' });
    }
};
/**
 
* @desc    Get detailed patient profile (from doctor's perspective)
 * @route   GET /api/doctor/patients/:patientId
 * @access  Private (Doctor)
 */
const getPatientProfile = async (req, res) => {
    try {
        const { patientId } = req.params;
        const doctorId = req.user._id;

        // Verify this patient has had appointments with this doctor
        const hasRelationship = await Appointment.findOne({
            doctor: doctorId,
            patient: patientId,
        });

        if (!hasRelationship) {
            return res.status(403).json({
                success: false,
                message: 'You can only view profiles of patients you have consulted.',
            });
        }

        // Get patient basic info
        const patient = await User.findById(patientId)
            .select('fullName email mobileNumber profilePhoto gender dateOfBirth address')
            .lean();

        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient not found.' });
        }

        // Get appointment history with this doctor
        const appointments = await Appointment.find({
            doctor: doctorId,
            patient: patientId,
        })
            .select('appointmentDate timeSlot consultationType status diagnosis symptoms notes attachments')
            .sort({ appointmentDate: -1 })
            .limit(50)
            .lean();

        // Get prescriptions
        const prescriptions = await Prescription.find({
            doctor: doctorId,
            patient: patientId,
            status: { $in: ['finalized', 'sent', 'viewed'] },
        })
            .select('prescriptionNumber diagnosis.primary medicines status createdAt followUp')
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        // Get doctor's private notes for this patient
        const notes = await PatientNote.find({
            doctor: doctorId,
            patient: patientId,
            isArchived: false,
        })
            .sort({ isPinned: -1, createdAt: -1 })
            .lean();

        // Stats
        const stats = {
            totalAppointments: appointments.length,
            completedAppointments: appointments.filter((a) => a.status === 'completed').length,
            cancelledAppointments: appointments.filter((a) => a.status === 'cancelled').length,
            totalPrescriptions: prescriptions.length,
            firstVisit: appointments.length > 0 ? appointments[appointments.length - 1].appointmentDate : null,
            lastVisit: appointments.length > 0 ? appointments[0].appointmentDate : null,
        };

        res.status(200).json({
            success: true,
            data: {
                patient,
                appointments,
                prescriptions,
                notes,
                stats,
            },
        });
    } catch (error) {
        console.error('Get patient profile error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch patient profile.' });
    }
};

/**
 * @desc    Add a private note for a patient
 * @route   POST /api/doctor/patients/:patientId/notes
 * @access  Private (Doctor)
 */
const addPatientNote = async (req, res) => {
    try {
        const { patientId } = req.params;
        const { note, tags, priority, appointmentId, reminder } = req.body;

        if (!note || !note.trim()) {
            return res.status(400).json({ success: false, message: 'Note content is required.' });
        }

        const patientNote = await PatientNote.create({
            doctor: req.user._id,
            patient: patientId,
            appointment: appointmentId || null,
            note: note.trim(),
            tags: tags || [],
            priority: priority || 'low',
            reminder: reminder || { enabled: false },
        });

        res.status(201).json({
            success: true,
            message: 'Note added successfully.',
            data: { note: patientNote },
        });
    } catch (error) {
        console.error('Add patient note error:', error);
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'A note already exists for this appointment. Use update instead.',
            });
        }
        res.status(500).json({ success: false, message: 'Failed to add note.' });
    }
};

/**
 * @desc    Update a patient note
 * @route   PUT /api/doctor/patients/notes/:noteId
 * @access  Private (Doctor)
 */
const updatePatientNote = async (req, res) => {
    try {
        const { noteId } = req.params;
        const { note, tags, priority, reminder, isPinned, isArchived } = req.body;

        const patientNote = await PatientNote.findOne({
            _id: noteId,
            doctor: req.user._id,
        });

        if (!patientNote) {
            return res.status(404).json({ success: false, message: 'Note not found.' });
        }

        if (note !== undefined) patientNote.note = note.trim();
        if (tags !== undefined) patientNote.tags = tags;
        if (priority !== undefined) patientNote.priority = priority;
        if (reminder !== undefined) patientNote.reminder = reminder;
        if (isPinned !== undefined) patientNote.isPinned = isPinned;
        if (isArchived !== undefined) patientNote.isArchived = isArchived;

        await patientNote.save();

        res.status(200).json({
            success: true,
            message: 'Note updated successfully.',
            data: { note: patientNote },
        });
    } catch (error) {
        console.error('Update patient note error:', error);
        res.status(500).json({ success: false, message: 'Failed to update note.' });
    }
};

/**
 * @desc    Delete a patient note
 * @route   DELETE /api/doctor/patients/notes/:noteId
 * @access  Private (Doctor)
 */
const deletePatientNote = async (req, res) => {
    try {
        const { noteId } = req.params;

        const result = await PatientNote.findOneAndDelete({
            _id: noteId,
            doctor: req.user._id,
        });

        if (!result) {
            return res.status(404).json({ success: false, message: 'Note not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Note deleted.',
        });
    } catch (error) {
        console.error('Delete patient note error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete note.' });
    }
};

module.exports = {
    getPatients,
    getPatientProfile,
    addPatientNote,
    updatePatientNote,
    deletePatientNote,
};