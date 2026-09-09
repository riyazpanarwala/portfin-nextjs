"use server";

import {
  generateGeminiResponse,
  MAX_PROMPT_LENGTH,
} from "../../services/ai/geminiService.js";

/**
 * Server Action: askGeminiAction
 * Internal Next.js server action to call Gemini securely from client components within this app.
 * Automatically benefits from Next.js server action CSRF and origin validation.
 *
 * @param {object} params
 * @param {string} params.prompt - Input prompt text.
 * @param {object} [params.options] - Optional Gemini options (model, systemInstruction, responseFormat, etc.).
 * @returns {Promise<{ success: boolean, response?: any, error?: string }>}
 */
export async function askGeminiAction({ prompt, options = {} } = {}) {
  try {
    if (typeof prompt !== "string") {
      return { success: false, error: "Prompt must be a string." };
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return { success: false, error: "Prompt cannot be empty." };
    }

    if (trimmedPrompt.length > MAX_PROMPT_LENGTH) {
      return {
        success: false,
        error: `Prompt exceeds maximum allowed length of ${MAX_PROMPT_LENGTH} characters.`,
      };
    }

    const result = await generateGeminiResponse(trimmedPrompt, options);

    return {
      success: true,
      response: options.responseFormat === "json" ? result.data : result.text,
    };
  } catch (error) {
    console.error("[askGeminiAction] Error:", error?.message || error);
    return {
      success: false,
      error: error?.message || "Failed to process Gemini request.",
    };
  }
}
