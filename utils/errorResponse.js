/**
 * Custom Error Response Class
 * Extends native Error with statusCode for consistent error handling
 */

class ErrorResponse extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'ErrorResponse';

        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = ErrorResponse;
