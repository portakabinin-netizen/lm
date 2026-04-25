const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

/**
 * 📡 Messaging Service (MSG91)
 * Handles SMS and WhatsApp (Transaction & OTP)
 */
const messagingService = {
    /**
     * Send SMS via MSG91
     */
    sendSMS: async (mobile, message, config = null) => {
        try {
            const authKey = config?.msg91?.authkey || process.env.MSG91_API_KEY;
            const senderId = config?.msg91?.sender_id || process.env.MSG91_SENDER_ID;
            
            const url = `https://api.msg91.com/api/v2/sendsms`;
            const payload = {
                sender: senderId,
                route: "4",
                country: "91",
                sms: [{ message, to: [mobile] }]
            };

            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "authkey": authKey },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            return { success: data.type === "success", message: data.message || "SMS sent" };
        } catch (err) {
            return { success: false, message: err.message };
        }
    },

    /**
     * Send WhatsApp via MSG91
     */
    sendWhatsApp: async (mobile, templateId, placeholders = {}, config = null) => {
        try {
            const authKey = config?.msg91?.authkey || process.env.MSG91_API_KEY;
            
            // MSG91 WhatsApp API v5
            const url = `https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-send`;
            const payload = {
                integrated_number: config?.msg91?.sender_id || process.env.MSG91_WHATSAPP_NUMBER,
                content_type: "template",
                payload: {
                    messaging_product: "whatsapp",
                    type: "template",
                    template: {
                        name: templateId,
                        language: { code: "en" },
                        components: [
                            {
                                type: "body",
                                parameters: Object.keys(placeholders).map(key => ({
                                    type: "text",
                                    text: String(placeholders[key])
                                }))
                            }
                        ]
                    }
                },
                to: mobile.startsWith('91') ? mobile : `91${mobile}`
            };

            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "authkey": authKey },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            return { success: data.status === "success", message: data.message || "WhatsApp message initiated" };
        } catch (err) {
            return { success: false, message: err.message };
        }
    },

    /**
     * Send OTP (Already implemented in authController, but consolidating here)
     */
    sendOTP: async (mobile, otp, channel = "whatsapp", config = null) => {
        try {
            const authKey = config?.msg91?.authkey || process.env.MSG91_API_KEY;
            const templateId = channel === "whatsapp" 
                ? (config?.msg91?.whatsapp_template_id || process.env.MSG91_WHATSAPP_TEMPLATE_ID || process.env.MSG91_TEMPLATE_ID)
                : (config?.msg91?.template_id || process.env.MSG91_TEMPLATE_ID);

            const payload = {
                template_id: templateId,
                mobile, otp, otp_length: "6", otp_expiry: "5"
            };
            if (channel === "whatsapp") payload.channel = "whatsapp";

            const response = await fetch("https://api.msg91.com/api/v5/otp", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authkey": authKey },
                body: JSON.stringify(payload)
            });
            const data = await response.json();

            // Fallback to SMS if WhatsApp fails
            if (channel === "whatsapp" && (data.type === "error" || !response.ok)) {
                return messagingService.sendOTP(mobile, otp, "sms", config);
            }

            return { 
                success: data.type === "success", 
                channel: data.type === "success" ? channel : null,
                message: data.type === "success" ? `OTP sent via ${channel}` : data.message 
            };
        } catch (err) { 
            return { success: false, message: err.message }; 
        }
    }
};

module.exports = messagingService;
