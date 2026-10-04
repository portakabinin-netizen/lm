/**
 * 🛠️ resolveDatePreset
 * Converts strings like "today", "7days", "30days" into actual Date objects.
 */
exports.resolveDatePreset = (preset) => {
    if (!preset) return null;
    
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    
    switch (preset.toLowerCase()) {
        case "today":
            return startOfDay;
        case "7days":
            const d7 = new Date(startOfDay);
            d7.setDate(d7.getDate() - 7);
            return d7;
        case "30days":
            const d30 = new Date(startOfDay);
            d30.setDate(d30.getDate() - 30);
            return d30;
        default:
            if (!preset || preset === "null" || preset === "undefined" || preset === "Invalid Date") return null;
            const d = new Date(preset);
            return (d instanceof Date && !isNaN(d.getTime())) ? d : null;
    }
};
