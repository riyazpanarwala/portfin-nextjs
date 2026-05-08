'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt } from '@/lib/store';
import { useTradeForm } from '@/hooks/useTradeForm';
import styles from './TradeForm.module.css';

export function TradeForm() {
  const { addTrade, deleteTrade, trades, portfolioId } = usePortfolio();

  const {
    form, setField, handleAssetTypeChange,
    submitting, success, deleteId,
    suggestions, showSug, setShowSug, sugLoading,
    pickSuggestion, handleSubmit, handleDelete,
    recentTrades, txValue, canSubmit,
  } = useTradeForm({ addTrade, deleteTrade, trades });

  const submitLabel = submitting
    ? '⏳ Saving…'
    : success
    ? '✅ Saved!'
    : `${form.tradeType === 'BUY' ? '📈 Buy' : '📉 Sell'} — Record Trade`;

  return (
    <div className="fade-up">
      <div className={styles.layout}>

        {/* ── Form ── */}
        <div className={`glass ${styles.formPanel}`}>
          <div className={styles.formTitle}>Record Trade</div>
          <div className={styles.formSub}>
            Add a buy or sell transaction · Instrument is auto-matched from NSE / AMFI database
          </div>

          {/* Asset type + Trade type */}
          <div className={styles.typeRow}>
            <Field label="Asset Type">
              <select
                value={form.assetType}
                onChange={e => handleAssetTypeChange(e.target.value)}
              >
                <option value="STOCK">Equity / ETF (NSE/BSE)</option>
                <option value="MF">Mutual Fund (AMFI)</option>
              </select>
            </Field>
            <Field label="Trade Type">
              <select value={form.tradeType} onChange={e => setField('tradeType', e.target.value)}>
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </select>
            </Field>
          </div>

          {/* Symbol with autocomplete */}
          <Field label={form.assetType === 'MF' ? 'Fund Name' : 'NSE Symbol'}>
            <div className={styles.symbolWrapper}>
              <input
                value={form.symbol}
                onChange={e => { setField('symbol', e.target.value.toUpperCase()); setField('name', ''); }}
                onFocus={() => suggestions.length && setShowSug(true)}
                onBlur={() => setTimeout(() => setShowSug(false), 200)}
                placeholder={form.assetType === 'MF' ? 'e.g. ABSLVF (start typing name)' : 'e.g. INFY, BEL, SUZLON'}
                autoComplete="off"
              />
              {sugLoading && <span className={styles.searchingLabel}>searching…</span>}

              {showSug && suggestions.length > 0 && (
                <div className={styles.suggestionsDropdown}>
                  {suggestions.map((inst, i) => (
                    <div key={i} className={styles.suggestionItem} onMouseDown={() => pickSuggestion(inst)}>
                      <div>
                        <div className={styles.suggestionSymbol}>{inst.symbol}</div>
                        <div className={styles.suggestionName}>{inst.name}</div>
                      </div>
                      <div>
                        <div className={styles.suggestionExchange}>{inst.exchange}</div>
                        {inst.price && (
                          <div className={styles.suggestionPrice}>₹{fmt(parseFloat(inst.price))}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {form.name && form.name !== form.symbol && (
              <div className={styles.fieldNote}>{form.name}</div>
            )}
          </Field>

          <Field label="Sector / Category">
            <input
              value={form.sector}
              onChange={e => setField('sector', e.target.value)}
              placeholder={form.assetType === 'MF' ? 'e.g. Large Cap, ELSS' : 'e.g. Power, Defence'}
            />
          </Field>

          <div className={styles.twoCol}>
            <Field label={form.assetType === 'MF' ? 'Units' : 'Quantity'}>
              <input
                type="number" min="0" step="any"
                value={form.quantity}
                onChange={e => setField('quantity', e.target.value)}
                placeholder="100"
              />
            </Field>
            <Field label={form.assetType === 'MF' ? 'NAV (₹)' : 'Price (₹)'}>
              <input
                type="number" min="0" step="any"
                value={form.price}
                onChange={e => setField('price', e.target.value)}
                placeholder="500.00"
              />
            </Field>
          </div>

          <div className={styles.twoCol}>
            <Field label="Brokerage (₹, optional)">
              <input
                type="number" min="0" step="any"
                value={form.brokerage}
                onChange={e => setField('brokerage', e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Trade Date">
              <input type="date" value={form.tradeDate} onChange={e => setField('tradeDate', e.target.value)} />
            </Field>
          </div>

          {txValue != null && (
            <div className={styles.txPreview}>
              <span className={styles.txPreviewLabel}>Transaction value</span>
              <span className={styles.txPreviewValue}>{fmtCr(txValue)}</span>
            </div>
          )}

          <button
            className={`btn btn-primary ${styles.submitBtn}`}
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{ opacity: !canSubmit ? 0.6 : 1 }}
          >
            {submitLabel}
          </button>
        </div>

        {/* ── Recent trades ── */}
        <div className={`glass ${styles.recentPanel}`}>
          <div className={styles.recentPanelHeader}>
            <span className={styles.recentPanelTitle}>Recent Trades</span>
            <span className={styles.recentPanelCount}>{trades.length} total</span>
          </div>

          {recentTrades.length === 0 ? (
            <div className={styles.recentEmpty}>No trades yet. Add your first trade above.</div>
          ) : recentTrades.map((t, i) => (
            <div key={t.id} className={styles.tradeRow}>
              <div className={styles.tradeRowLeft}>
                <span className={`chip ${t.tradeType === 'BUY' ? 'chip-green' : 'chip-red'}`}>{t.tradeType}</span>
                <span className={`chip ${t.assetType === 'MF' ? 'chip-blue' : 'chip-purple'}`}>{t.assetType}</span>
                <div>
                  <div className={styles.tradeSymbol} title={t.name || t.symbol}>
                    {t.symbol}
                    {t.name && t.name !== t.symbol && (
                      <span className={styles.tradeName}>{t.name.slice(0, 28)}</span>
                    )}
                  </div>
                  <div className={styles.tradeMeta}>
                    {t.tradeDate} · {parseFloat(t.quantity)} × ₹{fmt(parseFloat(t.price), 1)}
                  </div>
                </div>
              </div>
              <div className={styles.tradeRowRight}>
                <div className={styles.tradeValue}>
                  {fmtCr(parseFloat(t.quantity) * parseFloat(t.price))}
                </div>
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(t.id)}
                  disabled={deleteId === t.id}
                >
                  {deleteId === t.id ? '…' : '✕'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}
