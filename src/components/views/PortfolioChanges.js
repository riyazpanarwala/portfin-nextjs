'use client';

import { useEffect, useState } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { CHANGE_PERIODS } from '@/lib/portfolioChanges';
import { fmt, fmtPct, colorPnl } from '@/lib/store';
import styles from './PortfolioChanges.module.css';

function ChangeValue({ value }) {
  if (value.gain == null) return <span className={styles.muted}>Unavailable</span>;
  return <span className="mono-privacy" style={{ color: colorPnl(value.gain) }}>
    {value.gain >= 0 ? '+' : '−'}₹{fmt(Math.abs(value.gain), 2)}
    <span className={styles.percent}> {value.percent == null ? '(—)' : `(${fmtPct(value.percent, true)})`}</span>
  </span>;
}

export default function PortfolioChanges() {
  const { portfolioId, trades, corporateActions, currentPrices } = usePortfolio();
  const [period, setPeriod] = useState('1D');
  const [filter, setFilter] = useState('all');
  const [requestState, setRequestState] = useState({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!portfolioId) return;
    const controller = new AbortController();
    fetch(`/api/portfolio-changes?portfolioId=${encodeURIComponent(portfolioId)}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load portfolio changes');
        if (!controller.signal.aborted) setRequestState({ data, portfolioId, trades, corporateActions, currentPrices, attempt });
      })
      .catch(error => {
        if (!controller.signal.aborted) setRequestState({ error: error.message, portfolioId, trades, corporateActions, currentPrices, attempt });
      });
    return () => controller.abort();
  }, [portfolioId, trades, corporateActions, currentPrices, attempt]);
  const ready = requestState.portfolioId === portfolioId && requestState.trades === trades && requestState.corporateActions === corporateActions && requestState.currentPrices === currentPrices && requestState.attempt === attempt;
  const data = ready ? requestState.data : null;
  const result = data?.periods[period];
  const rows = result?.rows.filter(row => filter === 'all' || row.assetType === filter) || [];
  return <section className={`glass ${styles.panel}`} aria-label="Portfolio changes">
    <div className={styles.header}>
      <div><h2>Portfolio Changes</h2><p>Gains and losses after accounting for money invested or withdrawn.</p></div>
      <div className={styles.periods} aria-label="Change period">
        {CHANGE_PERIODS.map(key => <button key={key} type="button" aria-pressed={period === key} onClick={() => setPeriod(key)}>{key}</button>)}
      </div>
    </div>
    {!ready ? <p role="status">Loading price history…</p> : requestState.error ? <p role="alert">{requestState.error} <button type="button" onClick={() => setAttempt(a => a + 1)}>Retry</button></p> : result && <>
      <div className={styles.cards}>{[['Overall', result.overall], ['Mutual Funds', result.mf], ['Stocks', result.stocks]].map(([label, value]) => <div className={styles.card} key={label}>
        <div className={styles.label}>{label}</div><strong><ChangeValue value={value} /></strong>
        <div className={styles.muted}>{value.covered}/{value.count} positions covered</div>
      </div>)}</div>
      <div className={styles.toolbar}><label>Holdings <select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All</option><option value="MF">Mutual Funds</option><option value="STOCK">Stocks</option></select></label>
        <button type="button" onClick={() => setAttempt(a => a + 1)}>Reload</button></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Holding</th><th>Type</th><th>Gain / Loss</th><th>Comparison dates</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.instrumentId}><td>{row.name}<div className={styles.muted}>{row.symbol}</div></td><td>{row.assetType === 'MF' ? 'MF' : 'Stock'}</td>
          <td><ChangeValue value={row} />{row.reason && <div className={styles.muted}>{row.reason}</div>}</td>
          <td className={styles.muted}>{row.baselinePriceDate || row.start} → {row.priceDate || '—'}</td></tr>)}</tbody></table></div>
      {!rows.length && <p className={styles.muted}>No positions in this selection.</p>}
      <p className={styles.note}>As of {data.asOf}. 1D compares each holding with its previous published close or NAV; funds and stocks may have different price dates. Other periods use prices on or before the calendar boundary. Includes realized gains and recorded fees; excludes unrecorded dividends. Percentages use cash-flow-weighted capital (Modified Dietz), not annualized returns. A dash means there is no positive capital base. Incomplete price coverage makes the affected total unavailable.</p>
    </>}
  </section>;
}
