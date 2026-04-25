const crypto = require("crypto");

/**
 * 🔒 Tenant Security Utilities
 * Handles encoding of database names and passwords based on Corporate PAN and Date.
 */
const tenantSecurity = {
    /**
     * Encodes a PAN into Hex format for use as a database name.
     * @param {string} pan - Corporate PAN
     * @returns {string} Hex encoded string
     */
    encodeDbName: (pan) => {
        if (!pan) throw new Error("PAN is required for encoding database name");
        return Buffer.from(pan.toUpperCase()).toString('hex');
    },

    /**
     * Encodes PAN + Date into Hex format for use as a database password.
     * @param {string} pan - Corporate PAN
     * @param {string|Date} date - DOB or DOI (will be formatted as ddmmyyyy)
     * @returns {string} Hex encoded string
     */
    encodeDbPassword: (pan, date) => {
        if (!pan || !date) throw new Error("PAN and Date are required for encoding database password");
        
        let dateStr = "";
        if (date instanceof Date) {
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const y = date.getFullYear();
            dateStr = `${d}${m}${y}`;
        } else {
            // Assume it's already a string or format it
            dateStr = String(date).replace(/\D/g, ''); 
        }

        const combined = `${pan.toUpperCase()}${dateStr}`;
        return Buffer.from(combined).toString('hex');
    },

    /**
     * Decodes a hex string back to original (for verification/display)
     */
    decodeHex: (hex) => {
        return Buffer.from(hex, 'hex').toString();
    }
};

module.exports = tenantSecurity;
