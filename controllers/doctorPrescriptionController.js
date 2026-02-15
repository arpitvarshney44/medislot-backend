const Prescription = require('../models/Prescription');
const Appointment = require('../models/Appointment');
const Notification = require('../models/Notification');

/**
 * @desc    Create a new prescription
 * @route   POST /api/doctor/prescriptions
 * @access  Private (Doctor)
 */
const createPrescription = async (req, res) => {
    try {
        const {
            appointmentId,
            diagnosis,
            medicines,
            labTests,
            advice,
            dietaryInstructions,
            lifestyleRecommendations,
            vitals,
            followUp,
        } = req.body;

        // Validate required fields
        if (!appointmentId) {
            return res.status(400).json({ success: false, message: 'Appointment ID is required.' });
        }
        if (!diagnosis || !diagnosis.primary) {
            return res.status(400).json({ success: false, message: 'Primary diagnosis is required.' });
        }
        if (!medicines || !Array.isArray(medicines) || medicines.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one medicine is required.' });
        }

        // Validate each medicine
        for (let i = 0; i < medicines.length; i++) {
            const med = medicines[i];
            if (!med.name || !med.dosage || !med.frequency || !med.duration) {
                return res.status(400).json({
                    success: false,
                    message: `Medicine #${i + 1}: name, dosage, frequency, and duration are required.`,
                });
            }
        }

        // Verify appointment belongs to this doctor
        const appointment = await Appointment.findOne({
            _id: appointmentId,
            doctor: req.user._id,
        }).populate('patient', 'fullName email fcmToken');

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found or does not belong to you.',
            });
        }

        // Check if prescription already exists for this appointment
        const existingPrescription = await Prescription.findOne({
            appointment: appointmentId,
            doctor: req.user._id,
        });

        if (existingPrescription) {
            return res.status(400).json({
                success: false,
                message: 'A prescription already exists for this appointment. Use update instead.',
                data: { prescriptionId: existingPrescription._id },
            });
        }

        // Create prescription
        const prescription = await Prescription.create({
            appointment: appointmentId,
            doctor: req.user._id,
            patient: appointment.patient._id,
            diagnosis: {
                primary: diagnosis.primary.trim(),
                secondary: diagnosis.secondary || [],
                icdCodes: diagnosis.icdCodes || [],
                notes: diagnosis.notes || '',
            },
            medicines: medicines.map((med) => ({
                name: med.name.trim(),
                dosage: med.dosage.trim(),
                frequency: med.frequency.trim(),
                duration: med.duration.trim(),
                timing: med.timing || 'after_meal',
                route: med.route || 'oral',
                instructions: med.instructions || '',
            })),
            labTests: (labTests || []).map((test) => ({
                testName: test.testName.trim(),
                urgency: test.urgency || 'routine',
                instructions: test.instructions || '',
                fasting: test.fasting || false,
            })),
            advice: advice || '',
            dietaryInstructions: dietaryInstructions || '',
            lifestyleRecommendations: lifestyleRecommendations || '',
            vitals: vitals || {},
            followUp: followUp || { required: false },
            status: 'draft',
        });

        // Update appointment with prescription reference
        appointment.prescription = prescription._id.toString();
        if (diagnosis.primary) appointment.diagnosis = diagnosis.primary;
        await appointment.save();

        res.status(201).json({
            success: true,
            message: 'Prescription created successfully.',
            data: { prescription },
        });
    } catch (error) {
        console.error('Create prescription error:', error);
        res.status(500).json({ success: false, message: 'Failed to create prescription.' });
    }
};
/**
 
* @desc    Update a prescription
 * @route   PUT /api/doctor/prescriptions/:prescriptionId
 * @access  Private (Doctor)
 */
const updatePrescription = async (req, res) => {
    try {
        const { prescriptionId } = req.params;

        const prescription = await Prescription.findOne({
            _id: prescriptionId,
            doctor: req.user._id,
        });

        if (!prescription) {
            return res.status(404).json({ success: false, message: 'Prescription not found.' });
        }

        if (prescription.status === 'sent' || prescription.status === 'viewed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot edit a prescription that has already been sent to the patient.',
            });
        }

        const allowedFields = [
            'diagnosis', 'medicines', 'labTests', 'advice',
            'dietaryInstructions', 'lifestyleRecommendations', 'vitals', 'followUp',
        ];

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                prescription[field] = req.body[field];
            }
        });

        // Track edit history
        prescription.editHistory.push({
            editedAt: new Date(),
            editedBy: req.user._id,
            changes: `Updated: ${Object.keys(req.body).filter((k) => allowedFields.includes(k)).join(', ')}`,
        });

        await prescription.save();

        res.status(200).json({
            success: true,
            message: 'Prescription updated successfully.',
            data: { prescription },
        });
    } catch (error) {
        console.error('Update prescription error:', error);
        res.status(500).json({ success: false, message: 'Failed to update prescription.' });
    }
};

/**
 * @desc    Finalize and send prescription to patient
 * @route   PUT /api/doctor/prescriptions/:prescriptionId/send
 * @access  Private (Doctor)
 */
const sendPrescription = async (req, res) => {
    try {
        const { prescriptionId } = req.params;

        const prescription = await Prescription.findOne({
            _id: prescriptionId,
            doctor: req.user._id,
        }).populate('patient', 'fullName email fcmToken');

        if (!prescription) {
            return res.status(404).json({ success: false, message: 'Prescription not found.' });
        }

        if (prescription.status === 'sent' || prescription.status === 'viewed') {
            return res.status(400).json({
                success: false,
                message: 'Prescription has already been sent.',
            });
        }

        // Validate prescription has required data
        if (!prescription.diagnosis.primary) {
            return res.status(400).json({ success: false, message: 'Diagnosis is required before sending.' });
        }
        if (!prescription.medicines || prescription.medicines.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one medicine is required before sending.' });
        }

        prescription.status = 'sent';
        prescription.sentAt = new Date();
        await prescription.save();

        // Send notification to patient
        await Notification.create({
            recipient: prescription.patient._id,
            recipientModel: 'User',
            title: 'Prescription Available',
            message: `Dr. ${req.user.fullName} has sent you a prescription (${prescription.prescriptionNumber}). View it in your appointments.`,
            type: 'custom',
            data: {
                prescriptionId: prescription._id,
                prescriptionNumber: prescription.prescriptionNumber,
                appointmentId: prescription.appointment,
            },
        });

        res.status(200).json({
            success: true,
            message: 'Prescription sent to patient successfully.',
            data: { prescription },
        });
    } catch (error) {
        console.error('Send prescription error:', error);
        res.status(500).json({ success: false, message: 'Failed to send prescription.' });
    }
};

/**
 * @desc    Get prescription details
 * @route   GET /api/doctor/prescriptions/:prescriptionId
 * @access  Private (Doctor)
 */
const getPrescription = async (req, res) => {
    try {
        const { prescriptionId } = req.params;

        const prescription = await Prescription.findOne({
            _id: prescriptionId,
            doctor: req.user._id,
        })
            .populate('patient', 'fullName email mobileNumber profilePhoto gender dateOfBirth')
            .populate('appointment', 'appointmentDate timeSlot consultationType status')
            .lean();

        if (!prescription) {
            return res.status(404).json({ success: false, message: 'Prescription not found.' });
        }

        res.status(200).json({
            success: true,
            data: { prescription },
        });
    } catch (error) {
        console.error('Get prescription error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch prescription.' });
    }
};

/**
 * @desc    Get all prescriptions (with filters)
 * @route   GET /api/doctor/prescriptions
 * @access  Private (Doctor)
 */
const getPrescriptions = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            patientId,
            startDate,
            endDate,
            search,
        } = req.query;

        const query = { doctor: req.user._id };

        if (status) query.status = status;
        if (patientId) query.patient = patientId;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }
        if (search) {
            query.$or = [
                { prescriptionNumber: { $regex: search, $options: 'i' } },
                { 'diagnosis.primary': { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [prescriptions, total] = await Promise.all([
            Prescription.find(query)
                .populate('patient', 'fullName email mobileNumber profilePhoto')
                .populate('appointment', 'appointmentDate timeSlot consultationType')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Prescription.countDocuments(query),
        ]);

        res.status(200).json({
            success: true,
            data: {
                prescriptions,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    hasMore: skip + prescriptions.length < total,
                },
            },
        });
    } catch (error) {
        console.error('Get prescriptions error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch prescriptions.' });
    }
};

/**
 * @desc    Get prescriptions for a specific patient
 * @route   GET /api/doctor/prescriptions/patient/:patientId
 * @access  Private (Doctor)
 */
const getPatientPrescriptions = async (req, res) => {
    try {
        const { patientId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [prescriptions, total] = await Promise.all([
            Prescription.find({
                doctor: req.user._id,
                patient: patientId,
            })
                .populate('appointment', 'appointmentDate timeSlot consultationType')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Prescription.countDocuments({
                doctor: req.user._id,
                patient: patientId,
            }),
        ]);

        res.status(200).json({
            success: true,
            data: {
                prescriptions,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / parseInt(limit)),
                },
            },
        });
    } catch (error) {
        console.error('Get patient prescriptions error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch patient prescriptions.' });
    }
};

/**
 * @desc    Delete a draft prescription
 * @route   DELETE /api/doctor/prescriptions/:prescriptionId
 * @access  Private (Doctor)
 */
const deletePrescription = async (req, res) => {
    try {
        const { prescriptionId } = req.params;

        const prescription = await Prescription.findOne({
            _id: prescriptionId,
            doctor: req.user._id,
            status: 'draft',
        });

        if (!prescription) {
            return res.status(404).json({
                success: false,
                message: 'Draft prescription not found. Only draft prescriptions can be deleted.',
            });
        }

        // Remove prescription reference from appointment
        await Appointment.findByIdAndUpdate(prescription.appointment, {
            $set: { prescription: '' },
        });

        await Prescription.findByIdAndDelete(prescriptionId);

        res.status(200).json({
            success: true,
            message: 'Prescription deleted.',
        });
    } catch (error) {
        console.error('Delete prescription error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete prescription.' });
    }
};

module.exports = {
    createPrescription,
    updatePrescription,
    sendPrescription,
    getPrescription,
    getPrescriptions,
    getPatientPrescriptions,
    deletePrescription,
};