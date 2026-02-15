const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const Notification = require('../models/Notification');
const Payment = require('../models/Payment');

// @desc    Book appointment
// @route   POST /api/patient/appointments
exports.bookAppointment = async (req, res, next) => {
    try {
        const patientId = req.user._id;
        const {
            doctor: doctorId, appointmentDate, timeSlot, consultationType,
            symptoms, patientNotes, reports, patientName, patientAge, patientGender,
            clinicId,
        } = req.body;

        // Validate doctor
        const doctor = await Doctor.findOne({ _id: doctorId, verificationStatus: 'approved', isActive: true });
        if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found or not available' });

        // Check slot availability
        const existingBookings = await Appointment.countDocuments({
            doctor: doctorId,
            appointmentDate: new Date(appointmentDate),
            'timeSlot.start': timeSlot.start,
            status: { $in: ['pending', 'confirmed', 'in-progress'] },
        });

        const maxPerSlot = doctor.slotConfig?.maxAppointmentsPerSlot || 1;
        if (existingBookings >= maxPerSlot) {
            return res.status(400).json({ success: false, message: 'This slot is no longer available' });
        }

        // Calculate fees
        const fee = consultationType === 'online'
            ? doctor.consultationFees?.online || 0
            : doctor.consultationFees?.offline || 0;
        const platformCommission = Math.round(fee * 0.02 * 100) / 100; // 2%
        const doctorEarning = fee - platformCommission;

        const appointment = await Appointment.create({
            patient: patientId,
            doctor: doctorId,
            appointmentDate: new Date(appointmentDate),
            timeSlot,
            consultationType,
            symptoms,
            patientNotes,
            reports: reports || [],
            patientDetails: { name: patientName, age: patientAge, gender: patientGender },
            clinic: clinicId || null,
            fees: { consultationFee: fee, platformCommission, doctorEarning },
            status: 'pending',
        });

        // Notify doctor
        await Notification.create({
            recipient: doctorId,
            recipientModel: 'Doctor',
            type: 'appointment',
            title: 'New Appointment Request',
            message: `${req.user.fullName} has requested an appointment on ${new Date(appointmentDate).toLocaleDateString()}`,
            data: { appointmentId: appointment._id },
        });

        const populated = await Appointment.findById(appointment._id)
            .populate('doctor', 'fullName specializations profilePhoto consultationFees')
            .lean();

        res.status(201).json({ success: true, message: 'Appointment booked successfully', data: { appointment: populated } });
    } catch (error) {
        next(error);
    }
};

// @desc    Get patient appointments
// @route   GET /api/patient/appointments
exports.getAppointments = async (req, res, next) => {
    try {
        const patientId = req.user._id;
        const { status, page = 1, limit = 20, startDate, endDate } = req.query;

        const filter = { patient: patientId };
        if (status) filter.status = status;
        if (startDate || endDate) {
            filter.appointmentDate = {};
            if (startDate) filter.appointmentDate.$gte = new Date(startDate);
            if (endDate) filter.appointmentDate.$lte = new Date(endDate + 'T23:59:59.999Z');
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Appointment.countDocuments(filter);

        const appointments = await Appointment.find(filter)
            .populate('doctor', 'fullName specializations profilePhoto consultationFees clinics')
            .sort({ appointmentDate: -1, 'timeSlot.start': -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        res.status(200).json({
            success: true,
            data: {
                appointments,
                pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) },
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get appointment details
// @route   GET /api/patient/appointments/:appointmentId
exports.getAppointmentDetails = async (req, res, next) => {
    try {
        const appointment = await Appointment.findOne({
            _id: req.params.appointmentId,
            patient: req.user._id,
        })
            .populate('doctor', 'fullName specializations profilePhoto consultationFees clinics mobileNumber')
            .lean();

        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });

        res.status(200).json({ success: true, data: { appointment } });
    } catch (error) {
        next(error);
    }
};

// @desc    Cancel appointment
// @route   PUT /api/patient/appointments/:appointmentId/cancel
exports.cancelAppointment = async (req, res, next) => {
    try {
        const appointment = await Appointment.findOne({
            _id: req.params.appointmentId,
            patient: req.user._id,
            status: { $in: ['pending', 'confirmed'] },
        });

        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found or cannot be cancelled' });

        appointment.status = 'cancelled';
        appointment.cancelledBy = 'patient';
        appointment.cancellationReason = req.body.reason || 'Cancelled by patient';
        appointment.cancelledAt = new Date();
        await appointment.save();

        // Auto refund if paid
        if (appointment.paymentStatus === 'paid') {
            appointment.paymentStatus = 'refunded';
            await appointment.save();
            // Create refund record
            await Payment.create({
                appointment: appointment._id,
                patient: req.user._id,
                doctor: appointment.doctor,
                amount: appointment.fees?.consultationFee || 0,
                type: 'refund',
                status: 'completed',
                refundReason: 'Patient cancellation',
            });
        }

        // Notify doctor
        await Notification.create({
            recipient: appointment.doctor,
            recipientModel: 'Doctor',
            type: 'cancellation',
            title: 'Appointment Cancelled',
            message: `${req.user.fullName} has cancelled their appointment`,
            data: { appointmentId: appointment._id },
        });

        res.status(200).json({ success: true, message: 'Appointment cancelled successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Reschedule appointment
// @route   PUT /api/patient/appointments/:appointmentId/reschedule
exports.rescheduleAppointment = async (req, res, next) => {
    try {
        const { newDate, newTimeSlot } = req.body;
        const appointment = await Appointment.findOne({
            _id: req.params.appointmentId,
            patient: req.user._id,
            status: { $in: ['pending', 'confirmed'] },
        });

        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found or cannot be rescheduled' });

        // Check new slot availability
        const existingBookings = await Appointment.countDocuments({
            doctor: appointment.doctor,
            appointmentDate: new Date(newDate),
            'timeSlot.start': newTimeSlot.start,
            status: { $in: ['pending', 'confirmed', 'in-progress'] },
            _id: { $ne: appointment._id },
        });

        if (existingBookings > 0) {
            return res.status(400).json({ success: false, message: 'Selected slot is not available' });
        }

        appointment.appointmentDate = new Date(newDate);
        appointment.timeSlot = newTimeSlot;
        appointment.status = 'pending'; // Needs doctor re-confirmation
        appointment.rescheduledBy = 'patient';
        appointment.rescheduledAt = new Date();
        await appointment.save();

        // Notify doctor
        await Notification.create({
            recipient: appointment.doctor,
            recipientModel: 'Doctor',
            type: 'appointment',
            title: 'Appointment Rescheduled',
            message: `${req.user.fullName} has rescheduled their appointment to ${new Date(newDate).toLocaleDateString()}`,
            data: { appointmentId: appointment._id },
        });

        res.status(200).json({ success: true, message: 'Appointment rescheduled successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Join video consultation
// @route   PUT /api/patient/appointments/:appointmentId/join
exports.joinConsultation = async (req, res, next) => {
    try {
        const appointment = await Appointment.findOne({
            _id: req.params.appointmentId,
            patient: req.user._id,
            consultationType: 'online',
            status: { $in: ['confirmed', 'in-progress'] },
        });

        if (!appointment) return res.status(404).json({ success: false, message: 'Consultation not found or not available to join' });

        res.status(200).json({
            success: true,
            data: {
                appointmentId: appointment._id,
                sessionId: appointment.consultation?.sessionId || appointment._id,
                doctorId: appointment.doctor,
            },
        });
    } catch (error) {
        next(error);
    }
};
