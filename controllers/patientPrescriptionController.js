const Prescription = require('../models/Prescription');

// @desc    Get patient prescriptions
// @route   GET /api/patient/prescriptions
exports.getPrescriptions = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const filter = { patient: req.user._id, status: 'sent' };

        if (search) {
            filter.$or = [
                { diagnosis: { $regex: search, $options: 'i' } },
                { prescriptionNumber: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Prescription.countDocuments(filter);

        const prescriptions = await Prescription.find(filter)
            .populate('doctor', 'fullName specializations profilePhoto')
            .populate('appointment', 'appointmentDate consultationType')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        res.status(200).json({
            success: true,
            data: {
                prescriptions,
                pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) },
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get single prescription
// @route   GET /api/patient/prescriptions/:prescriptionId
exports.getPrescription = async (req, res, next) => {
    try {
        const prescription = await Prescription.findOne({
            _id: req.params.prescriptionId,
            patient: req.user._id,
        })
            .populate('doctor', 'fullName specializations profilePhoto qualifications medicalRegistrationNumber')
            .populate('appointment', 'appointmentDate consultationType timeSlot')
            .lean();

        if (!prescription) return res.status(404).json({ success: false, message: 'Prescription not found' });

        res.status(200).json({ success: true, data: { prescription } });
    } catch (error) {
        next(error);
    }
};
