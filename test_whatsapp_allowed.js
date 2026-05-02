const dotenv = require('dotenv');
dotenv.config();

// Force simulation OFF for this test script
process.env.MSG_SIMULATION = 'false';

const messagingService = require('./utils/messagingService');

async function testSend() {
    const mobile = "918368333343"; // Use the allowed list number
    const templateId = "hello_world"; // Default Meta test template
    
    console.log(`🚀 Sending test WhatsApp to ALLOWED number ${mobile} using template "${templateId}"...`);
    
    const result = await messagingService.sendWhatsApp(mobile, templateId, {});
    
    if (result.success) {
        console.log("✅ SUCCESS: WhatsApp sent successfully to your allowed number!");
        console.log("Message ID:", result.messageId);
    } else {
        console.log("❌ FAILED: Could not send WhatsApp.");
        console.log("Error Details:", result.message);
    }
}

testSend();
