'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildIncomeTaxExport } from '@/lib/taxExport';
import { computeCapitalGainsReport } from '@/lib/store';
import { usePortfolio } from '@/context/PortfolioContext';
import styles from './TaxReportView.module.css';

export default function IncomeTaxExport({ holdings, fy, trades }) {
  const { portfolioId, refreshData } = usePortfolio();
  const [open, setOpen] = useState(false);
  const [savingEligibility, setSavingEligibility] = useState(false);
  const [eligibilityNotice, setEligibilityNotice] = useState('');
  const [excludedSales, setExcludedSales] = useState({});
  const [classifications, setClassifications] = useState({});
  const [copyNotice, setCopyNotice] = useState('');
  const downloadLink = useRef(null);
  const preview = useMemo(() => {
    if (!open || fy === 'ALL') return null;
    try { return { data: buildIncomeTaxExport(holdings, { fy, saleClassifications: classifications, trades }) }; }
    catch (error) { return { error: error.message }; }
  }, [holdings, fy, classifications, trades, open]);
  const data = preview?.data;
  const sales = [...new Map((data?.gains || []).map(g => [g.transaction, g])).values()];
  const pendingSales = useMemo(() => !open || fy === 'ALL' ? [] : computeCapitalGainsReport(holdings, { fy }).sells.filter(sale =>
    sale.id && sale.sttEligible == null && sale.taxCategory !== 'OTHER' && ['STOCK', 'MF'].includes(sale.assetType)), [holdings, fy, open]);
  const selectedSaleIds = pendingSales.filter(sale => !excludedSales[sale.id]).map(sale => sale.id);
  async function saveEligibility() {
    setSavingEligibility(true);
    setEligibilityNotice('');
    try {
      const response = await fetch('/api/trades/tax-eligibility', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolioId, saleIds: selectedSaleIds, confirmed: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save confirmation.');
      setClassifications({});
      await refreshData();
      setEligibilityNotice('Confirmation saved. These sales will be classified automatically on future exports.');
    } catch (error) { setEligibilityNotice(error.message); }
    finally { setSavingEligibility(false); }
  }
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
      <p>LTCG and STCG are calculated automatically from purchase and sale dates. Saved equity and STT confirmations are reused on future exports.</p>
      {pendingSales.length > 0 && <div style={{ margin: '12px 0' }}>
        <p>{pendingSales.length} sales do not yet have a saved confirmation. Confirm once that the selected sales qualify as listed equity or equity-oriented funds and meet applicable STT conditions.</p>
        <button type="button" className={styles.exportBtn} disabled={savingEligibility || !selectedSaleIds.length} onClick={saveEligibility}>
          {savingEligibility ? 'Saving…' : `Confirm and remember ${selectedSaleIds.length} eligible equity sales, including STT`}
        </button>
        <details><summary>Review or exclude sales before confirming</summary>
          {pendingSales.map(sale => <label key={sale.id} style={{ display: 'block', margin: '6px 0' }}>
            <input type="checkbox" checked={!excludedSales[sale.id]} disabled={savingEligibility} onChange={event => setExcludedSales(previous => ({ ...previous, [sale.id]: !event.target.checked }))} />{' '}
            {sale.symbol} · {sale.date} · {sale.qty} units
          </label>)}
        </details>
      </div>}
      {eligibilityNotice && <p role="status">{eligibilityNotice}</p>}
      <p>The Income Tax Calculator currently supports FY 2026-27 only. Other years can be exported for reconciliation but cannot yet be imported there.</p>
      {preview?.error && <p role="alert">{preview.error}</p>}
      {sales.length > 0 && <details><summary>Other classifications or exceptions (optional)</summary>
      {sales.map((sale, index) => <label key={sale.transaction} style={{ display: 'block', margin: '8px 0' }}>{sale.instrument.symbol} · {sale.sold} · Sale {index + 1}{' '}
        <select className={styles.fySelect} style={{ maxWidth: '100%' }} value={classifications[sale.transaction] || ''} onChange={e => { setCopyNotice(''); setClassifications(prev => ({ ...prev, [sale.transaction]: e.target.value })); }}>
          <option value="">Automatic — requires confirmed sale eligibility</option>
          <option value="equity">Verified eligible listed equity / equity-oriented fund, including STT</option>
          <option value="otherSTCG">Verified this sale is other STCG at normal rates</option>
          <option value="112">Verified this sale qualifies for general Section 112 LTCG</option>
        </select>
      </label>)}
      </details>}
      {data && <>
        <p>Gross gains / losses (no set-off or annual exemption applied):</p>
        {Object.entries(data.summary).map(([kind, value]) => <p key={kind} className="mono-privacy">{({ section111A: '111A STCG', section112A: '112A LTCG', otherSTCG: 'Other STCG', otherLTCG: 'Other LTCG', review: 'Unclassified' })[kind]}: ₹{value.gain.toLocaleString('en-IN')} / ₹{value.loss.toLocaleString('en-IN')}</p>)}
        <p>Transactions / gains: {data.reconciliation.transactionCount} / {data.gains.length}. Review required: {data.reconciliation.reviewCount}.</p>
        <ul>{[...new Set([...data.warnings, ...data.gains.filter(g => g.reason).map(g => g.reason)])].map(w => <li key={w}>{w}</li>)}</ul>
        {data.gains.some(g => g.gain < 0) && <p>Capital losses require separate set-off review. The calculator will withhold the estimate.</p>}
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
