'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildIncomeTaxExport } from '@/lib/taxExport';
import styles from './TaxReportView.module.css';

export default function IncomeTaxExport({ holdings, fy, trades }) {
  const [open, setOpen] = useState(false);
  const [classifications, setClassifications] = useState({});
  const [copyNotice, setCopyNotice] = useState('');
  const downloadLink = useRef(null);
  const preview = useMemo(() => {
    if (!open || fy === 'ALL') return null;
    try { return { data: buildIncomeTaxExport(holdings, { fy, classifications, trades }) }; }
    catch (error) { return { error: error.message }; }
  }, [holdings, fy, classifications, trades, open]);
  const data = preview?.data;
  const symbols = [...new Set(data?.gains.map(g => g.instrument.symbol) || [])];
  useEffect(() => {
    if (!data || !downloadLink.current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    downloadLink.current.href = url;
    return () => URL.revokeObjectURL(url);
  }, [data]);
  return <section style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16 }}>
    <button className={styles.exportBtn} type="button" disabled={fy === 'ALL'} onClick={() => setOpen(!open)}>Export for Income Tax</button>
    {fy === 'ALL' && <p>Select one financial year to export.</p>}
    {open && <>
      <h3>Income Tax Export · FY {fy}</h3>
      <p>Verify the complete trade history, cost basis, corporate actions, exemptions and STT conditions. PortFin does not store tax eligibility. Choices below apply only to this export.</p>
      <p>The Income Tax Calculator currently supports FY 2026-27 only. Other years can be exported for reconciliation but cannot yet be imported there.</p>
      {preview?.error && <p role="alert">{preview.error}</p>}
      {symbols.map(symbol => <label key={symbol} style={{ display: 'block', margin: '8px 0' }}>{symbol}{' '}
        <select className={styles.fySelect} style={{ maxWidth: '100%' }} value={classifications[symbol] || ''} onChange={e => { setCopyNotice(''); setClassifications(prev => ({ ...prev, [symbol]: e.target.value })); }}>
          <option value="">Not verified — review required</option>
          <option value="equity">Verified eligible listed equity / equity-oriented fund, including STT</option>
          <option value="otherSTCG">Verified all exported lots are other STCG at normal rates</option>
          <option value="112">Verified all exported lots qualify for general Section 112 LTCG</option>
        </select>
      </label>)}
      {data && <>
        <p>Gross gains / losses (no set-off or annual exemption applied):</p>
        {Object.entries(data.summary).map(([kind, value]) => <p key={kind} className="mono-privacy">{({ section111A: '111A STCG', section112A: '112A LTCG', otherSTCG: 'Other STCG', otherLTCG: 'Other LTCG', review: 'Unclassified' })[kind]}: ₹{value.gain.toLocaleString('en-IN')} / ₹{value.loss.toLocaleString('en-IN')}</p>)}
        <p>Transactions / gains: {data.reconciliation.transactionCount} / {data.gains.length}. Review required: {data.reconciliation.reviewCount}.</p>
        <ul>{[...new Set([...data.warnings, ...data.gains.filter(g => g.reason).map(g => g.reason)])].map(w => <li key={w}>{w}</li>)}</ul>
        {data.gains.some(g => g.gain < 0) && <p>Capital losses require separate set-off review. The calculator will withhold the estimate.</p>}
        {trades.length >= 1000 && <p role="alert">The trade loading limit was reached. This export will require completeness review.</p>}
        <a className={styles.exportBtn} ref={downloadLink} download={`portfin-tax-export-FY${fy}.json`}>Download JSON</a>{' '}
        <button className={styles.exportBtn} type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(JSON.stringify(data, null, 2)); setCopyNotice('Copied. In Income Tax Calculator choose Paste PortFin JSON, then review the preview.'); }
          catch { setCopyNotice('Clipboard unavailable. Open View JSON below and copy the text manually.'); }
        }}>Copy JSON</button>
        {copyNotice && <p role="status">{copyNotice}</p>}
        <details><summary>View JSON if downloads are unavailable</summary><textarea aria-label="PortFin export JSON" readOnly value={JSON.stringify(data, null, 2)} rows={8} style={{ width: '100%' }} /></details>
      </>}
      <button className={styles.exportBtn} type="button" onClick={() => setOpen(false)}>Cancel</button>
    </>}
  </section>;
}
