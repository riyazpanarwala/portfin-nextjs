import { GoogleGenAI } from "@google/genai";

/**
 * Default Gemini model if none is specified in options or environment.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

/**
 * Maximum permitted character length for input prompts to prevent abuse and excessive token usage.
 */
export const MAX_PROMPT_LENGTH = 50000;

/**
 * Default request timeout in milliseconds (30 seconds).
 */
export const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Sanitizes strings to ensure sensitive API keys or credentials are never leaked.
 * @param {string} text - Message or error string to sanitize.
 * @param {string} [apiKey] - The active API key to redact if present.
 * @returns {string} Sanitized string.
 */
export function sanitizeErrorOutput(text, apiKey) {
  if (!text || typeof text !== "string") return "An unexpected error occurred.";
  let sanitized = text;
  if (apiKey && apiKey.length > 4) {
    sanitized = sanitized.replaceAll(apiKey, "[REDACTED_API_KEY]");
  }
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.length > 4) {
    sanitized = sanitized.replaceAll(envKey, "[REDACTED_API_KEY]");
  }
  return sanitized;
}

/**
 * Parses structured JSON response safely from Gemini output text.
 * Strips markdown code blocks (e.g. ```json ... ```) if present.
 * @param {string} rawText
 * @returns {object|array} Parsed JSON object.
 * @throws {Error} If text is not valid JSON.
 */
export function parseStructuredJson(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new Error("Gemini returned an empty response when JSON was expected.");
  }

  let cleaned = rawText.trim();
  // Remove markdown code fences if returned by model
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("Failed to parse Gemini response as valid JSON.");
  }
}

/**
 * Generic, reusable service function to interact with Google Gemini API.
 * Domain-agnostic and usable by any feature in the application.
 *
 * @param {string} prompt - Input prompt for Gemini.
 * @param {object} [options] - Generation options.
 * @param {string} [options.model] - Gemini model identifier (e.g. "gemini-2.5-flash").
 * @param {string} [options.systemInstruction] - High-level system instructions or persona.
 * @param {string} [options.responseFormat] - "text" (default) or "json".
 * @param {object} [options.responseSchema] - Optional JSON schema when responseFormat is "json".
 * @param {number} [options.temperature] - Sampling temperature (0.0 to 2.0).
 * @param {number} [options.maxOutputTokens] - Maximum tokens in generated response.
 * @param {number} [options.timeoutMs] - Request timeout in milliseconds (default: 30000ms).
 * @param {string} [options.apiKey] - Explicit API key (defaults to server-side process.env.GEMINI_API_KEY).
 * @param {object} [options.client] - Injected GoogleGenAI instance for testing / custom mocking.
 * @returns {Promise<{ text: string, data?: any, model: string, usage?: object }>}
 */
export async function generateGeminiResponse(prompt, options = {}) {
  const {
    model: customModel,
    systemInstruction,
    responseFormat = "text",
    responseSchema,
    temperature,
    maxOutputTokens,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    apiKey: customApiKey,
    client: customClient,
  } = options;

  // 1. Validate prompt
  if (typeof prompt !== "string") {
    throw new TypeError("Prompt must be a string.");
  }

  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt cannot be empty.");
  }

  if (trimmedPrompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(
      `Prompt exceeds maximum allowed length of ${MAX_PROMPT_LENGTH} characters.`
    );
  }

  // 2. Resolve API Key (strictly server-side)
  const apiKey = (customApiKey || process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey && !customClient) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the server. Please set it in your environment variables."
    );
  }

  // 3. Resolve Model
  const model =
    (customModel || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();

  // 4. Construct configuration
  const isJson = responseFormat === "json";
  const config = {};

  if (systemInstruction && typeof systemInstruction === "string") {
    config.systemInstruction = systemInstruction.trim();
  }

  if (isJson) {
    config.responseMimeType = "application/json";
    if (responseSchema) {
      config.responseSchema = responseSchema;
    }
  }

  // Gemini 3.6 Flash does not accept deprecated temperature parameter
  if (typeof temperature === "number" && !model.includes("3.6")) {
    config.temperature = temperature;
  }

  if (typeof maxOutputTokens === "number") {
    config.maxOutputTokens = maxOutputTokens;
  }

  // 5. Initialize client
  const client = customClient || new GoogleGenAI({ apiKey });

  // 6. Execute request with timeout
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Gemini request timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    const apiCallPromise = client.models.generateContent({
      model,
      contents: trimmedPrompt,
      ...(Object.keys(config).length > 0 ? { config } : {}),
    });

    const response = await Promise.race([apiCallPromise, timeoutPromise]);
    clearTimeout(timeoutId);

    // 7. Extract response content safely
    const rawText =
      response?.text ??
      response?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "";

    if (!rawText && rawText !== "0") {
      throw new Error("Gemini returned an empty response.");
    }

    const result = {
      text: rawText,
      model,
      usage: response?.usageMetadata || null,
    };

    // 8. If JSON response was requested, parse it
    if (isJson) {
      result.data = parseStructuredJson(rawText);
    }

    return result;
  } catch (err) {
    clearTimeout(timeoutId);

    const rawMessage = err?.message || String(err);
    const sanitizedMessage = sanitizeErrorOutput(rawMessage, apiKey);

    // Identify rate limit / quota exhaustion
    if (
      sanitizedMessage.includes("429") ||
      sanitizedMessage.includes("RESOURCE_EXHAUSTED") ||
      sanitizedMessage.toLowerCase().includes("quota exceeded")
    ) {
      const error = new Error(
        "Gemini API rate limit or quota exceeded. Please try again later."
      );
      error.status = 429;
      error.code = "RATE_LIMIT_EXCEEDED";
      throw error;
    }

    // Identify timeout
    if (sanitizedMessage.toLowerCase().includes("timed out")) {
      const error = new Error("Gemini API request timed out.");
      error.status = 504;
      error.code = "REQUEST_TIMEOUT";
      throw error;
    }

    // Create sanitized application error
    const error = new Error(sanitizedMessage);
    error.status = err?.status || 500;
    error.code = err?.code || "GEMINI_API_ERROR";
    throw error;
  }
}

/**
 * Validates and sanitizes options forwarded to generateGeminiResponse.
 * Excludes apiKey, client, timeoutMs, and model to ensure server control.
 * Bounds temperature and maxOutputTokens.
 * @param {object} rawOptions
 * @returns {object} Sanitized options
 */
export function sanitizeActionOptions(rawOptions = {}) {
  if (!rawOptions || typeof rawOptions !== "object" || Array.isArray(rawOptions)) {
    return { responseFormat: "text" };
  }

  const safe = {};

  // responseFormat: strictly "text" or "json"
  safe.responseFormat = rawOptions.responseFormat === "json" ? "json" : "text";

  // systemInstruction: string bounded to 20000 characters to safely support portfolio context
  if (typeof rawOptions.systemInstruction === "string") {
    safe.systemInstruction = rawOptions.systemInstruction.slice(0, 20000).trim();
  }

  // temperature: bounded between 0.0 and 2.0
  if (typeof rawOptions.temperature === "number" && !isNaN(rawOptions.temperature)) {
    safe.temperature = Math.max(0.0, Math.min(2.0, rawOptions.temperature));
  }

  // maxOutputTokens: bounded between 1 and 8192
  if (typeof rawOptions.maxOutputTokens === "number" && !isNaN(rawOptions.maxOutputTokens)) {
    safe.maxOutputTokens = Math.max(1, Math.min(8192, Math.floor(rawOptions.maxOutputTokens)));
  }

  return safe;
}
