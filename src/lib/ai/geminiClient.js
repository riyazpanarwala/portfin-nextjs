import { askGeminiAction } from "../../app/actions/gemini.js";

/**
 * Client-side helper function to invoke Gemini securely via Next.js Server Action.
 * Guarantees that:
 * 1. The browser NEVER calls Gemini directly or handles API keys.
 * 2. No public REST API endpoint is exposed to external tools (like Postman or curl).
 * 3. Next.js native CSRF protection and action hashes protect every request.
 *
 * @param {string} prompt - Prompt to send.
 * @param {object} [options] - Optional generation options (model, systemInstruction, responseFormat, etc.).
 * @returns {Promise<{ success: boolean, response?: any, error?: string }>}
 */
export async function askGemini(prompt, options = {}) {
  try {
    return await askGeminiAction({ prompt, options });
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Failed to execute Gemini server action.",
    };
  }
}
