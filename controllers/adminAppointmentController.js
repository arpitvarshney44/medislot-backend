const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');

// ============================================================================
// @desc    Get all appointments (with filters, search, pagination)
// @route   GET /api/admin/appointments
// ============================================================================
exports.getAllAppointments = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, status, consultationType, search, startDate, endDate, doctorId, patientId } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (consultationType) filter.consultationType = consultationType;
        if (doctorId) filter.doctor = doctorId;
        if (patientId) filter.patient = patientId;
        if (startDate || endDate) {
            filter.appointmentDate = {};
            if (startDate) filter.appointmentDate.$gte = new Date(startDate);
            if (endDate) filter.appointmentDate.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Appointment.countDocuments(filter);

        const appointments = await Appointment.find(filter)
            .populate('patient', 'fullName email mobileNumber profilePhoto')
            .populate('doctor', 'fullName email mobileNumber specializations profilePhoto')
            .sort({ appointmentDate: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            data: {
                appointments,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalAppointments: total,
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
// @desc    Get single appointment details
// @route   GET /api/admin/appointments/:id
// ============================================================================
exports.getAppointmentById = async (req, res, next) => {
    try {
        const appointment = await Appointment.findById(req.params.id)
            .populate('patient', 'fullName email mobileNumber profilePhoto address dateOfBirth gender')
            .populate('doctor', 'fullName email mobileNumber specializations profilePhoto yearsOfExperience consultationFees')
            .populate('payment')
            .populate('review');

        if (!appointment) return next(new ErrorResponse('Appointment not found', 404));

        res.status(200).json({ success: true, data: { appointment } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Get appointment overview stats
// @route   GET /api/admin/appointments/stats
// ============================================================================
exports.getAppointmentStats = async (req, res, next) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const [total, todayCount, monthCount, byStatus, byType, cancellationRate] = await Promise.all([
            Appointment.countDocuments(),
            Appointment.countDocuments({ appointmentDate: { $gte: today, $lt: tomorrow } }),
            Appointment.countDocuments({ appointmentDate: { $gte: monthStart } }),
            Appointment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
            Appointment.aggregate([{ $group: { _id: '$consultationType', count: { $sum: 1 } } }]),
            Appointment.aggregate([
                { $group: { _id: null, total: { $sum: 1 }, cancelled: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'no_show']] }, 1, 0] } } } },
            ]),
        ]);

        const statusMap = {};
        byStatus.forEach((s) => { statusMap[s._id] = s.count; });

        const typeMap = {};
        byType.forEach((t) => { typeMap[t._id] = t.count; });

        const rate = cancellationRate[0] ? ((cancellationRate[0].cancelled / cancellationRate[0].total) * 100).toFixed(1) : 0;

        res.status(200).json({
            success: true,
            data: {
                total,
                today: todayCount,
                thisMonth: monthCount,
                byStatus: statusMap,
                byType: typeMap,
                cancellationRate: parseFloat(rate),
            },
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Force cancel an appointment
// @route   PUT /api/admin/appointments/:id/cancel
// ============================================================================
exports.cancelAppointment = async (req, res, next) => {
    try {
        const { reason } = req.body;
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) return next(new ErrorResponse('Appointment not found', 404));

        if (['completed', 'cancelled'].includes(appointment.status)) {
            return next(new ErrorResponse(`Cannot cancel a ${appointment.status} appointment`, 400));
        }

        appointment.status = 'cancelled';
        appointment.cancellationReason = reason || 'Cancelled by admin';
        appointment.cancelledBy = 'admin';
        appointment.cancelledAt = new Date();
        appointment.adminNotes = `Force cancelled by admin: ${req.user.fullName}`;
        await appointment.save();

        if (req.user.logAction) {
            await req.user.logAction('cancel_appointment', `Cancelled appointment ${appointment._id}`);
        }

        res.status(200).json({ success: true, message: 'Appointment cancelled successfully', data: { appointment } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Reschedule an appointment
// @route   PUT /api/admin/appointments/:id/reschedule
// ============================================================================
exports.rescheduleAppointment = async (req, res, next) => {
    try {
        const { appointmentDate, timeSlot } = req.body;
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) return next(new ErrorResponse('Appointment not found', 404));

        if (['completed', 'cancelled'].includes(appointment.status)) {
            return next(new ErrorResponse(`Cannot reschedule a ${appointment.status} appointment`, 400));
        }

        appointment.appointmentDate = new Date(appointmentDate);
        if (timeSlot) appointment.timeSlot = timeSlot;
        appointment.status = 'rescheduled';
        appointment.adminNotes = `Rescheduled by admin: ${req.user.fullName}`;
        await appointment.save();

        if (req.user.logAction) {
            await req.user.logAction('reschedule_appointment', `Rescheduled appointment ${appointment._id}`);
        }

        res.status(200).json({ success: true, message: 'Appointment rescheduled', data: { appointment } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Assign alternate doctor
// @route   PUT /api/admin/appointments/:id/assign-doctor
// ============================================================================
exports.assignAlternateDoctor = async (req, res, next) => {
    try {
        const { doctorId } = req.body;
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) return next(new ErrorResponse('Appointment not found', 404));

        const doctor = await Doctor.findById(doctorId);
        if (!doctor) return next(new ErrorResponse('Doctor not found', 404));
        if (doctor.verificationStatus !== 'approved') return next(new ErrorResponse('Doctor is not approved', 400));

        appointment.assignedAlternateDoctor = appointment.doctor;
        appointment.doctor = doctorId;
        appointment.adminNotes = `Doctor reassigned by admin: ${req.user.fullName}. Previous: ${appointment.assignedAlternateDoctor}`;
        await appointment.save();

        if (req.user.logAction) {
            await req.user.logAction('assign_doctor', `Reassigned doctor for appointment ${appointment._id}`);
        }

        res.status(200).json({ success: true, message: 'Alternate doctor assigned', data: { appointment } });
    } catch (err) {
        next(err);
    }
};
