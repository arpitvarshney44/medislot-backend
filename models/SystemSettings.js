const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },
        category: {
            type: String,
            enum: ['commission', 'payment', 'consultation', 'notification', 'general', 'security'],
            default: 'general',
        },
        description: {
            type: String,
            default: '',
        },
        lastUpdatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

systemSettingsSchema.index({ key: 1 });
systemSettingsSchema.index({ category: 1 });

// Static: Get setting by key
systemSettingsSchema.statics.getSetting = async function (key, defaultValue = null) {
    const setting = await this.findOne({ key });
    return setting ? setting.value : defaultValue;
};

// Static: Set setting
systemSettingsSchema.statics.setSetting = async function (key, value, category, description, adminId) {
    return this.findOneAndUpdate(
        { key },
        {
            value,
            category: category || 'general',
            description: description || '',
            lastUpdatedBy: adminId || null,
        },
        { upsert: true, new: true }
    );
};

const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);

module.exports = SystemSettings;
