const crypto = require('crypto');

/**
 * Generate a 4-digit OTP for ride verification
 * @returns {string} 4-digit OTP code
 */
function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Generate OTP with expiration time
 * @param {number} expiryMinutes - OTP expiry time in minutes (default: 10)
 * @returns {Object} OTP object with code and expiry
 */
function generateOTPWithExpiry(expiryMinutes = 10) {
    const code = generateOTP();
    const generatedAt = new Date();
    const expiresAt = new Date(generatedAt.getTime() + (expiryMinutes * 60 * 1000));
    
    return {
        code,
        generated_at: generatedAt,
        expires_at: expiresAt
    };
}

/**
 * Verify if OTP is valid and not expired
 * @param {string} inputOTP - OTP entered by user
 * @param {string} storedOTP - OTP stored in database
 * @param {Date} expiresAt - OTP expiry time
 * @returns {boolean} True if OTP is valid
 */
function verifyOTP(inputOTP, storedOTP, expiresAt) {
    if (!inputOTP || !storedOTP || !expiresAt) {
        return false;
    }
    
    // Check if OTP has expired
    if (new Date() > new Date(expiresAt)) {
        return false;
    }
    
    // Check if OTP matches
    return inputOTP === storedOTP;
}

/**
 * Check if OTP is expired
 * @param {Date} expiresAt - OTP expiry time
 * @returns {boolean} True if OTP is expired
 */
function isOTPExpired(expiresAt) {
    return new Date() > new Date(expiresAt);
}

module.exports = {
    generateOTP,
    generateOTPWithExpiry,
    verifyOTP,
    isOTPExpired
};
