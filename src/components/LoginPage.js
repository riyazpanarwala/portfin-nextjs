'use client';

/**
 * components/LoginPage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Login screen that matches PortFin's dark navy aesthetic.
 * Uses the same CSS variables and glass-morphism style as the rest of the app.
 */

import { useState } from 'react';
import { WalletCards, Eye, EyeOff, Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const { login, error, setError } = useAuth();

  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e?.preventDefault();
    if (!email || !password || submitting) return;
    setSubmitting(true);
    await login(email, password);
    setSubmitting(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit();
  }

  return (
    <main style={{
      minHeight:       '100vh',
      background:      'var(--bg)',
      display:         'flex',
      flexDirection:   'column',
      alignItems:      'center',
      justifyContent:  'center',
      padding:         '24px',
      backgroundImage: `
        linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px)
      `,
      backgroundSize:  '40px 40px',
    }}>

      {/* Card */}
      <div className="glass" style={{
        width:        '100%',
        maxWidth:     440,
        padding:      '40px',
        borderRadius: 16,
        border:       '1px solid var(--border)',
        boxShadow:    '0 32px 80px rgba(0,0,0,0.5)',
        animation:    'fadeUp 0.4s ease forwards',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36 }}>
          <div style={{
            width:        46, height: 46, minWidth: 46,
            background:   'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            borderRadius: 12,
            display:      'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow:    '0 8px 24px rgba(59,130,246,0.35)',
          }}>
            <WalletCards size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{
              fontSize:    22, fontWeight: 800,
              letterSpacing: '0.06em',
              color:       'var(--text)',
              fontFamily:  'var(--font-display)',
              margin: 0,
            }}>
              PORTFIN
            </h1>
            <div style={{ fontSize: 10, color: 'var(--accent2)', fontWeight: 700, letterSpacing: '0.14em', marginTop: 2 }}>
              BY PANARWALA
            </div>
          </div>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px 0' }}>
            Welcome back
          </h2>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            Sign in to access your portfolio
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            display:      'flex', alignItems: 'center', gap: 8,
            padding:      '10px 14px',
            background:   'rgba(239,68,68,0.08)',
            border:       '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            marginBottom: 20,
            fontSize:     13, color: 'var(--red2)',
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Email */}
          <div>
            <label htmlFor="login-email" style={{
              display:       'block',
              fontSize:      11, fontWeight: 700,
              color:         'var(--text3)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              marginBottom:  6,
            }}>
              Email address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={14} style={{
                position: 'absolute', left: 12, top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text3)', pointerEvents: 'none',
              }} />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null); }}
                onKeyDown={handleKeyDown}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={submitting}
                style={{ paddingLeft: 36 }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="login-password" style={{
              display:       'block',
              fontSize:      11, fontWeight: 700,
              color:         'var(--text3)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              marginBottom:  6,
            }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={14} style={{
                position: 'absolute', left: 12, top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text3)', pointerEvents: 'none',
              }} />
              <input
                id="login-password"
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null); }}
                onKeyDown={handleKeyDown}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={submitting}
                style={{ paddingLeft: 36, paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                tabIndex={-1}
                aria-label={showPwd ? "Hide password" : "Show password"}
                style={{
                  position:   'absolute', right: 10, top: '50%',
                  transform:  'translateY(-50%)',
                  background: 'none', border: 'none',
                  cursor:     'pointer', color: 'var(--text3)',
                  padding:    4, display: 'flex',
                }}
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="btn btn-primary"
            style={{
              width:          '100%',
              justifyContent: 'center',
              padding:        '12px',
              fontSize:       14,
              marginTop:      4,
              opacity:        (submitting || !email || !password) ? 0.6 : 1,
              cursor:         (submitting || !email || !password) ? 'not-allowed' : 'pointer',
              letterSpacing:  '0.03em',
            }}
          >
            {submitting ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
                  <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Footer note */}
        <div style={{
          marginTop:  28, paddingTop: 20,
          borderTop:  '1px solid var(--border)',
          fontSize:   11, color: 'var(--text3)',
          textAlign:  'center', lineHeight: 1.8,
        }}>
          PortFin is a personal portfolio tracking tool by <strong>Panarwala</strong>.
          <br />
          Contact your admin if you need account access.
        </div>
      </div>

      {/* Version */}
      <div style={{
        marginTop: 20, fontSize: 11,
        color: 'var(--text3)', letterSpacing: '0.05em',
      }}>
        PortFin by Panarwala · Personal Dashboard
      </div>
    </main>
  );
}
