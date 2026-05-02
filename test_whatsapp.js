const dotenv = require('dotenv');
dotenv.config();

// Force simulation OFF for this test script
process.env.MSG_SIMULATION = 'false';

const messagingService = require('./utils/messagingService');

async function testSend() {
    const mobile = "919212790790";
    const templateId = "hello_world"; // Default Meta test template
    
    console.log(`🚀 Sending test WhatsApp to ${mobile} using template "${templateId}"...`);
    
    const result = await messagingService.sendWhatsApp(mobile, templateId, {});
    
    if (result.success) {
        console.log("✅ SUCCESS: WhatsApp sent successfully!");
        console.log("Message ID:", result.messageId);
    } else {
        console.log("❌ FAILED: Could not send WhatsApp.");
        console.log("Error:", result.message);
        
        if (result.message.includes("template")) {
            console.log("\n💡 TIP: The template 'hello_world' might not exist or isn't approved. If you created a custom template, use its name instead.");
        }
    }
}

testSend();
