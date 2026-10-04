/**
 * ✅ Validation Helper
 * Shared regex-based validation for tax identities and other formats.
 */
const validationHelper = {
    /**
     * Validates Indian PAN Format
     * @param {string} pan 
     * @returns {boolean}
     */
    isValidPAN: (pan) => {
        if (!pan) return false;
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        return panRegex.test(pan.toUpperCase());
    },

    /**
     * Validates Indian GSTIN Format
     * @param {string} gst 
     * @returns {boolean}
     */
    isValidGSTIN: (gst) => {
        if (!gst) return false;
        const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        return gstRegex.test(gst.toUpperCase());
    }
};

module.exports = validationHelper;
