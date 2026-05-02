const dotenv = require('dotenv');
dotenv.config();

// Ensure we are in LIVE mode for this test
process.env.MSG_SIMULATION = 'false';
process.env.WHATSAPP_SANDBOX_OVERRIDE = 'false';

const messagingService = require('./utils/messagingService');

async function testOtp() {
    const mobile = "919212790790";
    // Generate a random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // This will now use your custom template with the real OTP
    const templateId = "hipk_singup";

    console.log(`🚀 Testing WhatsApp OTP delivery...`);
    console.log(`📱 To: ${mobile}`);
    console.log(`🔑 OTP: ${otp}`);
    console.log(`📄 Template: ${templateId}`);

    const result = await messagingService.sendOTP(mobile, otp, "whatsapp");

    if (result.success) {
        console.log(`\n✅ SUCCESS: OTP triggered via ${result.channel || 'unknown channel'}!`);
        console.log("Message:", result.message);
        console.log("Check the phone for the message.");
    } else {
        console.log("\n❌ FAILED: OTP delivery failed.");
        console.log("Error:", result.message);
    }
}

testOtp();
