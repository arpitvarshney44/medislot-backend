const CMSPage = require('../models/CMSPage');
const ErrorResponse = require('../utils/errorResponse');

// ============================================================================
// @desc    Get all CMS pages (with filters, pagination)
// @route   GET /api/admin/cms
// ============================================================================
exports.getAllPages = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, type, status, search } = req.query;

        const filter = {};
        if (type) filter.type = type;
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { content: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = await CMSPage.countDocuments(filter);

        const pages = await CMSPage.find(filter)
            .populate('author', 'fullName')
            .populate('lastEditedBy', 'fullName')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            data: {
                pages,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalPages_count: total,
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
// @desc    Get single CMS page
// @route   GET /api/admin/cms/:id
// ============================================================================
exports.getPageById = async (req, res, next) => {
    try {
        const pg = await CMSPage.findById(req.params.id)
            .populate('author', 'fullName')
            .populate('lastEditedBy', 'fullName');

        if (!pg) return next(new ErrorResponse('Page not found', 404));
        res.status(200).json({ success: true, data: { page: pg } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Create CMS page
// @route   POST /api/admin/cms
// ============================================================================
exports.createPage = async (req, res, next) => {
    try {
        const { title, slug, type, content, excerpt, featuredImage, category, tags, seo, status, sortOrder } = req.body;

        if (!title || !slug) return next(new ErrorResponse('Title and slug are required', 400));

        const exists = await CMSPage.findOne({ slug: slug.toLowerCase() });
        if (exists) return next(new ErrorResponse('A page with this slug already exists', 400));

        const pg = await CMSPage.create({
            title, slug: slug.toLowerCase(), type: type || 'static_page',
            content, excerpt, featuredImage, category, tags,
            seo: seo || {}, status: status || 'draft',
            publishedAt: status === 'published' ? new Date() : null,
            author: req.user._id, lastEditedBy: req.user._id,
            sortOrder: sortOrder || 0,
        });

        if (req.user.logAction) {
            await req.user.logAction('create_cms_page', `Created ${type || 'page'}: ${title}`);
        }

        res.status(201).json({ success: true, message: 'Page created', data: { page: pg } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Update CMS page
// @route   PUT /api/admin/cms/:id
// ============================================================================
exports.updatePage = async (req, res, next) => {
    try {
        const pg = await CMSPage.findById(req.params.id);
        if (!pg) return next(new ErrorResponse('Page not found', 404));

        const allowed = ['title', 'slug', 'type', 'content', 'excerpt', 'featuredImage', 'category', 'tags', 'seo', 'status', 'sortOrder'];
        allowed.forEach((field) => {
            if (req.body[field] !== undefined) pg[field] = req.body[field];
        });

        if (req.body.status === 'published' && !pg.publishedAt) {
            pg.publishedAt = new Date();
        }
        pg.lastEditedBy = req.user._id;
        await pg.save();

        res.status(200).json({ success: true, message: 'Page updated', data: { page: pg } });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// @desc    Delete CMS page
// @route   DELETE /api/admin/cms/:id
// ============================================================================
exports.deletePage = async (req, res, next) => {
    try {
        const pg = await CMSPage.findByIdAndDelete(req.params.id);
        if (!pg) return next(new ErrorResponse('Page not found', 404));

        if (req.user.logAction) {
            await req.user.logAction('delete_cms_page', `Deleted page: ${pg.title}`);
        }

        res.status(200).json({ success: true, message: 'Page deleted' });
    } catch (err) {
        next(err);
    }
};
