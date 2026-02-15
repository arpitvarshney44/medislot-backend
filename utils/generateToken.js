const jwt = require('jsonwebtoken');

/**
 * Generate Access Token
 * @param {Object} payload - Token payload { id, role }
 * @returns {string} JWT access token
 */
const generateAccessToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '30d',
        issuer: 'medislot',
        audience: 'medislot-app',
    });
};

/**
 * Generate Refresh Token
 * @param {Object} payload - Token payload { id, role }
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRE || '90d',
        issuer: 'medislot',
        audience: 'medislot-app',
    });
};

/**
 * Verify Access Token
 * @param {string} token - JWT access token
 * @returns {Object} Decoded payload
 */
const verifyAccessToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'medislot',
        audience: 'medislot-app',
    });
};

/**
 * Verify Refresh Token
 * @param {string} token - JWT refresh token
 * @returns {Object} Decoded payload
 */
const verifyRefreshToken = (token) => {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
        issuer: 'medislot',
        audience: 'medislot-app',
    });
};

/**
 * Generate both Access and Refresh tokens
 * @param {string} id - User/Doctor/Admin ID
 * @param {string} role - User role
 * @returns {Object} { accessToken, refreshToken }
 */
const generateTokenPair = (id, role) => {
    const payload = { id, role };
    return {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
    };
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    generateTokenPair,
};
