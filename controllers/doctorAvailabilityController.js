const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');

/**
 * @desc    Get current availability settings
 * @route   GET /api/doctor/availability
 * @access  Private (Doctor)
 */
const getAvailability = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.user._id)
            .select('weeklySchedule customDateOverrides holidays slotConfig')
            .lean();

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        res.status(200).json({
            success: true,
            data: {
                weeklySchedule: doctor.weeklySchedule,
                customDateOverrides: doctor.customDateOverrides,
                holidays: doctor.holidays,
                slotConfig: doctor.slotConfig,
            },
        });
    } catch (error) {
        console.error('Get availability error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch availability.' });
    }
};

/**
 * @desc    Update weekly schedule
 * @route   PUT /api/doctor/availability/weekly-schedule
 * @access  Private (Doctor)
 */
const updateWeeklySchedule = async (req, res) => {
    try {
        const { weeklySchedule } = req.body;

        if (!weeklySchedule || typeof weeklySchedule !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Weekly schedule data is required.',
            });
        }

        const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const updates = {};

        for (const day of validDays) {
            if (weeklySchedule[day] !== undefined) {
                const dayData = weeklySchedule[day];

                // Validate slots format
                if (dayData.slots && Array.isArray(dayData.slots)) {
                    for (const slot of dayData.slots) {
                        if (!slot.start || !slot.end) {
                            return res.status(400).json({
                                success: false,
                                message: `Invalid slot format for ${day}. Each slot must have "start" and "end" times.`,
                            });
                        }
                        // Validate time format (HH:MM)
                        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
                        if (!timeRegex.test(slot.start) || !timeRegex.test(slot.end)) {
                            return res.status(400).json({
                                success: false,
                                message: `Invalid time format for ${day}. Use HH:MM format (e.g., "09:00").`,
                            });
                        }
                        // Validate start < end
                        if (slot.start >= slot.end) {
                            return res.status(400).json({
                                success: false,
                                message: `Start time must be before end time for ${day}.`,
                            });
                        }
                    }
                }

                // Validate break times format
                if (dayData.breakTimes && Array.isArray(dayData.breakTimes)) {
                    for (const brk of dayData.breakTimes) {
                        if (!brk.start || !brk.end) {
                            return res.status(400).json({
                                success: false,
                                message: `Invalid break time format for ${day}.`,
                            });
                        }
                        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
                        if (!timeRegex.test(brk.start) || !timeRegex.test(brk.end)) {
                            return res.status(400).json({
                                success: false,
                                message: `Invalid break time format for ${day}. Use HH:MM format.`,
                            });
                        }
                    }
                }

                updates[`weeklySchedule.${day}`] = {
                    isAvailable: dayData.isAvailable !== undefined ? dayData.isAvailable : true,
                    slots: dayData.slots || [],
                    breakTimes: dayData.breakTimes || [],
                };
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid day schedules provided.',
            });
        }

        const doctor = await Doctor.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true }
        ).select('weeklySchedule');

        res.status(200).json({
            success: true,
            message: 'Weekly schedule updated successfully.',
            data: { weeklySchedule: doctor.weeklySchedule },
        });
    } catch (error) {
        console.error('Update weekly schedule error:', error);
        res.status(500).json({ success: false, message: 'Failed to update weekly schedule.' });
    }
};

/**
 * @desc    Update slot configuration
 * @route   PUT /api/doctor/availability/slot-config
 * @access  Private (Doctor)
 */
const updateSlotConfig = async (req, res) => {
    try {
        const { slotDuration, bufferTime, maxAppointmentsPerSlot } = req.body;

        const updates = {};

        if (slotDuration !== undefined) {
            if (![10, 15, 30].includes(slotDuration)) {
                return res.status(400).json({
                    success: false,
                    message: 'Slot duration must be 10, 15, or 30 minutes.',
                });
            }
            updates['slotConfig.slotDuration'] = slotDuration;
        }

        if (bufferTime !== undefined) {
            if (typeof bufferTime !== 'number' || bufferTime < 0 || bufferTime > 60) {
                return res.status(400).json({
                    success: false,
                    message: 'Buffer time must be between 0 and 60 minutes.',
                });
            }
            updates['slotConfig.bufferTime'] = bufferTime;
        }

        if (maxAppointmentsPerSlot !== undefined) {
            if (typeof maxAppointmentsPerSlot !== 'number' || maxAppointmentsPerSlot < 1 || maxAppointmentsPerSlot > 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Max appointments per slot must be between 1 and 10.',
                });
            }
            updates['slotConfig.maxAppointmentsPerSlot'] = maxAppointmentsPerSlot;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid slot configuration fields provided.',
            });
        }

        const doctor = await Doctor.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true }
        ).select('slotConfig');

        res.status(200).json({
            success: true,
            message: 'Slot configuration updated successfully.',
            data: { slotConfig: doctor.slotConfig },
        });
    } catch (error) {
        console.error('Update slot config error:', error);
        res.status(500).json({ success: false, message: 'Failed to update slot configuration.' });
    }
};
/**

 * @desc    Add custom date override
 * @route   POST /api/doctor/availability/custom-date
 * @access  Private (Doctor)
 */
const addCustomDateOverride = async (req, res) => {
    try {
        const { date, isAvailable, reason, slots } = req.body;

        if (!date) {
            return res.status(400).json({ success: false, message: 'Date is required.' });
        }

        const overrideDate = new Date(date);
        overrideDate.setHours(0, 0, 0, 0);

        // Cannot set overrides for past dates
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (overrideDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Cannot set overrides for past dates.',
            });
        }

        // Check if override already exists for this date
        const doctor = await Doctor.findById(req.user._id).select('customDateOverrides');
        const existingIndex = doctor.customDateOverrides.findIndex(
            (o) => new Date(o.date).toDateString() === overrideDate.toDateString()
        );

        if (existingIndex !== -1) {
            // Update existing override
            doctor.customDateOverrides[existingIndex] = {
                date: overrideDate,
                isAvailable: isAvailable !== undefined ? isAvailable : false,
                reason: reason || '',
                slots: slots || [],
            };
        } else {
            // Add new override
            doctor.customDateOverrides.push({
                date: overrideDate,
                isAvailable: isAvailable !== undefined ? isAvailable : false,
                reason: reason || '',
                slots: slots || [],
            });
        }

        await doctor.save();

        res.status(201).json({
            success: true,
            message: existingIndex !== -1 ? 'Date override updated.' : 'Date override added.',
            data: { customDateOverrides: doctor.customDateOverrides },
        });
    } catch (error) {
        console.error('Add custom date override error:', error);
        res.status(500).json({ success: false, message: 'Failed to add date override.' });
    }
};

/**
 * @desc    Remove custom date override
 * @route   DELETE /api/doctor/availability/custom-date/:overrideId
 * @access  Private (Doctor)
 */
const removeCustomDateOverride = async (req, res) => {
    try {
        const { overrideId } = req.params;

        const doctor = await Doctor.findByIdAndUpdate(
            req.user._id,
            { $pull: { customDateOverrides: { _id: overrideId } } },
            { new: true }
        ).select('customDateOverrides');

        res.status(200).json({
            success: true,
            message: 'Date override removed.',
            data: { customDateOverrides: doctor.customDateOverrides },
        });
    } catch (error) {
        console.error('Remove custom date override error:', error);
        res.status(500).json({ success: false, message: 'Failed to remove date override.' });
    }
};

/**
 * @desc    Add holiday / leave
 * @route   POST /api/doctor/availability/holidays
 * @access  Private (Doctor)
 */
const addHoliday = async (req, res) => {
    try {
        const { date, reason } = req.body;

        if (!date) {
            return res.status(400).json({ success: false, message: 'Date is required.' });
        }

        const holidayDate = new Date(date);
        holidayDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (holidayDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Cannot add holidays for past dates.',
            });
        }

        // Check for duplicate
        const doctor = await Doctor.findById(req.user._id).select('holidays');
        const exists = doctor.holidays.some(
            (h) => new Date(h.date).toDateString() === holidayDate.toDateString()
        );

        if (exists) {
            return res.status(400).json({
                success: false,
                message: 'Holiday already exists for this date.',
            });
        }

        doctor.holidays.push({
            date: holidayDate,
            reason: reason || 'Holiday',
        });

        // Sort holidays by date
        doctor.holidays.sort((a, b) => new Date(a.date) - new Date(b.date));

        await doctor.save();

        // Cancel any pending/confirmed appointments on this date
        const nextDay = new Date(holidayDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const affectedAppointments = await Appointment.updateMany(
            {
                doctor: req.user._id,
                appointmentDate: { $gte: holidayDate, $lt: nextDay },
                status: { $in: ['pending', 'confirmed'] },
            },
            {
                $set: {
                    status: 'cancelled',
                    cancellationReason: `Doctor on leave: ${reason || 'Holiday'}`,
                    cancelledBy: 'doctor',
                    cancelledAt: new Date(),
                },
            }
        );

        res.status(201).json({
            success: true,
            message: 'Holiday added successfully.',
            data: {
                holidays: doctor.holidays,
                cancelledAppointments: affectedAppointments.modifiedCount,
            },
        });
    } catch (error) {
        console.error('Add holiday error:', error);
        res.status(500).json({ success: false, message: 'Failed to add holiday.' });
    }
};

/**
 * @desc    Remove holiday
 * @route   DELETE /api/doctor/availability/holidays/:holidayId
 * @access  Private (Doctor)
 */
const removeHoliday = async (req, res) => {
    try {
        const { holidayId } = req.params;

        const doctor = await Doctor.findByIdAndUpdate(
            req.user._id,
            { $pull: { holidays: { _id: holidayId } } },
            { new: true }
        ).select('holidays');

        res.status(200).json({
            success: true,
            message: 'Holiday removed.',
            data: { holidays: doctor.holidays },
        });
    } catch (error) {
        console.error('Remove holiday error:', error);
        res.status(500).json({ success: false, message: 'Failed to remove holiday.' });
    }
};

/**
 * @desc    Get available slots for a specific date
 * @route   GET /api/doctor/availability/slots/:date
 * @access  Private (Doctor) / Public (for booking)
 */
const getAvailableSlots = async (req, res) => {
    try {
        const { date } = req.params;
        const doctorId = req.params.doctorId || req.user._id;

        const requestedDate = new Date(date);
        requestedDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (requestedDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Cannot view slots for past dates.',
            });
        }

        const doctor = await Doctor.findById(doctorId)
            .select('weeklySchedule customDateOverrides holidays slotConfig maxDailyAppointments')
            .lean();

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found.' });
        }

        // Check if it's a holiday
        const isHoliday = doctor.holidays.some(
            (h) => new Date(h.date).toDateString() === requestedDate.toDateString()
        );

        if (isHoliday) {
            return res.status(200).json({
                success: true,
                data: {
                    date: requestedDate,
                    isAvailable: false,
                    reason: 'Holiday',
                    slots: [],
                },
            });
        }

        // Check for custom date override
        const customOverride = doctor.customDateOverrides.find(
            (o) => new Date(o.date).toDateString() === requestedDate.toDateString()
        );

        let daySchedule;
        if (customOverride) {
            if (!customOverride.isAvailable) {
                return res.status(200).json({
                    success: true,
                    data: {
                        date: requestedDate,
                        isAvailable: false,
                        reason: customOverride.reason || 'Unavailable',
                        slots: [],
                    },
                });
            }
            daySchedule = { isAvailable: true, slots: customOverride.slots, breakTimes: [] };
        } else {
            // Get weekly schedule for this day
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = dayNames[requestedDate.getDay()];
            daySchedule = doctor.weeklySchedule[dayName];
        }

        if (!daySchedule || !daySchedule.isAvailable || !daySchedule.slots || daySchedule.slots.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    date: requestedDate,
                    isAvailable: false,
                    reason: 'Not available on this day',
                    slots: [],
                },
            });
        }

        // Generate individual time slots based on slot config
        const { slotDuration, bufferTime } = doctor.slotConfig;
        const generatedSlots = [];

        for (const timeRange of daySchedule.slots) {
            const [startHour, startMin] = timeRange.start.split(':').map(Number);
            const [endHour, endMin] = timeRange.end.split(':').map(Number);

            let currentMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;

            while (currentMinutes + slotDuration <= endMinutes) {
                const slotStart = `${Math.floor(currentMinutes / 60).toString().padStart(2, '0')}:${(currentMinutes % 60).toString().padStart(2, '0')}`;
                const slotEndMin = currentMinutes + slotDuration;
                const slotEnd = `${Math.floor(slotEndMin / 60).toString().padStart(2, '0')}:${(slotEndMin % 60).toString().padStart(2, '0')}`;

                // Check if slot falls within break time
                let isBreak = false;
                if (daySchedule.breakTimes) {
                    for (const brk of daySchedule.breakTimes) {
                        const [bStartH, bStartM] = brk.start.split(':').map(Number);
                        const [bEndH, bEndM] = brk.end.split(':').map(Number);
                        const breakStart = bStartH * 60 + bStartM;
                        const breakEnd = bEndH * 60 + bEndM;

                        if (currentMinutes < breakEnd && slotEndMin > breakStart) {
                            isBreak = true;
                            break;
                        }
                    }
                }

                if (!isBreak) {
                    generatedSlots.push({
                        start: slotStart,
                        end: slotEnd,
                        isAvailable: true,
                    });
                }

                currentMinutes = slotEndMin + bufferTime;
            }
        }

        // Check existing bookings for this date
        const nextDay = new Date(requestedDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const existingBookings = await Appointment.find({
            doctor: doctorId,
            appointmentDate: { $gte: requestedDate, $lt: nextDay },
            status: { $in: ['pending', 'confirmed', 'ongoing'] },
        })
            .select('timeSlot')
            .lean();

        // Mark booked slots as unavailable
        const maxPerSlot = doctor.slotConfig.maxAppointmentsPerSlot || 1;

        for (const slot of generatedSlots) {
            const bookingsForSlot = existingBookings.filter(
                (b) => b.timeSlot.start === slot.start && b.timeSlot.end === slot.end
            );
            if (bookingsForSlot.length >= maxPerSlot) {
                slot.isAvailable = false;
                slot.bookedCount = bookingsForSlot.length;
            } else {
                slot.bookedCount = bookingsForSlot.length;
                slot.remainingSlots = maxPerSlot - bookingsForSlot.length;
            }
        }

        // If today, filter out past time slots
        if (requestedDate.toDateString() === today.toDateString()) {
            const now = new Date();
            const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

            for (const slot of generatedSlots) {
                const [slotH, slotM] = slot.start.split(':').map(Number);
                if (slotH * 60 + slotM <= currentTimeMinutes) {
                    slot.isAvailable = false;
                    slot.isPast = true;
                }
            }
        }

        // Check daily appointment limit
        const totalBookedToday = existingBookings.length;
        const dailyLimitReached = totalBookedToday >= doctor.maxDailyAppointments;

        res.status(200).json({
            success: true,
            data: {
                date: requestedDate,
                isAvailable: true,
                slotConfig: doctor.slotConfig,
                totalSlots: generatedSlots.length,
                availableSlots: generatedSlots.filter((s) => s.isAvailable).length,
                bookedSlots: generatedSlots.filter((s) => !s.isAvailable && !s.isPast).length,
                dailyLimitReached,
                totalBookedToday,
                maxDailyAppointments: doctor.maxDailyAppointments,
                slots: generatedSlots,
            },
        });
    } catch (error) {
        console.error('Get available slots error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate available slots.' });
    }
};

/**
 * @desc    Manually block/unblock a specific slot
 * @route   PUT /api/doctor/availability/block-slot
 * @access  Private (Doctor)
 */
const toggleSlotBlock = async (req, res) => {
    try {
        const { date, start, end, block, reason } = req.body;

        if (!date || !start || !end || block === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Date, start, end, and block status are required.',
            });
        }

        const slotDate = new Date(date);
        slotDate.setHours(0, 0, 0, 0);

        const doctor = await Doctor.findById(req.user._id).select('customDateOverrides weeklySchedule');

        // Find or create custom date override for this date
        let override = doctor.customDateOverrides.find(
            (o) => new Date(o.date).toDateString() === slotDate.toDateString()
        );

        if (block) {
            // To block a slot, we add a custom override that marks specific slots as unavailable
            // For simplicity, we'll cancel any existing appointment in this slot
            const nextDay = new Date(slotDate);
            nextDay.setDate(nextDay.getDate() + 1);

            const affectedAppointments = await Appointment.updateMany(
                {
                    doctor: req.user._id,
                    appointmentDate: { $gte: slotDate, $lt: nextDay },
                    'timeSlot.start': start,
                    'timeSlot.end': end,
                    status: { $in: ['pending', 'confirmed'] },
                },
                {
                    $set: {
                        status: 'cancelled',
                        cancellationReason: reason || 'Slot blocked by doctor',
                        cancelledBy: 'doctor',
                        cancelledAt: new Date(),
                    },
                }
            );

            res.status(200).json({
                success: true,
                message: `Slot ${start}-${end} blocked on ${slotDate.toDateString()}.`,
                data: { cancelledAppointments: affectedAppointments.modifiedCount },
            });
        } else {
            res.status(200).json({
                success: true,
                message: `Slot ${start}-${end} unblocked on ${slotDate.toDateString()}.`,
            });
        }
    } catch (error) {
        console.error('Toggle slot block error:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle slot block.' });
    }
};

module.exports = {
    getAvailability,
    updateWeeklySchedule,
    updateSlotConfig,
    addCustomDateOverride,
    removeCustomDateOverride,
    addHoliday,
    removeHoliday,
    getAvailableSlots,
    toggleSlotBlock,
};