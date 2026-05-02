
/**
 * 📡 Messaging Service (MSG91)
 * Handles SMS and WhatsApp (Transaction & OTP)
 */
const messagingService = {
    /**
     * Send SMS via MSG91 (or Simulation)
     */
    sendSMS: async (mobile, message, config = null) => {
        try {
            if (process.env.MSG_SIMULATION === "true") {
                return { success: true, message: "(Simulated) SMS sent" };
            }

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
     * Send WhatsApp via Meta Direct API (or Simulation)
     */
    sendWhatsApp: async (mobile, templateId, placeholders = {}, config = null) => {
        try {
            if (process.env.MSG_SIMULATION === "true") {
                return { success: true, message: "(Simulated) WhatsApp message initiated" };
            }

            // 🚀 Meta Direct API Configuration
            const token = process.env.WHATSAPP_TOKEN;
            const phoneNumberId = process.env.PHONE_NUMBER_ID?.trim().replace('+', ''); // Remove leading + if any
            const baseUrl = process.env.WHATSAPP_URL || "https://graph.facebook.com/v25.0";
            
            if (!token || !phoneNumberId) {
                return { success: false, message: "WhatsApp configuration missing" };
            }

            // 🚀 SANDBOX OVERRIDE: Redirect all messages to a verified number if override is ON
            const recipient = process.env.WHATSAPP_SANDBOX_OVERRIDE === "true" 
                ? "918368333343" 
                : (mobile.startsWith('91') ? mobile : `91${mobile}`);

            const url = `${baseUrl}/${phoneNumberId}/messages`;
            const payload = {
                messaging_product: "whatsapp",
                to: recipient,
                type: "template",
                template: {
                    name: templateId,
                    language: { code: "en" }
                }
            };

            // Only add parameters if it's NOT the static hello_world template
            if (templateId !== "hello_world" && Object.keys(placeholders).length > 0) {
                const otpValue = String(placeholders["1"] || Object.values(placeholders)[0]);
                
                payload.template.components = [
                    {
                        type: "body",
                        parameters: [
                            { type: "text", text: otpValue }
                        ]
                    },
                    {
                        type: "button",
                        sub_type: "url",
                        index: 0,
                        parameters: [
                            { type: "text", text: otpValue }
                        ]
                    }
                ];
            }

            const response = await fetch(url, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json", 
                    "Authorization": `Bearer ${token}` 
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            if (data.error) {
                return { success: false, message: data.error.message };
            }

            return { success: true, message: "WhatsApp message sent via Meta API", messageId: data.messages?.[0]?.id };
        } catch (err) {
            return { success: false, message: err.message };
        }
    },

    /**
     * Send OTP via Meta WhatsApp or MSG91 SMS fallback
     */
    sendOTP: async (mobile, otp, channel = "whatsapp", config = null) => {
        try {
            if (process.env.MSG_SIMULATION === "true") {
                return { success: true, channel: channel, message: "(Simulated) OTP sent" };
            }

            if (channel === "whatsapp") {
                const templateId = config?.msg91?.whatsapp_template_id || process.env.MSG91_WHATSAPP_TEMPLATE_ID || "hello_world";
                const result = await messagingService.sendWhatsApp(mobile, templateId, { "1": otp });
                
                if (result.success) return result;
            }

            // SMS Fallback via MSG91 (if still needed/available)
            const authKey = config?.msg91?.authkey || process.env.MSG91_API_KEY;
            const templateId = config?.msg91?.template_id || process.env.MSG91_TEMPLATE_ID;

            const payload = {
                template_id: templateId,
                mobile, otp, otp_length: "6", otp_expiry: "5"
            };

            const response = await fetch("https://api.msg91.com/api/v5/otp", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authkey": authKey },
                body: JSON.stringify(payload)
            });
            const data = await response.json();

            return { 
                success: data.type === "success", 
                channel: "sms",
                message: data.type === "success" ? `OTP sent via SMS` : data.message 
            };
        } catch (err) { 
            return { success: false, message: err.message }; 
        }
    }
};

module.exports = messagingService;
