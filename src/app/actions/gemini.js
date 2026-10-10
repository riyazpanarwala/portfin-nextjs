"use server";

import {
  generateGeminiResponse,
  sanitizeActionOptions,
  MAX_PROMPT_LENGTH,
} from "../../services/ai/geminiService.js";
import { requireSession } from '../../lib/auth.js';

// Sliding-window rate limiter per client identifier
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;
const rateLimitMap = new Map();

/**
 * Checks in-memory rate limit for a given key (IP or identifier).
 * @param {string} key
 * @returns {boolean} True if permitted, false if rate limited.
 */
function checkRateLimit(key) {
  const now = Date.now();
  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitMap.set(key, record);
    return true;
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  record.count++;
  rateLimitMap.set(key, record);
  return true;
}

// Periodic cleanup of stale rate limit records
if (typeof setInterval !== "undefined") {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }, RATE_LIMIT_WINDOW_MS * 2);
  cleanupTimer?.unref?.();
}

/**
 * Server Action: askGeminiAction
 * Internal Next.js server action to call Gemini securely from client components within this app.
 * Automatically benefits from Next.js server action CSRF and origin validation.
 *
 * @param {object} params
 * @param {string} params.prompt - Input prompt text.
 * @param {object} [params.options] - Optional Gemini options (responseFormat, systemInstruction, temperature, maxOutputTokens).
 * @returns {Promise<{ success: boolean, response?: any, error?: string, code?: string }>}
 */
export async function askGeminiAction({ prompt, options = {} } = {}) {
  try {
    // 1. Validate prompt
    if (typeof prompt !== "string") {
      return { success: false, error: "Prompt must be a string.", code: "INVALID_PROMPT" };
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return { success: false, error: "Prompt cannot be empty.", code: "EMPTY_PROMPT" };
    }

    if (trimmedPrompt.length > MAX_PROMPT_LENGTH) {
      return {
        success: false,
        error: `Prompt exceeds maximum allowed length of ${MAX_PROMPT_LENGTH} characters.`,
        code: "PROMPT_TOO_LONG",
      };
    }

    // 2. Server-side rate limiting
    const session = await requireSession();
    const clientId = session.userId;
    if (!checkRateLimit(clientId)) {
      return {
        success: false,
        error: "Rate limit exceeded. Please try again later.",
        code: "RATE_LIMIT_EXCEEDED",
      };
    }

    // 3. Sanitize options to strict allowlist
    const sanitizedOptions = sanitizeActionOptions(options);

    // 4. Generate response
    const result = await generateGeminiResponse(trimmedPrompt, sanitizedOptions);

    return {
      success: true,
      response: sanitizedOptions.responseFormat === "json" ? result.data : result.text,
    };
  } catch (error) {
    // Retain full details in server log, but return bounded message and code to browser
    console.error("[askGeminiAction] Server Error:", error?.message || error);

    const code = error?.code || "AI_REQUEST_FAILED";
    const userMessage =
      code === "RATE_LIMIT_EXCEEDED"
        ? "Rate limit exceeded. Please try again later."
        : "Failed to process AI request. Please try again later.";

    return {
      success: false,
      error: userMessage,
      code,
    };
  }
}
