'use client';

import { useState, useEffect } from 'react';
import { fmt } from '@/lib/store';

export default function CorporateActionModal({ isOpen, onClose, holdings = [], onSuccess }) {
  const [symbol, setSymbol] = useState('');
  const [actionType, setActionType] = useState('SPLIT');
  const [num, setNum] = useState(5);
  const [den, setDen] = useState(1);
  const [exDate, setExDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (holdings.length > 0 && !symbol) {
      setSymbol(holdings[0].symbol);
    }
  }, [holdings, symbol]);

  if (!isOpen) return null;

  const handlePreview = async () => {
    if (!symbol) return setError('Please select a stock symbol.');
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setPreviewData(null);

    try {
      const res = await fetch('/api/corporate-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          actionType,
          ratioNumerator: num,
          ratioDenominator: den,
          exDate: exDate || undefined,
          preview: true,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to generate preview.');
      setPreviewData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!symbol) return setError('Please select a stock symbol.');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/corporate-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          actionType,
          ratioNumerator: num,
          ratioDenominator: den,
          exDate: exDate || undefined,
          preview: false,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to apply corporate action.');

      setSuccessMsg(json.message);
      setPreviewData(null);
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 1800);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="glass"
        style={{
          width: '100%',
          maxWidth: 620,
          borderRadius: 12,
          padding: 24,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚡</span> Execute Corporate Action (Split / Bonus)
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{ padding: 10, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 12, marginBottom: 14 }}>
            ⚠ {error}
          </div>
        )}

        {successMsg && (
          <div style={{ padding: 10, borderRadius: 6, background: 'rgba(16,185,129,0.1)', color: '#10B981', fontSize: 12, marginBottom: 14 }}>
            ✓ {successMsg}
          </div>
        )}

        {/* Form Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          {/* Select Stock */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
              STOCK SYMBOL
            </label>
            <select
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value);
                setPreviewData(null);
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 12,
                borderRadius: 6,
                background: 'var(--bg3)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
            >
              {holdings.map((h) => (
                <option key={h.symbol} value={h.symbol}>
                  {h.symbol} ({h.name})
                </option>
              ))}
            </select>
          </div>

          {/* Action Type */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
              ACTION TYPE
            </label>
            <select
              value={actionType}
              onChange={(e) => {
                setActionType(e.target.value);
                setPreviewData(null);
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 12,
                borderRadius: 6,
                background: 'var(--bg3)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
            >
              <option value="SPLIT">Stock Split (1 : N)</option>
              <option value="BONUS">Bonus Issue (N : M)</option>
              <option value="REVERSE_SPLIT">Reverse Split (N : 1)</option>
            </select>
          </div>

          {/* Ratio Numerator & Denominator */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
              RATIO (New Shares : Old Shares)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min="1"
                value={num}
                onChange={(e) => setNum(e.target.value)}
                style={{ width: '100%', padding: '8px', fontSize: 12, borderRadius: 6, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
              <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>:</span>
              <input
                type="number"
                min="1"
                value={den}
                onChange={(e) => setDen(e.target.value)}
                style={{ width: '100%', padding: '8px', fontSize: 12, borderRadius: 6, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
            </div>
          </div>

          {/* Ex-Date Filter */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
              EX-DATE (Optional)
            </label>
            <input
              type="date"
              value={exDate}
              onChange={(e) => setExDate(e.target.value)}
              placeholder="All trades if empty"
              style={{ width: '100%', padding: '8px', fontSize: 12, borderRadius: 6, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)' }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            onClick={handlePreview}
            disabled={loading}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 6,
              background: 'var(--bg3)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {loading ? 'Processing…' : '🔍 Preview Impact'}
          </button>

          {previewData && (
            <button
              onClick={handleApply}
              disabled={loading}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 6,
                background: '#10B981',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {loading ? 'Applying…' : '✓ Confirm & Apply Action'}
            </button>
          )}
        </div>

        {/* Preview Results Table */}
        {previewData && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#3B82F6' }}>
              Preview Impact: {previewData.affectedCount} trade lot(s) affected (Multiplier: {previewData.multiplier}x)
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: 6 }}>DATE</th>
                    <th style={{ padding: 6 }}>TYPE</th>
                    <th style={{ padding: 6, textAlign: 'right' }}>OLD QTY</th>
                    <th style={{ padding: 6, textAlign: 'right' }}>OLD PRICE</th>
                    <th style={{ padding: 6, textAlign: 'right', color: '#10B981' }}>NEW QTY</th>
                    <th style={{ padding: 6, textAlign: 'right', color: '#10B981' }}>NEW PRICE</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.trades.map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 6 }}>{t.tradeDate}</td>
                      <td style={{ padding: 6, fontWeight: 700, color: t.tradeType === 'BUY' ? '#10B981' : '#EF4444' }}>{t.tradeType}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{t.oldQty}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>₹{fmt(t.oldPrice, 2)}</td>
                      <td style={{ padding: 6, textAlign: 'right', fontWeight: 700, color: '#10B981' }}>{t.newQty}</td>
                      <td style={{ padding: 6, textAlign: 'right', fontWeight: 700, color: '#10B981' }}>₹{fmt(t.newPrice, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
