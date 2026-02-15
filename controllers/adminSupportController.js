const SupportTicket = require('../models/SupportTicket');
const ErrorResponse = require('../utils/errorResponse');

// ============================================================================
// @desc    Get all support tickets
// @route   GET /api/admin/support
// ============================================================================
exports.getAllTickets = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, status, priority, category, search } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        if (category) filter.category = category;
        if (search) {
            filter.$or = [
                { ticketNumber: { $regex: search, $options: 'i' } },
                { subject: { $regex: search, $options: 'i' } },
                { submitterName: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await SupportTicket.countDocuments(filter);

        const tickets = await SupportTicket.find(filter)
            .populate('assignedTo', 'fullName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            data: {
                tickets,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalTickets: total,
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
// @desc    Get ticket by ID
// @route   GET /api/admin/support/:id
// ============================================================================
exports.getTicketById = async (req, res, next) => {
    try {
        const ticket = await SupportTicket.findById(req.params.id)
            .populate('assignedTo', 'fullName email')
            .populate('resolvedBy', 'fullName')
            .populate('relatedAppointment')
            .populate('relatedPayment');

        if (!ticket) return next(new ErrorResponse('Ticket not found', 404));
        res.status(200).json({ success: true, data: { ticket } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Get support stats
// @route   GET /api/admin/support/stats
// ============================================================================
exports.getTicketStats = async (req, res, next) => {
    try {
        const [total, byStatus, byPriority, byCategory] = await Promise.all([
            SupportTicket.countDocuments(),
            SupportTicket.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
            SupportTicket.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
            SupportTicket.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const openToday = await SupportTicket.countDocuments({ status: 'open', createdAt: { $gte: today } });

        // Average resolution time
        const resolved = await SupportTicket.aggregate([
            { $match: { resolvedAt: { $ne: null } } },
            { $project: { resolutionTime: { $subtract: ['$resolvedAt', '$createdAt'] } } },
            { $group: { _id: null, avgTime: { $avg: '$resolutionTime' } } },
        ]);

        const avgResolutionHours = resolved[0]?.avgTime ? (resolved[0].avgTime / (1000 * 60 * 60)).toFixed(1) : 0;

        res.status(200).json({
            success: true,
            data: { total, openToday, avgResolutionHours: parseFloat(avgResolutionHours), byStatus, byPriority, byCategory },
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Update ticket status
// @route   PUT /api/admin/support/:id/status
// ============================================================================
exports.updateTicketStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const ticket = await SupportTicket.findById(req.params.id);
        if (!ticket) return next(new ErrorResponse('Ticket not found', 404));

        ticket.status = status;
        if (status === 'resolved') {
            ticket.resolvedAt = new Date();
            ticket.resolvedBy = req.user._id;
        }
        await ticket.save();

        res.status(200).json({ success: true, message: `Ticket status updated to ${status}`, data: { ticket } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Assign ticket to admin
// @route   PUT /api/admin/support/:id/assign
// ============================================================================
exports.assignTicket = async (req, res, next) => {
    try {
        const { adminId } = req.body;
        const ticket = await SupportTicket.findById(req.params.id);
        if (!ticket) return next(new ErrorResponse('Ticket not found', 404));

        ticket.assignedTo = adminId;
        ticket.status = ticket.status === 'open' ? 'in_progress' : ticket.status;
        await ticket.save();

        res.status(200).json({ success: true, message: 'Ticket assigned', data: { ticket } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Add response to ticket
// @route   POST /api/admin/support/:id/respond
// ============================================================================
exports.respondToTicket = async (req, res, next) => {
    try {
        const { message } = req.body;
        if (!message) return next(new ErrorResponse('Message is required', 400));

        const ticket = await SupportTicket.findById(req.params.id);
        if (!ticket) return next(new ErrorResponse('Ticket not found', 404));

        ticket.responses.push({
            message,
            respondedBy: req.user._id,
            responderModel: 'Admin',
            responderName: req.user.fullName || 'Admin',
        });

        if (ticket.status === 'open') ticket.status = 'in_progress';
        await ticket.save();

        res.status(200).json({ success: true, message: 'Response added', data: { ticket } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Resolve ticket
// @route   PUT /api/admin/support/:id/resolve
// ============================================================================
exports.resolveTicket = async (req, res, next) => {
    try {
        const { resolutionNote } = req.body;
        const ticket = await SupportTicket.findById(req.params.id);
        if (!ticket) return next(new ErrorResponse('Ticket not found', 404));

        ticket.status = 'resolved';
        ticket.resolvedAt = new Date();
        ticket.resolvedBy = req.user._id;
        ticket.resolutionNote = resolutionNote || '';
        await ticket.save();

        if (req.user.logAction) {
            await req.user.logAction('resolve_ticket', `Resolved ticket ${ticket.ticketNumber}`);
        }

        res.status(200).json({ success: true, message: 'Ticket resolved', data: { ticket } });
    } catch (err) {
        next(err);
    }
};
