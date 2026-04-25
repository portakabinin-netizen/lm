const nodemailer = require("nodemailer");

/**
 * 📧 Email Service
 * Handles SMTP sending using tenant configuration
 */
const emailService = {
    /**
     * Send Email via SMTP
     */
    sendEmail: async (to, subject, body, config = null) => {
        try {
            // 1. Resolve Config
            const mailConfig = config?.mailConfigure || {
                host: process.env.MAIL_HOST || "smtp.gmail.com",
                port: process.env.MAIL_PORT || 587,
                secure: process.env.MAIL_SECURE === "true",
                auth: {
                    user: process.env.MAIL_USER,
                    pass: process.env.MAIL_PASS
                }
            };

            if (!mailConfig.auth?.user || !mailConfig.auth?.pass) {
                return { success: false, message: "Email configuration incomplete" };
            }

            // 2. Create Transporter
            const transporter = nodemailer.createTransport({
                host: mailConfig.host,
                port: mailConfig.port,
                secure: mailConfig.secure, // true for 465, false for other ports
                auth: {
                    user: mailConfig.auth.user,
                    pass: mailConfig.auth.pass,
                },
            });

            // 3. Send
            const info = await transporter.sendMail({
                from: `"${process.env.APP_NAME || 'HIPK'}" <${mailConfig.auth.user}>`,
                to,
                subject,
                text: body.replace(/<[^>]*>?/gm, ''), // Strip HTML for plain text
                html: body,
            });

            return { success: true, message: "Email sent successfully", messageId: info.messageId };
        } catch (err) {
            console.error("🔴 Email Service Error:", err.message);
            return { success: false, message: err.message };
        }
    }
};

module.exports = emailService;
