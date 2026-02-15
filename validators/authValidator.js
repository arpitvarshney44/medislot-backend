const { body, param, query, validationResult } = require('express-validator');

/**
 * Handle validation errors middleware
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map((err) => ({
            field: err.path,
            message: err.msg,
            value: err.value,
        }));

        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: formattedErrors,
        });
    }
    next();
};

// ---------------------------------------------------------------------------
// Patient Auth Validators
// ---------------------------------------------------------------------------

const validatePatientRegister = [
    body('fullName')
        .trim()
        .notEmpty()
        .withMessage('Full name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters')
        .matches(/^[a-zA-Z\s.'-]+$/)
        .withMessage('Name can only contain letters, spaces, dots, hyphens, and apostrophes'),

    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

    body('mobileNumber')
        .trim()
        .notEmpty()
        .withMessage('Mobile number is required')
        .matches(/^[0-9]{10,15}$/)
        .withMessage('Mobile number must be 10-15 digits'),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),

    body('confirmPassword')
        .notEmpty()
        .withMessage('Please confirm your password')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),

    body('dateOfBirth')
        .optional()
        .isISO8601()
        .withMessage('Please provide a valid date of birth')
        .custom((value) => {
            const dob = new Date(value);
            const today = new Date();
            if (dob >= today) {
                throw new Error('Date of birth must be in the past');
            }
            return true;
        }),

    body('gender')
        .optional()
        .isIn(['male', 'female', 'other', 'prefer_not_to_say'])
        .withMessage('Gender must be male, female, other, or prefer_not_to_say'),

    handleValidationErrors,
];

const validateLogin = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Password is required'),

    handleValidationErrors,
];

const validateForgotPassword = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

    handleValidationErrors,
];

const validateResetPassword = [
    body('token')
        .trim()
        .notEmpty()
        .withMessage('Reset token is required'),

    body('password')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),

    body('confirmPassword')
        .notEmpty()
        .withMessage('Please confirm your new password')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),

    handleValidationErrors,
];

const validateChangePassword = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),

    body('newPassword')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
        .custom((value, { req }) => {
            if (value === req.body.currentPassword) {
                throw new Error('New password must be different from current password');
            }
            return true;
        }),

    body('confirmNewPassword')
        .notEmpty()
        .withMessage('Please confirm your new password')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),

    handleValidationErrors,
];

const validateEmailVerification = [
    body('token')
        .trim()
        .notEmpty()
        .withMessage('Verification token is required'),

    handleValidationErrors,
];

// ---------------------------------------------------------------------------
// Doctor Auth Validators
// ---------------------------------------------------------------------------

const validateDoctorRegister = [
    body('fullName')
        .trim()
        .notEmpty()
        .withMessage('Full name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),

    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

    body('mobileNumber')
        .trim()
        .notEmpty()
        .withMessage('Mobile number is required')
        .matches(/^[0-9]{10,15}$/)
        .withMessage('Mobile number must be 10-15 digits'),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),

    body('confirmPassword')
        .notEmpty()
        .withMessage('Please confirm your password')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),

    body('specializations')
        .isArray({ min: 1 })
        .withMessage('At least one specialization is required'),

    body('specializations.*')
        .trim()
        .notEmpty()
        .withMessage('Specialization cannot be empty'),

    body('medicalRegistrationNumber')
        .trim()
        .notEmpty()
        .withMessage('Medical registration number is required'),

    body('yearsOfExperience')
        .notEmpty()
        .withMessage('Years of experience is required')
        .isInt({ min: 0, max: 70 })
        .withMessage('Experience must be between 0 and 70 years'),

    body('consultationFees.online')
        .notEmpty()
        .withMessage('Online consultation fee is required')
        .isFloat({ min: 0 })
        .withMessage('Fee must be a positive number'),

    body('consultationFees.offline')
        .notEmpty()
        .withMessage('Offline consultation fee is required')
        .isFloat({ min: 0 })
        .withMessage('Fee must be a positive number'),

    body('clinicName')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('Clinic name cannot exceed 200 characters'),

    body('languagesSpoken')
        .optional()
        .isArray()
        .withMessage('Languages must be an array'),

    body('qualifications')
        .optional()
        .isArray()
        .withMessage('Qualifications must be an array'),

    handleValidationErrors,
];

// ---------------------------------------------------------------------------
// Admin Auth Validators
// ---------------------------------------------------------------------------

const validateAdminLogin = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Password is required'),

    handleValidationErrors,
];

const validateAdminCreate = [
    body('fullName')
        .trim()
        .notEmpty()
        .withMessage('Full name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),

    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),

    body('adminRole')
        .notEmpty()
        .withMessage('Admin role is required')
        .isIn(['super_admin', 'operations_admin', 'finance_admin', 'support_admin', 'content_admin'])
        .withMessage('Invalid admin role'),

    handleValidationErrors,
];

const validateTwoFactorSetup = [
    body('token')
        .trim()
        .notEmpty()
        .withMessage('2FA token is required')
        .isLength({ min: 6, max: 6 })
        .withMessage('Token must be 6 digits')
        .isNumeric()
        .withMessage('Token must be numeric'),

    handleValidationErrors,
];

const validateTwoFactorVerify = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

    body('token')
        .trim()
        .notEmpty()
        .withMessage('2FA token is required')
        .isLength({ min: 6, max: 6 })
        .withMessage('Token must be 6 digits')
        .isNumeric()
        .withMessage('Token must be numeric'),

    handleValidationErrors,
];

const validateRefreshToken = [
    body('refreshToken')
        .trim()
        .notEmpty()
        .withMessage('Refresh token is required'),

    handleValidationErrors,
];

module.exports = {
    handleValidationErrors,
    validatePatientRegister,
    validateLogin,
    validateForgotPassword,
    validateResetPassword,
    validateChangePassword,
    validateEmailVerification,
    validateDoctorRegister,
    validateAdminLogin,
    validateAdminCreate,
    validateTwoFactorSetup,
    validateTwoFactorVerify,
    validateRefreshToken,
};
