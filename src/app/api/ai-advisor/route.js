import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai-advisor
 * Runs inference via Ollama — 100% local, free, no API key, no quotas
 *
 * Setup (one time):
 *   1. Download Ollama: https://ollama.com
 *   2. Install and run:  ollama serve
 *   3. Pull a model:     ollama pull llama3.2
 *
 * Ollama listens on http://localhost:11434 by default.
 * Body: { messages: [...], systemPrompt: string }
 */

const OLLAMA_BASE = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

export async function POST(request) {
  try {
    const { messages, systemPrompt } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 });
    }

    // Check Ollama is reachable first
    try {
      const ping = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!ping.ok) throw new Error('Ollama not reachable');
    } catch {
      return NextResponse.json({
        error: `Ollama is not running. Start it with: ollama serve\nThen pull a model: ollama pull ${OLLAMA_MODEL}\nOllama URL: ${OLLAMA_BASE}`,
      }, { status: 503 });
    }

    // Ollama /api/chat — OpenAI-compatible messages format
    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-10),
        ],
        options: {
          temperature: 0.7,
          num_predict: 1500,
        },
      }),
      signal: AbortSignal.timeout(120000), // 2 min timeout for local inference
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Ollama error:', response.status, errText);

      // Friendly message if model not pulled yet
      if (response.status === 404 || errText.includes('not found')) {
        return NextResponse.json({
          error: `Model "${OLLAMA_MODEL}" not found. Run: ollama pull ${OLLAMA_MODEL}`,
        }, { status: 404 });
      }
      return NextResponse.json({ error: `Ollama error ${response.status}: ${errText}` }, { status: response.status });
    }

    // Ollama streams NDJSON: {"message":{"role":"assistant","content":"token"},"done":false}
    // Re-emit as OpenAI-compatible SSE so the client code stays unchanged
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const parsed = JSON.parse(trimmed);
                const token = parsed.message?.content;
                if (token) {
                  // Re-emit as OpenAI-compatible SSE chunk
                  const chunk = JSON.stringify({ choices: [{ delta: { content: token } }] });
                  controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                }
                if (parsed.done) {
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                }
              } catch { /* skip malformed lines */ }
            }
          }
        } catch (e) {
          controller.error(e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e) {
    console.error('POST /api/ai-advisor:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
