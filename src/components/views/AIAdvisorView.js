'use client';

import { useState, useRef, useEffect } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, fmtPct } from '@/lib/store';
import styles from '@/components/ui/UI.module.css';

// ── Portfolio context builder ─────────────────────────────────────────────────

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

// ── Suggested prompts ─────────────────────────────────────────────────────────

const SUGGESTED = [
  { icon: '🔍', text: 'Analyse my overall portfolio health and biggest risks' },
  { icon: '⚖️', text: 'Should I rebalance? Which holdings are over/under weight?' },
  { icon: '💰', text: 'How much LTCG tax will I owe this FY and how can I minimise it?' },
  { icon: '📈', text: 'Which funds are underperforming their category benchmark?' },
  { icon: '🎯', text: 'Am I on track for a ₹5 crore corpus in 15 years with my current SIP?' },
  { icon: '🏦', text: 'Compare my MF returns to Nifty 50 — am I beating the index?' },
];

// ── Message rendering ─────────────────────────────────────────────────────────

function InlineFormat({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} style={{ color: 'var(--text)', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
        }
        const codeParts = part.split(/(`[^`]+`)/g);
        return codeParts.map((cp, j) => {
          if (cp.startsWith('`') && cp.endsWith('`')) {
            return <code key={j} className={styles.fmtCode}>{cp.slice(1, -1)}</code>;
          }
          return cp;
        });
      })}
    </>
  );
}

function FormattedMessage({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div>
      {lines.map((line, i) => {
        if (line.startsWith('## '))
          return <div key={i} className={styles.fmtH2}>{line.slice(3)}</div>;
        if (line.startsWith('### '))
          return <div key={i} className={styles.fmtH3}>{line.slice(4)}</div>;
        if (line.startsWith('**') && line.endsWith('**') && line.length > 4)
          return <div key={i} className={styles.fmtBold}>{line.slice(2, -2)}</div>;
        if (line.startsWith('- ') || line.startsWith('• '))
          return (
            <div key={i} className={styles.fmtBullet}>
              <span className={styles.fmtBulletArrow}>›</span>
              <span className={styles.fmtBulletText}><InlineFormat text={line.slice(2)} /></span>
            </div>
          );
        if (line.match(/^\d+\.\s/)) {
          const num = line.match(/^(\d+)\./)[1];
          return (
            <div key={i} className={styles.fmtBullet}>
              <span className={styles.fmtBulletArrow} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, minWidth: 16 }}>{num}.</span>
              <span className={styles.fmtBulletText}><InlineFormat text={line.replace(/^\d+\.\s/, '')} /></span>
            </div>
          );
        }
        if (line === '') return <div key={i} className={styles.fmtSpacer} />;
        return <div key={i} className={styles.fmtParagraph}><InlineFormat text={line} /></div>;
      })}
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`${styles.messageBubbleRow} ${isUser ? styles.messageBubbleRowUser : styles.messageBubbleRowAssistant}`}>
      {!isUser && (
        <div className={`${styles.messageAvatar} ${styles.messageAvatarAssistant}`}>🤖</div>
      )}
      <div className={`${styles.messageBubble} ${isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant}`}>
        {msg.streaming
          ? <span className={styles.streamingText}>{msg.content}</span>
          : <FormattedMessage text={msg.content} />
        }
        {msg.streaming && <span className={styles.streamingCursor} />}
      </div>
      {isUser && (
        <div className={`${styles.messageAvatar} ${styles.messageAvatarUser}`}>U</div>
      )}
    </div>
  );
}

// ── Error display ─────────────────────────────────────────────────────────────

function ErrorDisplay({ error }) {
  if (!error) return null;
  const isOllama = error.includes('ollama serve') || error.includes('Ollama is not running');
  const isModel  = error.includes('not found') || error.includes('Model');

  return (
    <div className={styles.errorBox}>
      {isOllama ? (
        <>
          <div className={styles.errorTitle}>⚠ Ollama is not running</div>
          <div className={styles.errorCode}>
            <div><span className={styles.errorCodeLine}>1. Install Ollama →</span> <a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent2)' }}>ollama.com</a></div>
            <div><span className={styles.errorCodeLine}>2. Start it →</span> <code className={styles.fmtCode}>ollama serve</code></div>
            <div><span className={styles.errorCodeLine}>3. Pull model →</span> <code className={styles.fmtCode}>ollama pull llama3.2</code></div>
            <div className={styles.errorCodeNote}>Then try again — no API key or internet needed.</div>
          </div>
        </>
      ) : isModel ? (
        <>
          <div className={styles.errorTitle}>⚠ Model not downloaded yet</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            Run: <code className={styles.fmtCode}>ollama pull llama3.2</code>
            <span style={{ color: 'var(--text3)', marginLeft: 8 }}>(~2GB download)</span>
          </div>
        </>
      ) : (
        <div>⚠ {error}</div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AIAdvisorView() {
  const { trades, holdings, stats, mfHoldings, stHoldings, taxData } = usePortfolio();

  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: `👋 Hi! I'm your AI portfolio advisor. I have full context of your ${stats.fundCount + stats.stockCount} holdings worth ${fmtCr(stats.totalValue)}.\n\nAsk me anything — tax planning, rebalancing, performance analysis, or goal projections. I'll give you specific, actionable advice based on your actual data.`,
  }]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const bottomRef             = useRef(null);
  const inputRef              = useRef(null);

  const portfolioContext = buildContext(trades, holdings, stats, mfHoldings, stHoldings, taxData);

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

      const historyForAPI = newMessages.slice(-10).map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/ai-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyForAPI, systemPrompt }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${response.status}`);
      }

      const reader  = response.body.getReader();
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
              setMessages(prev => prev.map(m => m.id === streamingId ? { ...m, content: accumulated } : m));
            }
          } catch { /* skip malformed */ }
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === streamingId ? { role: 'assistant', content: accumulated, streaming: false } : m
      ));
    } catch (err) {
      console.error('AI Advisor error:', err);
      setError(err.message);
      setMessages(prev => prev.filter(m => m.id !== streamingId));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function clearChat() {
    setMessages([{
      role: 'assistant',
      content: `Chat cleared. I still have full context of your ${stats.fundCount + stats.stockCount} holdings. What would you like to explore?`,
    }]);
  }

  const contextPills = [
    { label: 'Portfolio', value: fmtCr(stats.totalValue) },
    { label: 'Return',    value: `${stats.totalReturnPct >= 0 ? '+' : ''}${fmt(stats.totalReturnPct, 1)}%` },
    { label: 'CAGR',      value: `${fmt(stats.overallCagr, 1)}%` },
    { label: 'MF CAGR',   value: `${fmt(stats.mfCagr, 1)}%` },
    { label: 'Holdings',  value: `${stats.fundCount + stats.stockCount}` },
  ];

  return (
    <div className={`fade-up ${styles.advisorWrapper}`} style={{ height: 'calc(100vh - 180px)' }}>

      {/* Header */}
      <div className={styles.advisorHeader}>
        <div className={styles.advisorHeaderLeft}>
          <div className={styles.advisorAvatar}>🤖</div>
          <div>
            <div className={styles.advisorTitle}>AI Portfolio Advisor</div>
            <div className={styles.advisorSubtitle}>
              Powered by Ollama (local) · {stats.fundCount} funds + {stats.stockCount} stocks loaded
            </div>
          </div>
          <div className={styles.advisorLiveIndicator}>
            <span className="live-dot" />
            <span className={styles.advisorLiveLabel}>Context loaded</span>
          </div>
        </div>
        <button onClick={clearChat} className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}>
          ↺ Clear chat
        </button>
      </div>

      {/* Context pills */}
      <div className={styles.advisorContextPills}>
        {contextPills.map((p, i) => (
          <div key={i} className={styles.advisorContextPill}>
            <span className={styles.advisorContextPillLabel}>{p.label}:</span>
            <span className={styles.advisorContextPillValue}>{p.value}</span>
          </div>
        ))}
      </div>

      {/* Messages */}
      <div className={styles.messagesArea}>
        {messages.map((msg, i) => (
          <div key={i} style={{ animation: 'fadeInUp 0.25s ease forwards' }}>
            <MessageBubble msg={msg} />
          </div>
        ))}
        <ErrorDisplay error={error} />
        <div ref={bottomRef} />
      </div>

      {/* Suggested prompts */}
      {messages.length <= 2 && !loading && (
        <div className={styles.suggestedSection}>
          <div className={styles.suggestedLabel}>Suggested questions</div>
          <div className={styles.suggestedGrid}>
            {SUGGESTED.map((s, i) => (
              <button key={i} onClick={() => sendMessage(s.text)} className={styles.suggestedBtn}>
                <span className={styles.suggestedBtnIcon}>{s.icon}</span>
                <span className={styles.suggestedBtnText}>{s.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className={styles.inputBar}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your portfolio… (Enter to send, Shift+Enter for new line)"
          rows={1}
          className={styles.inputTextarea}
          onInput={e => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
        />
        <button onClick={() => sendMessage()} disabled={!input.trim() || loading} className={styles.sendBtn}>
          {loading ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
                <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              Thinking…
            </>
          ) : 'Send ↑'}
        </button>
      </div>

      <div className={styles.advisorDisclaimer}>
        AI advice is for informational purposes only. Not a SEBI-registered investment advisor.
        Always consult a qualified financial advisor before making investment decisions.
      </div>
    </div>
  );
}
