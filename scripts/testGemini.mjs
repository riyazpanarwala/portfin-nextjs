import { generateGeminiResponse } from "../src/services/ai/geminiService.js";

async function testLiveGemini() {
  console.log("--------------------------------------------------");
  console.log("Testing Google Gemini API Live Connection...");
  console.log("--------------------------------------------------");

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    console.error("❌ Error: GEMINI_API_KEY not found in process.env.");
    console.error("Please make sure GEMINI_API_KEY is configured in your .env file.");
    process.exit(1);
  }

  // Mask the key for safe display
  const maskedKey =
    apiKey.length > 8
      ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`
      : "***";
  console.log(`🔑 Using API Key: ${maskedKey}`);
  console.log(`🤖 Using Model: ${process.env.GEMINI_MODEL || "gemini-3.6-flash"}\n`);

  try {
    // 1. Test Text Generation
    console.log("1️⃣ Testing Text Generation...");
    const textResult = await generateGeminiResponse(
      "Respond with a single short greeting confirming Gemini API is working properly."
    );
    console.log("✅ Text Response received:");
    console.log(`   "${textResult.text.trim()}"`);
    if (textResult.usage) {
      console.log(`   Tokens used: ${textResult.usage.totalTokenCount || "N/A"}`);
    }

    // 2. Test Structured JSON Generation
    console.log("\n2️⃣ Testing Structured JSON Output...");
    const jsonResult = await generateGeminiResponse(
      "Return a JSON object with keys 'status' ('success') and 'message' ('Gemini integration verified').",
      { responseFormat: "json" }
    );
    console.log("✅ Structured JSON parsed successfully:");
    console.log("  ", JSON.stringify(jsonResult.data, null, 2));

    console.log("\n--------------------------------------------------");
    console.log("🎉 All Gemini API live tests passed successfully!");
    console.log("--------------------------------------------------");
  } catch (error) {
    console.error("\n❌ Gemini API Test Failed:");
    console.error(`   Error message: ${error.message}`);
    if (error.status) console.error(`   HTTP Status: ${error.status}`);
    if (error.code) console.error(`   Error Code: ${error.code}`);
    process.exit(1);
  }
}

testLiveGemini();
