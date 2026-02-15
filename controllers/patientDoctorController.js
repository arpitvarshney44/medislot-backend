const Doctor = require('../models/Doctor');
const Review = require('../models/Review');
const Appointment = require('../models/Appointment');

// @desc    Search doctors with filters
// @route   GET /api/patient/doctors/search
exports.searchDoctors = async (req, res, next) => {
    try {
        const {
            query, specialization, city, availability, consultationType,
            minFee, maxFee, minExperience, gender, language, minRating,
            sortBy, page = 1, limit = 20,
        } = req.query;

        const filter = {
            verificationStatus: 'approved',
            isActive: true,
            isBlocked: { $ne: true },
        };

        // Text search (name, specialization, diseases)
        if (query) {
            filter.$or = [
                { fullName: { $regex: query, $options: 'i' } },
                { specializations: { $regex: query, $options: 'i' } },
                { diseasesTreated: { $regex: query, $options: 'i' } },
                { 'clinics.name': { $regex: query, $options: 'i' } },
            ];
        }

        if (specialization) {
            filter.specializations = { $regex: specialization, $options: 'i' };
        }

        if (city) {
            filter.$or = filter.$or || [];
            filter.$or.push(
                { 'clinics.city': { $regex: city, $options: 'i' } },
                { 'address.city': { $regex: city, $options: 'i' } }
            );
        }

        if (consultationType === 'online') {
            filter['consultationSettings.onlineConsultation'] = true;
        }

        if (minFee || maxFee) {
            filter['consultationFees.online'] = {};
            if (minFee) filter['consultationFees.online'].$gte = parseInt(minFee);
            if (maxFee) filter['consultationFees.online'].$lte = parseInt(maxFee);
        }

        if (minExperience) {
            filter.yearsOfExperience = { $gte: parseInt(minExperience) };
        }

        if (gender) {
            filter.gender = gender;
        }

        if (language) {
            filter.languagesSpoken = { $regex: language, $options: 'i' };
        }

        if (minRating) {
            filter.averageRating = { $gte: parseFloat(minRating) };
        }

        // Availability filter
        if (availability === 'today') {
            const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
            filter[`weeklySchedule.${dayOfWeek}.isAvailable`] = true;
        }

        // Sort
        let sort = {};
        switch (sortBy) {
            case 'rating': sort = { averageRating: -1 }; break;
            case 'experience': sort = { yearsOfExperience: -1 }; break;
            case 'fee_low': sort = { 'consultationFees.online': 1 }; break;
            case 'fee_high': sort = { 'consultationFees.online': -1 }; break;
            case 'reviews': sort = { totalReviews: -1 }; break;
            default: sort = { averageRating: -1, totalReviews: -1 };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await Doctor.countDocuments(filter);

        const doctors = await Doctor.find(filter)
            .select('fullName specializations profilePhoto yearsOfExperience consultationFees averageRating totalReviews languagesSpoken clinics gender consultationSettings weeklySchedule qualifications')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Add availability info for today
        const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
        const enrichedDoctors = doctors.map(doc => ({
            ...doc,
            isAvailableToday: doc.weeklySchedule?.[dayOfWeek]?.isAvailable || false,
            onlineConsultationEnabled: doc.consultationSettings?.onlineConsultation || false,
        }));

        res.status(200).json({
            success: true,
            data: {
                doctors: enrichedDoctors,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit)),
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get doctor public profile
// @route   GET /api/patient/doctors/:doctorId
exports.getDoctorProfile = async (req, res, next) => {
    try {
        const doctor = await Doctor.findOne({
            _id: req.params.doctorId,
            verificationStatus: 'approved',
            isActive: true,
        })
            .select('-password -refreshToken -emailVerificationToken -resetPasswordToken -bankDetails -earningsSummary -loginHistory')
            .lean();

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found' });
        }

        // Get reviews
        const reviews = await Review.find({ doctor: doctor._id, isHidden: { $ne: true } })
            .populate('patient', 'fullName profilePhoto')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        // Rating distribution
        const ratingDistribution = await Review.aggregate([
            { $match: { doctor: doctor._id, isHidden: { $ne: true } } },
            { $group: { _id: '$rating', count: { $sum: 1 } } },
        ]);

        const distribution = {};
        ratingDistribution.forEach(r => { distribution[r._id] = r.count; });

        // Available slots for today
        const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
        const todaySchedule = doctor.weeklySchedule?.[dayOfWeek] || { isAvailable: false };

        res.status(200).json({
            success: true,
            data: {
                doctor,
                reviews,
                ratingDistribution: distribution,
                todaySchedule,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get doctor available slots for a date
// @route   GET /api/patient/doctors/:doctorId/slots/:date
exports.getDoctorSlots = async (req, res, next) => {
    try {
        const { doctorId, date } = req.params;

        const doctor = await Doctor.findOne({
            _id: doctorId,
            verificationStatus: 'approved',
            isActive: true,
        }).lean();

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found' });
        }

        const requestedDate = new Date(date);
        const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][requestedDate.getDay()];
        const schedule = doctor.weeklySchedule?.[dayOfWeek];

        if (!schedule || !schedule.isAvailable) {
            return res.status(200).json({ success: true, data: { slots: [], message: 'Doctor not available on this day' } });
        }

        // Check holidays
        const isHoliday = doctor.holidays?.some(h => {
            const hDate = new Date(h.date);
            return hDate.toDateString() === requestedDate.toDateString();
        });

        if (isHoliday) {
            return res.status(200).json({ success: true, data: { slots: [], message: 'Doctor is on holiday' } });
        }

        // Generate slots
        const slotDuration = doctor.slotConfig?.slotDuration || 15;
        const bufferTime = doctor.slotConfig?.bufferTime || 5;
        const maxPerSlot = doctor.slotConfig?.maxAppointmentsPerSlot || 1;
        const slots = [];

        for (const timeRange of (schedule.slots || [])) {
            let [startH, startM] = timeRange.start.split(':').map(Number);
            const [endH, endM] = timeRange.end.split(':').map(Number);
            const endMinutes = endH * 60 + endM;

            while (startH * 60 + startM + slotDuration <= endMinutes) {
                const slotStart = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
                const slotEndMin = startH * 60 + startM + slotDuration;
                const slotEnd = `${String(Math.floor(slotEndMin / 60)).padStart(2, '0')}:${String(slotEndMin % 60).padStart(2, '0')}`;

                // Check if in break time
                const isBreak = (schedule.breakTimes || []).some(bt => {
                    const [bsH, bsM] = bt.start.split(':').map(Number);
                    const [beH, beM] = bt.end.split(':').map(Number);
                    const slotStartMin = startH * 60 + startM;
                    return slotStartMin >= bsH * 60 + bsM && slotStartMin < beH * 60 + beM;
                });

                if (!isBreak) {
                    // Check existing bookings
                    const bookingCount = await Appointment.countDocuments({
                        doctor: doctorId,
                        appointmentDate: {
                            $gte: new Date(requestedDate.setHours(0, 0, 0, 0)),
                            $lt: new Date(requestedDate.setHours(23, 59, 59, 999)),
                        },
                        'timeSlot.start': slotStart,
                        status: { $in: ['pending', 'confirmed', 'in-progress'] },
                    });

                    // Check blocked slots
                    const isBlocked = doctor.blockedSlots?.some(bs =>
                        new Date(bs.date).toDateString() === requestedDate.toDateString() && bs.start === slotStart
                    );

                    slots.push({
                        start: slotStart,
                        end: slotEnd,
                        isAvailable: !isBlocked && bookingCount < maxPerSlot,
                        bookingCount,
                        maxPerSlot,
                    });
                }

                startM += slotDuration + bufferTime;
                if (startM >= 60) { startH += Math.floor(startM / 60); startM = startM % 60; }
            }
        }

        res.status(200).json({
            success: true,
            data: {
                date,
                dayOfWeek,
                slots,
                slotDuration,
                doctor: {
                    _id: doctor._id,
                    fullName: doctor.fullName,
                    consultationFees: doctor.consultationFees,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};