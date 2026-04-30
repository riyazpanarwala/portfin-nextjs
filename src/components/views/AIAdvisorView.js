'use client';

import { useState, useRef, useEffect } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, fmtPct } from '@/lib/store';

// ── Suggested prompts ─────────────────────────────────────────────────────────
const SUGGESTED = [
  { icon: '🔍', text: 'Analyse my overall portfolio health and biggest risks' },
  { icon: '⚖️', text: 'Should I rebalance? Which holdings are over/under weight?' },
  { icon: '💰', text: 'How much LTCG tax will I owe this FY and how can I minimise it?' },
  { icon: '📈', text: 'Which funds are underperforming their category benchmark?' },
  { icon: '🎯', text: 'Am I on track for a ₹5 crore corpus in 15 years with my current SIP?' },
  { icon: '🏦', text: 'Compare my MF returns to Nifty 50 — am I beating the index?' },
];

// ── Build a rich portfolio context string for the AI ─────────────────────────
function buildContext(trades, holdings, stats, mfHoldings, stHoldings, taxData) {
  const topMF = [...mfHoldings].sort((a, b) => b.marketValue - a.marketValue).slice(0, 10);
  const topST = [...stHoldings].sort((a, b) => b.marketValue - a.marketValue).slice(0, 10);

  const mfLines = topMF.map(h =>
    `  • ${h.symbol} (${h.sector || 'General'}): invested ₹${fmt(h.invested, 0)}, value ₹${fmt(h.marketValue, 0)}, return ${fmt(h.returnPct, 1)}%, CAGR ${fmt(h.cagr, 1)}%, held ${Math.round(h.holdingDays / 30)}m`
  ).join('\n');

  const stLines = topST.map(h =>
    `  • ${h.symbol} (${h.sector || 'Other'}): invested ₹${fmt(h.invested, 0)}, value ₹${fmt(h.marketValue, 0)}, return ${fmt(h.returnPct, 1)}%, CAGR ${fmt(h.cagr, 1)}%, held ${Math.round(h.holdingDays / 30)}m`
  ).join('\n');

  const ltcgHoldings = taxData.filter(h => h.isLTCG);
  const stcgHoldings = taxData.filter(h => !h.isLTCG);
  const totalTax     = taxData.reduce((s, h) => s + h.tax, 0);
  const harvestable  = taxData.filter(h => h.gain < 0).map(h => h.symbol).join(', ');

  return `
PORTFOLIO SUMMARY (Indian Equity & Mutual Fund Portfolio):
  • Total Value: ₹${fmt(stats.totalValue, 0)} (${fmtCr(stats.totalValue)})
  • Total Invested: ₹${fmt(stats.totalInvested, 0)}
  • Overall Gain/Loss: ₹${fmt(stats.totalGain, 0)} (${fmt(stats.totalReturnPct, 2)}%)
  • Overall CAGR: ${fmt(stats.overallCagr, 2)}%
  • MF Value: ${fmtCr(stats.mfValue)} (${fmt(stats.mfPct, 1)}% of portfolio), CAGR ${fmt(stats.mfCagr, 2)}%
  • Stock Value: ${fmtCr(stats.stValue)} (${fmt(stats.stPct, 1)}% of portfolio)
  • Holdings: ${stats.fundCount} mutual funds + ${stats.stockCount} stocks

TOP MUTUAL FUNDS:
${mfLines || '  (none)'}

TOP STOCKS:
${stLines || '  (none)'}

TAX PROFILE:
  • LTCG holdings (>1yr, taxed at 12.5% above ₹1.25L): ${ltcgHoldings.length} assets
  • STCG holdings (<1yr, taxed at 20%): ${stcgHoldings.length} assets
  • Estimated tax liability: ${fmtCr(totalTax)}
  • Loss harvesting candidates: ${harvestable || 'none'}

CONTEXT: This is an Indian retail investor portfolio. All amounts in INR. 
Tax rules: Indian FY (Apr–Mar), LTCG on equity 12.5% with ₹1.25L annual exemption, STCG 20%.
Exchange: NSE/BSE for stocks, AMFI for mutual funds.
`.trim();
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '16px',
      gap: '10px',
      alignItems: 'flex-start',
    }}>
      {!isUser && (
        <div style={{
          width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px', marginTop: '2px',
        }}>🤖</div>
      )}
      <div style={{
        maxWidth: '75%',
        background: isUser
          ? 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(139,92,246,0.15))'
          : 'var(--surface)',
        border: `1px solid ${isUser ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        padding: '12px 16px',
      }}>
        {msg.streaming ? (
          <StreamingText text={msg.content} />
        ) : (
          <FormattedMessage text={msg.content} />
        )}
        {msg.streaming && (
          <span style={{
            display: 'inline-block', width: '6px', height: '14px',
            background: 'var(--accent2)', marginLeft: '2px',
            animation: 'cursorBlink 0.7s step-end infinite',
            verticalAlign: 'middle', borderRadius: '1px',
          }} />
        )}
      </div>
      {isUser && (
        <div style={{
          width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
          background: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: '700', color: '#fff', marginTop: '2px',
        }}>U</div>
      )}
    </div>
  );
}

// Render markdown-ish formatting from the AI response
function FormattedMessage({ text }) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      elements.push(
        <div key={i} style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent2)', margin: '10px 0 4px', letterSpacing: '0.02em' }}>
          {line.slice(3)}
        </div>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <div key={i} style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text)', margin: '8px 0 2px' }}>
          {line.slice(4)}
        </div>
      );
    } else if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
      elements.push(
        <div key={i} style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text)', margin: '4px 0' }}>
          {line.slice(2, -2)}
        </div>
      );
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '8px', margin: '3px 0', paddingLeft: '4px' }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '1px' }}>›</span>
          <span style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: '1.6' }}>
            <InlineFormat text={line.slice(2)} />
          </span>
        </div>
      );
    } else if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\./)[1];
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '8px', margin: '3px 0', paddingLeft: '4px' }}>
          <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '11px', flexShrink: 0, minWidth: '16px', marginTop: '2px' }}>{num}.</span>
          <span style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: '1.6' }}>
            <InlineFormat text={line.replace(/^\d+\.\s/, '')} />
          </span>
        </div>
      );
    } else if (line === '') {
      elements.push(<div key={i} style={{ height: '6px' }} />);
    } else {
      elements.push(
        <div key={i} style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: '1.7', margin: '2px 0' }}>
          <InlineFormat text={line} />
        </div>
      );
    }
    i++;
  }

  return <div>{elements}</div>;
}

function InlineFormat({ text }) {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} style={{ color: 'var(--text)', fontWeight: '700' }}>{part.slice(2, -2)}</strong>;
        }
        // Inline code: `text`
        const codeParts = part.split(/(`[^`]+`)/g);
        return codeParts.map((cp, j) => {
          if (cp.startsWith('`') && cp.endsWith('`')) {
            return <code key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'rgba(59,130,246,0.15)', padding: '1px 5px', borderRadius: '3px', color: 'var(--accent2)' }}>{cp.slice(1, -1)}</code>;
          }
          return cp;
        });
      })}
    </>
  );
}

function StreamingText({ text }) {
  return (
    <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
      {text}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AIAdvisorView() {
  const { trades, holdings, stats, mfHoldings, stHoldings, taxData } = usePortfolio();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `👋 Hi! I'm your AI portfolio advisor. I have full context of your ${stats.fundCount + stats.stockCount} holdings worth ${fmtCr(stats.totalValue)}.\n\nAsk me anything — tax planning, rebalancing, performance analysis, or goal projections. I'll give you specific, actionable advice based on your actual data.`,
    }
  ]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const bottomRef                 = useRef(null);
  const inputRef                  = useRef(null);
  const portfolioContext          = buildContext(trades, holdings, stats, mfHoldings, stHoldings, taxData);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text) {
    const userText = (text || input).trim();
    if (!userText || loading) return;

    setInput('');
    setError(null);

    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setLoading(true);

    // Add streaming placeholder
    const streamingId = Date.now();
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true, id: streamingId }]);

    try {
      const systemPrompt = `You are an expert Indian stock market and mutual fund portfolio advisor. You have deep knowledge of:
- NSE/BSE listed equities, sector analysis, and Indian market dynamics
- SEBI-registered mutual fund categories (Large Cap, Mid Cap, Small Cap, Flexi Cap, ELSS, etc.)
- Indian tax laws: LTCG (12.5% above ₹1.25L for equity held >1yr), STCG (20% for <1yr), indexation for debt funds
- SIP strategies, step-up SIPs, and goal-based investing
- Portfolio rebalancing, XIRR vs CAGR, and risk-adjusted returns
- Indian financial year (April–March)

Here is the user's actual portfolio data:
${portfolioContext}

Guidelines:
- Give specific, data-driven advice referencing actual numbers from the portfolio
- Use ₹ symbol and Indian number formatting (lakhs, crores)
- Be concise but thorough — use bullet points and headers for clarity
- Highlight risks candidly
- Always caveat that you're an AI and not a SEBI-registered advisor
- When suggesting actions, be specific (e.g., "increase your Parag Parikh allocation from 12% to 18%")`;

      // Build message history for context (last 10 messages)
      const historyForAPI = newMessages.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Call our Next.js proxy route — avoids CORS and keeps API key server-side
      const response = await fetch('/api/ai-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyForAPI,
          systemPrompt,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${response.status}`);
      }

      // Stream the response — OpenAI SSE: data: {"choices":[{"delta":{"content":"..."}}]}
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              accumulated += token;
              setMessages(prev => prev.map(m =>
                m.id === streamingId ? { ...m, content: accumulated } : m
              ));
            }
          } catch { /* skip malformed chunks */ }
        }
      }

      // Finalise message (remove streaming flag)
      setMessages(prev => prev.map(m =>
        m.id === streamingId ? { role: 'assistant', content: accumulated, streaming: false } : m
      ));
    } catch (err) {
      console.error('AI Advisor error:', err);
      setError(err.message);
      // Remove streaming placeholder on error
      setMessages(prev => prev.filter(m => m.id !== streamingId));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages([{
      role: 'assistant',
      content: `Chat cleared. I still have full context of your ${stats.fundCount + stats.stockCount} holdings. What would you like to explore?`,
    }]);
  }

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', gap: '12px' }}>
      <style>{`
        @keyframes cursorBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .msg-appear { animation: fadeInUp 0.25s ease forwards; }
      `}</style>

      {/* Header strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
          }}>🤖</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)' }}>AI Portfolio Advisor</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
              Powered by Ollama (local) · {stats.fundCount} funds + {stats.stockCount} stocks loaded
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '8px' }}>
            <span className="live-dot" />
            <span style={{ fontSize: '10px', color: 'var(--green2)' }}>Context loaded</span>
          </div>
        </div>
        <button onClick={clearChat} className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: '11px' }}>
          ↺ Clear chat
        </button>
      </div>

      {/* Context pill */}
      <div style={{
        display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0,
      }}>
        {[
          { label: 'Portfolio', value: fmtCr(stats.totalValue) },
          { label: 'Return', value: `${stats.totalReturnPct >= 0 ? '+' : ''}${fmt(stats.totalReturnPct, 1)}%` },
          { label: 'CAGR', value: `${fmt(stats.overallCagr, 1)}%` },
          { label: 'MF CAGR', value: `${fmt(stats.mfCagr, 1)}%` },
          { label: 'Holdings', value: `${stats.fundCount + stats.stockCount}` },
        ].map((p, i) => (
          <div key={i} style={{
            padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', gap: '5px', alignItems: 'center',
          }}>
            <span style={{ color: 'var(--text3)' }}>{p.label}:</span>
            <span style={{ color: 'var(--accent2)', fontFamily: 'var(--font-mono)', fontWeight: '700' }}>{p.value}</span>
          </div>
        ))}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px',
        background: 'var(--bg2)', borderRadius: '12px',
        border: '1px solid var(--border)',
        scrollbarWidth: 'thin',
      }}>
        {messages.map((msg, i) => (
          <div key={i} className="msg-appear">
            <MessageBubble msg={msg} />
          </div>
        ))}
        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: '8px', margin: '8px 0',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
            fontSize: '12px', color: 'var(--red2)', lineHeight: '1.8',
          }}>
            {error.includes('ollama serve') || error.includes('Ollama is not running') ? (
              <div>
                <div style={{ fontWeight: '700', marginBottom: '8px' }}>⚠ Ollama is not running</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div><span style={{ color: 'var(--text3)' }}>1. Install Ollama →</span> <a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent2)' }}>ollama.com</a></div>
                  <div><span style={{ color: 'var(--text3)' }}>2. Start it →</span> <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: '3px' }}>ollama serve</code></div>
                  <div><span style={{ color: 'var(--text3)' }}>3. Pull model →</span> <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: '3px' }}>ollama pull llama3.2</code></div>
                  <div style={{ marginTop: '4px', color: 'var(--text3)', fontSize: '10px' }}>Then try again — no API key or internet needed.</div>
                </div>
              </div>
            ) : error.includes('not found') || error.includes('Model') ? (
              <div>
                <div style={{ fontWeight: '700', marginBottom: '6px' }}>⚠ Model not downloaded yet</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  Run: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: '3px' }}>ollama pull llama3.2</code>
                  <span style={{ color: 'var(--text3)', marginLeft: '8px' }}>(~2GB download)</span>
                </div>
              </div>
            ) : (
              <div>⚠ {error}</div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested prompts */}
      {messages.length <= 2 && !loading && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Suggested questions
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {SUGGESTED.map((s, i) => (
              <button key={i} onClick={() => sendMessage(s.text)} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '8px 12px', cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.2s', display: 'flex', gap: '8px', alignItems: 'flex-start',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}
              >
                <span style={{ fontSize: '14px', flexShrink: 0 }}>{s.icon}</span>
                <span style={{ fontSize: '11px', color: 'var(--text2)', lineHeight: '1.5' }}>{s.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{
        display: 'flex', gap: '10px', flexShrink: 0,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '6px 6px 6px 14px',
        transition: 'border-color 0.2s',
      }}
        onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your portfolio… (Enter to send, Shift+Enter for new line)"
          rows={1}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            resize: 'none', fontFamily: 'var(--font-main)', fontSize: '13px',
            color: 'var(--text)', lineHeight: '1.6', padding: '6px 0',
            minHeight: '32px', maxHeight: '120px',
          }}
          onInput={e => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          style={{
            background: loading ? 'var(--bg3)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
            border: 'none', borderRadius: '8px', padding: '8px 16px',
            cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
            opacity: (!input.trim() || loading) ? 0.5 : 1,
            color: '#fff', fontSize: '13px', fontWeight: '600',
            display: 'flex', alignItems: 'center', gap: '6px',
            transition: 'all 0.2s', flexShrink: 0,
          }}
        >
          {loading ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
                <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              Thinking…
            </>
          ) : (
            <>Send ↑</>
          )}
        </button>
      </div>

      {/* Disclaimer */}
      <div style={{ fontSize: '10px', color: 'var(--text3)', textAlign: 'center', flexShrink: 0, paddingBottom: '4px' }}>
        AI advice is for informational purposes only. Not a SEBI-registered investment advisor. Always consult a qualified financial advisor before making investment decisions.
      </div>
    </div>
  );
}
