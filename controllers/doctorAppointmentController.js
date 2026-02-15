const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const Doctor = require('../models/Doctor');

/**
 * @desc    Get appointments list with filters
 * @route   GET /api/doctor/appointments
 * @access  Private (Doctor)
 */
const getAppointments = async (req, res) => {
    try {
        const doctorId = req.user._id;
        const {
            status,
            consultationType,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 20,
            sortBy = 'appointmentDate',
            sortOrder = 'desc',
            view, // 'today', 'upcoming', 'past', 'cancelled', 'pending'
        } = req.query;

        const query = { doctor: doctorId };
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // View-based filters
        if (view === 'today') {
            query.appointmentDate = { $gte: today, $lt: tomorrow };
            query.status = { $in: ['pending', 'confirmed', 'ongoing', 'completed'] };
        } else if (view === 'upcoming') {
            query.appointmentDate = { $gte: today };
            query.status = { $in: ['pending', 'confirmed'] };
        } else if (view === 'past') {
            query.status = 'completed';
        } else if (view === 'cancelled') {
            query.status = 'cancelled';
        } else if (view === 'pending') {
            query.status = 'pending';
        }

        // Additional filters
        if (status && !view) {
            query.status = Array.isArray(status) ? { $in: status } : status;
        }
        if (consultationType) {
            query.consultationType = consultationType;
        }
        if (startDate || endDate) {
            query.appointmentDate = query.appointmentDate || {};
            if (startDate) query.appointmentDate.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.appointmentDate.$lte = end;
            }
        }

        // Search by patient name
        let patientIds = null;
        if (search) {
            const User = require('../models/User');
            const patients = await User.find({
                fullName: { $regex: search, $options: 'i' },
            }).select('_id');
            patientIds = patients.map((p) => p._id);
            query.patient = { $in: patientIds };
        }

        // Sort configuration
        const sortConfig = {};
        if (sortBy === 'appointmentDate') {
            sortConfig.appointmentDate = sortOrder === 'asc' ? 1 : -1;
            sortConfig['timeSlot.start'] = sortOrder === 'asc' ? 1 : -1;
        } else {
            sortConfig[sortBy] = sortOrder === 'asc' ? 1 : -1;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [appointments, total] = await Promise.all([
            Appointment.find(query)
                .populate('patient', 'fullName email mobileNumber profilePhoto gender dateOfBirth')
                .populate('payment', 'status amount breakdown')
                .sort(sortConfig)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Appointment.countDocuments(query),
        ]);

        res.status(200).json({
            success: true,
            data: {
                appointments,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    hasMore: skip + appointments.length < total,
                },
            },
        });
    } catch (error) {
        console.error('Get appointments error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch appointments.' });
    }
};

/**
 * @desc    Get single appointment details
 * @route   GET /api/doctor/appointments/:appointmentId
 * @access  Private (Doctor)
 */
const getAppointmentDetails = async (req, res) => {
    try {
        const { appointmentId } = req.params;

        const appointment = await Appointment.findOne({
            _id: appointmentId,
            doctor: req.user._id,
        })
            .populate('patient', 'fullName email mobileNumber profilePhoto gender dateOfBirth address')
            .populate('payment', 'status amount paymentMethod breakdown paidAt refund invoiceNumber')
            .populate('review', 'rating comment doctorReply createdAt')
            .lean();

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found.',
            });
        }

        // Get patient's appointment history with this doctor
        const patientHistory = await Appointment.find({
            doctor: req.user._id,
            patient: appointment.patient._id,
            _id: { $ne: appointmentId },
            status: 'completed',
        })
            .select('appointmentDate consultationType diagnosis')
            .sort({ appointmentDate: -1 })
            .limit(5)
            .lean();

        // Get prescriptions for this appointment
        const Prescription = require('../models/Prescription');
        const prescriptions = await Prescription.find({
            appointment: appointmentId,
            doctor: req.user._id,
        })
            .select('prescriptionNumber diagnosis.primary medicines status createdAt')
            .lean();

        res.status(200).json({
            success: true,
            data: {
                appointment,
                patientHistory,
                prescriptions,
            },
        });
    } catch (error) {
        console.error('Get appointment details error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch appointment details.' });
    }
};

/**
 * @desc    Accept an appointment request
 * @route   PUT /api/doctor/appointments/:appointmentId/accept
 * @access  Private (Doctor)
 */
const acceptAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.params;

        const appointment = await Appointment.findOne({
            _id: appointmentId,
            doctor: req.user._id,
            status: 'pending',
        }).populate('patient', 'fullName email fcmToken');

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Pending appointment not found.',
            });
        }

        appointment.status = 'confirmed';
        await appointment.save();

        // Send notification to patient
        await Notification.create({
            recipient: appointment.patient._id,
            recipientModel: 'User',
            title: 'Appointment Confirmed',
            message: `Your appointment with Dr. ${req.user.fullName} on ${appointment.appointmentDate.toLocaleDateString()} at ${appointment.timeSlot.start} has been confirmed.`,
            type: 'appointment_confirmed',
            data: {
                appointmentId: appointment._id,
                doctorId: req.user._id,
                appointmentDate: appointment.appointmentDate,
                timeSlot: appointment.timeSlot,
            },
        });

        res.status(200).json({
            success: true,
            message: 'Appointment accepted successfully.',
            data: { appointment },
        });
    } catch (error) {
        console.error('Accept appointment error:', error);
        res.status(500).json({ success: false, message: 'Failed to accept appointment.' });
    }
};

/**
 * @desc    Reject an appointment request
 * @route   PUT /api/doctor/appointments/:appointmentId/reject
 * @access  Private (Doctor)
 */
const rejectAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required.',
            });
        }

        const appointment = await Appointment.findOne({
            _id: appointmentId,
            doctor: req.user._id,
            status: 'pending',
        }).populate('patient', 'fullName email fcmToken');

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Pending appointment not found.',
            });
        }

        appointment.status = 'cancelled';
        appointment.cancellationReason = reason.trim();
        appointment.cancelledBy = 'doctor';
        appointment.cancelledAt = new Date();
        await appointment.save();

        // Send notification to patient
        await Notification.create({
            recipient: appointment.patient._id,
            recipientModel: 'User',
            title: 'Appointment Rejected',
            message: `Your appointment request with Dr. ${req.user.fullName} has been declined. Reason: ${reason.trim()}`,
            type: 'appointment_cancelled',
            data: {
                appointmentId: appointment._id,
                doctorId: req.user._id,
                reason: reason.trim(),
            },
        });

        // Handle refund if payment was made
        if (appointment.payment) {
            const payment = await Payment.findById(appointment.payment);
            if (payment && payment.status === 'completed') {
                payment.refund = {
                    amount: payment.amount,
                    reason: `Appointment rejected by doctor: ${reason.trim()}`,
                    refundedAt: new Date(),
                    type: 'full',
                };
                payment.status = 'refunded';
                await payment.save();
            }
        }

        res.status(200).json({
            success: true,
            message: 'Appointment rejected.',
            data: { appointment },
        });
    } catch (error) {
        console.error('Reject appointment error:', error);
        res.status(500).json({ success: false, message: 'Failed to reject appointment.' });
    }
};

/**
 * @desc    Cancel an appointment
 * @route   PUT /api/doctor/appointments/:appointmentId/cancel
 * @access  Private (Doctor)
 */
const cancelAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Cancellation reason is required.',
            });
        }

        const appointment = await Appointment.findOne({
            _id: appointmentId,
            doctor: req.user._id,
            status: { $in: ['pending', 'confirmed'] },
        }).populate('patient', 'fullName email fcmToken');

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Active appointment not found.',
            });
        }

        appointment.status = 'cancelled';
        appointment.cancellationReason = reason.trim();
        appointment.cancelledBy = 'doctor';
        appointment.cancelledAt = new Date();
        await appointment.save();

        // Update doctor's cancellation rate
        const totalAppointments = await Appointment.countDocuments({ doctor: req.user._id });
        const cancelledByDoctor = await Appointment.countDocuments({
            doctor: req.user._id,
            cancelledBy: 'doctor',
        });
        const cancellationRate = totalAppointments > 0 ? (cancelledByDoctor / totalAppointments) * 100 : 0;

        await Doctor.findByIdAndUpdate(req.user._id, {
            $set: { 'ratingSummary.cancellationRate': Math.round(cancellationRate * 100) / 100 },
        });

        // Send notification to patient
        await Notification.create({
            recipient: appointment.patient._id,
            recipientModel: 'User',
            title: 'Appointment Cancelled',
            message: `Your appointment with Dr. ${req.user.fullName} on ${appointment.appointmentDate.toLocaleDateString()} has been cancelled. Reason: ${reason.trim()}`,
            type: 'appointment_cancelled',
            data: {
                appointmentId: appointment._id,
                doctorId: req.user._id,
                reason: reason.trim(),
            },
        });

        // Handle refund
        if (appointment.payment) {
            const payment = await Payment.findById(appointment.payment);
            if (payment && payment.status === 'completed') {
                payment.refund = {
                    amount: payment.amount,
                    reason: `Appointment cancelled by doctor: ${reason.trim()}`,
                    refundedAt: new Date(),
                    type: 'full',
                };
                payment.status = 'refunded';
                await payment.save();
            }
        }

        res.status(200).json({
            success: true,
            message: 'Appointment cancelled.',
            data: { appointment },
        });
    } catch (error) {
        console.error('Cancel appointment error:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel appointment.' });
    }
};

/**
 * @desc    Reschedule an appointment
 * @route   PUT /api/doctor/appointments/:appointmentId/reschedule
 * @access  Private (Doctor)
 */
const rescheduleAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { newDate, newTimeSlot, reason } = req.body;

        if (!newDate || !newTimeSlot || !newTimeSlot.start || !newTimeSlot.end) {
            return res.status(400).json({
                success: false,
                message: 'New date and time slot are required.',
            });
        }

        const appointment = await Appointment.findOne({
            _id: appointmentId,
            doctor: req.user._id,
            status: { $in: ['pending', 'confirmed'] },
        }).populate('patient', 'fullName email fcmToken');

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Active appointment not found.',
            });
        }

        const rescheduledDate = new Date(newDate);
        rescheduledDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (rescheduledDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Cannot reschedule to a past date.',
            });
        }

        // Check if the new slot is available
        const nextDay = new Date(rescheduledDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const conflicting = await Appointment.findOne({
            doctor: req.user._id,
            appointmentDate: { $gte: rescheduledDate, $lt: nextDay },
            'timeSlot.start': newTimeSlot.start,
            'timeSlot.end': newTimeSlot.end,
            status: { $in: ['pending', 'confirmed', 'ongoing'] },
            _id: { $ne: appointmentId },
        });

        if (conflicting) {
            return res.status(400).json({
                success: false,
                message: 'The selected time slot is already booked.',
            });
        }

        // Update appointment
        const oldDate = appointment.appointmentDate;
        const oldSlot = { ...appointment.timeSlot };

        appointment.appointmentDate = rescheduledDate;
        appointment.timeSlot = newTimeSlot;
        appointment.status = 'confirmed';
        appointment.rescheduledFrom = appointment._id;
        await appointment.save();

        // Send notification to patient
        await Notification.create({
            recipient: appointment.patient._id,
            recipientModel: 'User',
            title: 'Appointment Rescheduled',
            message: `Your appointment with Dr. ${req.user.fullName} has been rescheduled from ${oldDate.toLocaleDateString()} ${oldSlot.start} to ${rescheduledDate.toLocaleDateString()} ${newTimeSlot.start}.${reason ? ` Reason: ${reason}` : ''}`,
            type: 'appointment_confirmed',
            data: {
                appointmentId: appointment._id,
                doctorId: req.user._id,
                oldDate,
                oldSlot,
                newDate: rescheduledDate,
                newTimeSlot,
            },
        });

        res.status(200).json({
            success: true,
            message: 'Appointment rescheduled successfully.',
            data: { appointment },
        });
    } catch (error) {
        console.error('Reschedule appointment error:', error);
        res.status(500).json({ success: false, message: 'Failed to reschedule appointment.' });
    }
};

/**
 * @desc    Mark appointment as completed
 * @route   PUT /api/doctor/appointments/:appointmentId/complete
 * @access  Private (Doctor)
 */
const completeAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { diagnosis, notes } = req.body;

        const appointment = await Appointment.findOne({
            _id: appointmentId,
            doctor: req.user._id,
            status: { $in: ['confirmed', 'ongoing'] },
        });

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Active appointment not found.',
            });
        }

        appointment.status = 'completed';
        if (diagnosis) appointment.diagnosis = diagnosis;
        if (notes) appointment.notes = notes;
        await appointment.save();

        // Update doctor's total appointments count
        await Doctor.findByIdAndUpdate(req.user._id, {
            $inc: { 'ratingSummary.totalAppointments': 1 },
        });

        // Update payment payout status
        if (appointment.payment) {
            await Payment.findByIdAndUpdate(appointment.payment, {
                $set: { 'payout.status': 'pending' },
            });
        }

        res.status(200).json({
            success: true,
            message: 'Appointment marked as completed.',
            data: { appointment },
        });
    } catch (error) {
        console.error('Complete appointment error:', error);
        res.status(500).json({ success: false, message: 'Failed to complete appointment.' });
    }
};

/**
 * @desc    Start video consultation (mark as ongoing)
 * @route   PUT /api/doctor/appointments/:appointmentId/start-consultation
 * @access  Private (Doctor)
 */
const startConsultation = async (req, res) => {
    try {
        const { appointmentId } = req.params;

        const appointment = await Appointment.findOne({
            _id: appointmentId,
            doctor: req.user._id,
            status: 'confirmed',
            consultationType: 'online',
        });

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Confirmed online appointment not found.',
            });
        }

        // Generate a unique session ID for the video call
        const sessionId = `ms_${appointmentId}_${Date.now()}`;

        appointment.status = 'ongoing';
        appointment.videoSession.sessionId = sessionId;
        appointment.videoSession.startedAt = new Date();
        await appointment.save();

        // Notify patient
        await Notification.create({
            recipient: appointment.patient,
            recipientModel: 'User',
            title: 'Consultation Started',
            message: `Dr. ${req.user.fullName} has started your video consultation. Join now!`,
            type: 'appointment_confirmed',
            data: {
                appointmentId: appointment._id,
                sessionId,
                action: 'join_call',
            },
        });

        res.status(200).json({
            success: true,
            message: 'Consultation started.',
            data: {
                appointment,
                sessionId,
            },
        });
    } catch (error) {
        console.error('Start consultation error:', error);
        res.status(500).json({ success: false, message: 'Failed to start consultation.' });
    }
};

/**
 * @desc    End video consultation
 * @route   PUT /api/doctor/appointments/:appointmentId/end-consultation
 * @access  Private (Doctor)
 */
const endConsultation = async (req, res) => {
    try {
        const { appointmentId } = req.params;

        const appointment = await Appointment.findOne({
            _id: appointmentId,
            doctor: req.user._id,
            status: 'ongoing',
        });

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Ongoing appointment not found.',
            });
        }

        appointment.videoSession.endedAt = new Date();
        if (appointment.videoSession.startedAt) {
            appointment.videoSession.duration = Math.round(
                (appointment.videoSession.endedAt - appointment.videoSession.startedAt) / 60000
            );
        }
        // Don't auto-complete — doctor may still need to write prescription
        await appointment.save();

        res.status(200).json({
            success: true,
            message: 'Consultation ended.',
            data: {
                appointment,
                duration: appointment.videoSession.duration,
            },
        });
    } catch (error) {
        console.error('End consultation error:', error);
        res.status(500).json({ success: false, message: 'Failed to end consultation.' });
    }
};

module.exports = {
    getAppointments,
    getAppointmentDetails,
    acceptAppointment,
    rejectAppointment,
    cancelAppointment,
    rescheduleAppointment,
    completeAppointment,
    startConsultation,
    endConsultation,
};