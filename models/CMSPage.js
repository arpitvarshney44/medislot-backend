const mongoose = require('mongoose');

const cmsPageSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Page title is required'],
            trim: true,
            maxlength: 300,
        },
        slug: {
            type: String,
            required: [true, 'Page slug is required'],
            unique: true,
            trim: true,
            lowercase: true,
        },
        type: {
            type: String,
            enum: ['static_page', 'blog', 'faq'],
            default: 'static_page',
        },
        content: {
            type: String,
            default: '',
        },
        excerpt: {
            type: String,
            default: '',
            maxlength: 500,
        },
        featuredImage: {
            type: String,
            default: '',
        },
        category: {
            type: String,
            default: '',
        },
        tags: {
            type: [String],
            default: [],
        },

        // SEO
        seo: {
            metaTitle: { type: String, default: '' },
            metaDescription: { type: String, default: '' },
            metaKeywords: { type: [String], default: [] },
            ogImage: { type: String, default: '' },
        },

        // Status
        status: {
            type: String,
            enum: ['draft', 'published', 'archived'],
            default: 'draft',
        },
        publishedAt: {
            type: Date,
            default: null,
        },

        // Author
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },
        lastEditedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },

        // Ordering (for FAQs)
        sortOrder: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

cmsPageSchema.index({ slug: 1 });
cmsPageSchema.index({ type: 1 });
cmsPageSchema.index({ status: 1 });
cmsPageSchema.index({ createdAt: -1 });

const CMSPage = mongoose.model('CMSPage', cmsPageSchema);

module.exports = CMSPage;
