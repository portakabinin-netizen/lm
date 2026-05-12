
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


            // 🚀 SMS Configuration (STRICT: Read from profileMaster only)
            const msg91Config = config?.msg91;

            if (!msg91Config || !msg91Config.isActive) {
                return { success: false, message: "SMS (MSG91) is not configured or active for this corporate" };
            }

            const authKey = msg91Config.authkey;
            const senderId = msg91Config.sender_id;

            if (!authKey || !senderId) {
                return { success: false, message: "SMS configuration is incomplete in profileMaster" };
            }

            const url = msg91Config.url || `https://api.msg91.com/api/v2/sendsms`;
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


            // 🚀 Meta Direct API Configuration (STRICT: Read from profileMaster only)
            const metaConfig = config?.whatsapp_meta;

            if (!metaConfig || !metaConfig.isActive) {
                return { success: false, message: "WhatsApp (Meta) is not configured or active for this corporate" };
            }

            const token = metaConfig.token;
            const phoneNumberIdRaw = metaConfig.phone_number_id;
            const phoneNumberId = phoneNumberIdRaw?.trim().replace('+', '');
            const baseUrl = metaConfig.url || "https://graph.facebook.com/v25.0";

            if (!token || !phoneNumberId) {
                return { success: false, message: "WhatsApp Meta configuration is incomplete in profileMaster" };
            }

            const recipient = mobile.startsWith('91') ? mobile : `91${mobile}`;

            const url = `${baseUrl}/${phoneNumberId}/messages`;
            const payload = {
                messaging_product: "whatsapp",
                to: recipient,
                type: "template",
                template: {
                    name: templateId,
                    language: { code: templateId === "hello_world" ? "en_US" : "en" }
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

            return { success: true, channel: "whatsapp", message: "WhatsApp message sent via Meta API", messageId: data.messages?.[0]?.id };
        } catch (err) {
            return { success: false, message: err.message };
        }
    },

    /**
     * Send OTP via Meta WhatsApp or MSG91 SMS fallback
     */
    sendOTP: async (mobile, otp, channel = "whatsapp", config = null, purpose = "register") => {
        try {


            if (channel === "whatsapp") {
                // 1. Try to find purpose-specific template in whatsapp_meta
                let templateId = config?.whatsapp_meta?.templates?.find(t => t.purpose === purpose)?.template_id;

                // 2. Fallback to legacy template or default to "hipk_singup"
                if (!templateId) {
                    templateId = config?.msg91?.whatsapp_template_id || "hipk_singup";
                }

                const result = await messagingService.sendWhatsApp(mobile, templateId, { "1": otp }, config);
                return result;
            }

            // SMS Fallback via MSG91 (STRICT: Read from profileMaster only)
            const msg91Config = config?.msg91;
            if (!msg91Config || !msg91Config.isActive) {
                return { success: false, message: "SMS fallback is not configured or active for this corporate" };
            }

            const authKey = msg91Config.authkey;
            const templateId = msg91Config.template_id;

            if (!authKey || !templateId) {
                return { success: false, message: "SMS fallback configuration is incomplete in profileMaster" };
            }

            const payload = {
                template_id: templateId,
                mobile, otp, otp_length: "6", otp_expiry: "5"
            };

            const url = msg91Config.url || "https://api.msg91.com/api/v5/otp";
            const response = await fetch(url, {
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
