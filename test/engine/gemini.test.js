import test from "node:test";
import assert from "node:assert/strict";
import {
  generateGeminiResponse,
  parseStructuredJson,
  sanitizeErrorOutput,
  sanitizeActionOptions,
  MAX_PROMPT_LENGTH,
} from "../../src/services/ai/geminiService.js";
import { askGeminiAction } from "../../src/app/actions/gemini.js";
import { askGemini } from "../../src/lib/ai/geminiClient.js";

// Helper to create a mock Gemini client
function createMockClient({
  text = "Test response from Gemini",
  usage = { totalTokenCount: 20 },
  error = null,
  delayMs = 0,
} = {}) {
  return {
    models: {
      generateContent: async (params) => {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        if (error) {
          throw error;
        }
        return {
          text,
          usageMetadata: usage,
          params,
        };
      },
    },
  };
}

test("Gemini Service: Rejects when GEMINI_API_KEY is missing", async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(
      generateGeminiResponse("Hello Gemini"),
      /GEMINI_API_KEY is not configured on the server/
    );
  } finally {
    if (originalKey !== undefined) {
      process.env.GEMINI_API_KEY = originalKey;
    }
  }
});

test("Gemini Service: Successful request returns expected text and metadata", async () => {
  const mockClient = createMockClient({ text: "Hello from Gemini" });
  const result = await generateGeminiResponse("Explain recursion", {
    client: mockClient,
    model: "gemini-2.5-flash",
  });

  assert.equal(result.text, "Hello from Gemini");
  assert.equal(result.model, "gemini-2.5-flash");
  assert.equal(result.usage.totalTokenCount, 20);
});

test("Gemini Service: Invalid requests are rejected", async () => {
  const mockClient = createMockClient();

  // Missing / empty prompt
  await assert.rejects(
    generateGeminiResponse("", { client: mockClient }),
    /Prompt cannot be empty/
  );

  // Whitespace only prompt
  await assert.rejects(
    generateGeminiResponse("   \n   ", { client: mockClient }),
    /Prompt cannot be empty/
  );

  // Non-string prompt
  await assert.rejects(
    generateGeminiResponse(12345, { client: mockClient }),
    /Prompt must be a string/
  );

  // Exceeds max length
  const longPrompt = "a".repeat(MAX_PROMPT_LENGTH + 1);
  await assert.rejects(
    generateGeminiResponse(longPrompt, { client: mockClient }),
    /exceeds maximum allowed length/
  );
});

test("Gemini Service: Handles Gemini API failure safely", async () => {
  const mockClient = createMockClient({
    error: new Error("Internal upstream model error occurred"),
  });

  await assert.rejects(
    generateGeminiResponse("Test prompt", { client: mockClient }),
    /Internal upstream model error occurred/
  );
});

test("Gemini Service: Handles rate-limit / quota failure gracefully", async () => {
  const mockClient = createMockClient({
    error: new Error("429 Too Many Requests: RESOURCE_EXHAUSTED quota exceeded"),
  });

  await assert.rejects(
    generateGeminiResponse("Test prompt", { client: mockClient }),
    (err) => {
      assert.equal(err.status, 429);
      assert.equal(err.code, "RATE_LIMIT_EXCEEDED");
      assert.match(err.message, /rate limit or quota exceeded/);
      return true;
    }
  );
});

test("Gemini Service: Handles request timeout safely", async () => {
  const mockClient = createMockClient({
    delayMs: 100,
    text: "Should not be received",
  });

  await assert.rejects(
    generateGeminiResponse("Test prompt", {
      client: mockClient,
      timeoutMs: 15,
    }),
    (err) => {
      assert.equal(err.status, 504);
      assert.equal(err.code, "REQUEST_TIMEOUT");
      assert.match(err.message, /timed out/);
      return true;
    }
  );
});

test("Gemini Service: Structured JSON parsing and validation", async () => {
  // Valid JSON string
  const jsonMockClient = createMockClient({
    text: JSON.stringify({ key: "value", count: 42 }),
  });

  const jsonResult = await generateGeminiResponse("Generate JSON", {
    client: jsonMockClient,
    responseFormat: "json",
  });

  assert.equal(jsonResult.data.key, "value");
  assert.equal(jsonResult.data.count, 42);

  // Valid JSON wrapped in markdown code fence
  const fencedClient = createMockClient({
    text: "```json\n{\"status\": \"ok\", \"items\": [1, 2]}\n```",
  });

  const fencedResult = await generateGeminiResponse("Generate JSON", {
    client: fencedClient,
    responseFormat: "json",
  });

  assert.equal(fencedResult.data.status, "ok");
  assert.deepEqual(fencedResult.data.items, [1, 2]);

  // Invalid JSON response throws helpful error
  const invalidJsonClient = createMockClient({
    text: "This is definitely not JSON.",
  });

  await assert.rejects(
    generateGeminiResponse("Generate JSON", {
      client: invalidJsonClient,
      responseFormat: "json",
    }),
    /Failed to parse Gemini response as valid JSON/
  );
});

test("Gemini Service: API key is never exposed in errors or responses", async () => {
  const secretKey = "AIzaSySecretApiKey123456789";
  const errorMessageWithKey = `Error: Authentication failed with key ${secretKey} on Google GenAI API endpoint.`;

  const sanitized = sanitizeErrorOutput(errorMessageWithKey, secretKey);
  assert.equal(sanitized.includes(secretKey), false);
  assert.match(sanitized, /\[REDACTED_API_KEY\]/);

  const mockClient = createMockClient({
    error: new Error(errorMessageWithKey),
  });

  await assert.rejects(
    generateGeminiResponse("Test", {
      client: mockClient,
      apiKey: secretKey,
    }),
    (err) => {
      assert.equal(err.message.includes(secretKey), false);
      assert.match(err.message, /\[REDACTED_API_KEY\]/);
      return true;
    }
  );
});

test("Server Action: sanitizeActionOptions enforces allowlist and bounds", () => {
  const unsafe = {
    apiKey: "secret-key",
    client: { mock: true },
    timeoutMs: 99999,
    model: "unsafe-model",
    temperature: 3.5,
    maxOutputTokens: 99999,
    responseFormat: "json",
    systemInstruction: "test instruction",
  };

  const safe = sanitizeActionOptions(unsafe);
  assert.equal(safe.apiKey, undefined);
  assert.equal(safe.client, undefined);
  assert.equal(safe.timeoutMs, undefined);
  assert.equal(safe.model, undefined);
  assert.equal(safe.temperature, 2.0);
  assert.equal(safe.maxOutputTokens, 8192);
  assert.equal(safe.responseFormat, "json");
  assert.equal(safe.systemInstruction, "test instruction");
});

test("Server Action: askGeminiAction validates serializable input and limits", async () => {
  // Empty input rejection
  const invalidRes = await askGeminiAction({ prompt: "" });
  assert.equal(invalidRes.success, false);
  assert.equal(invalidRes.code, "EMPTY_PROMPT");
  assert.match(invalidRes.error, /Prompt cannot be empty/);

  // Non-string prompt
  const nonStringRes = await askGeminiAction({ prompt: null });
  assert.equal(nonStringRes.success, false);
  assert.equal(nonStringRes.code, "INVALID_PROMPT");
  assert.match(nonStringRes.error, /Prompt must be a string/);

  // Length limit exceeded
  const longPrompt = "x".repeat(MAX_PROMPT_LENGTH + 1);
  const lengthRes = await askGeminiAction({ prompt: longPrompt });
  assert.equal(lengthRes.success, false);
  assert.equal(lengthRes.code, "PROMPT_TOO_LONG");
  assert.match(lengthRes.error, /exceeds maximum allowed length/);
});

test("Server Action: askGeminiAction masks upstream server errors safely", async () => {
  // Calling without API key triggers upstream error
  const origKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    const res = await askGeminiAction({ prompt: "Test prompt" });
    assert.equal(res.success, false);
    // Verifies generic message is returned to client without leaking internal error details
    assert.equal(res.error, "Failed to process AI request. Please try again later.");
    assert.ok(res.code);
  } finally {
    if (origKey !== undefined) process.env.GEMINI_API_KEY = origKey;
  }
});

test("Client Helper: askGemini delegates to Server Action cleanly", async () => {
  const res = await askGemini("");
  assert.equal(res.success, false);
  assert.match(res.error, /Prompt cannot be empty/);
});
