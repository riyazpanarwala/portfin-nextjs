'use client';

import React, { useState, useMemo } from 'react';
import {
  ReceiptIndianRupee,
  Download,
  Info,
  Calendar,
  TrendingUp,
  PieChart,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Scale,
} from 'lucide-react';
import { usePortfolio } from '@/context/PortfolioContext';
import {
  computeCapitalGainsReport,
  fmt,
  fmtCr,
  colorPnl,
} from '@/lib/store';
import styles from './TaxReportView.module.css';

export default function TaxReportView() {
  const { holdings = [], isDiscreet } = usePortfolio();

  // Selected Financial Year (Default: '2026-27')
  const [selectedFy, setSelectedFy] = useState('2026-27');
  // Asset category filter: 'ALL' | 'STOCK' | 'MF'
  const [filterAsset, setFilterAsset] = useState('ALL');
  // Expanded lots state
  const [expandedRows, setExpandedRows] = useState({});

  // Compute full capital gains report for selected FY
  const report = useMemo(() => {
    return computeCapitalGainsReport(holdings, { fy: selectedFy });
  }, [holdings, selectedFy]);

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter sells table by asset type
  const displayedSells = useMemo(() => {
    if (!report.sells) return [];
    if (filterAsset === 'ALL') return report.sells;
    return report.sells.filter(s => s.assetType === filterAsset);
  }, [report.sells, filterAsset]);

  // CSV Export
  const handleExportCsv = () => {
    if (!report.sells || report.sells.length === 0) return;

    const headers = [
      'Sell Date',
      'Asset Type',
      'Symbol',
      'Security Name',
      'Exchange',
      'Units Sold',
      'Sell Price',
      'Sale Proceeds',
      'Cost Basis (FIFO)',
      'Realized Gain/Loss',
      'Term',
      'Matched Buy Date',
      'Matched Buy Price',
      'Holding Days',
    ];

    const rows = [];
    for (const s of report.sells) {
      if (s.matchedLots && s.matchedLots.length > 0) {
        for (const m of s.matchedLots) {
          rows.push([
            s.date,
            s.assetType === 'MF' ? 'Mutual Fund (Switch/Redemption)' : 'Equity Stock',
            s.symbol,
            `"${(s.name || s.symbol).replace(/"/g, '""')}"`,
            s.exchange || '',
            m.qty,
            s.sellPrice,
            (m.qty * s.sellPrice).toFixed(2),
            (m.costBasis || 0).toFixed(2),
            (m.gain || 0).toFixed(2),
            m.taxType,
            m.buyDate,
            m.buyPrice,
            m.holdDays,
          ]);
        }
      } else {
        rows.push([
          s.date,
          s.assetType === 'MF' ? 'Mutual Fund (Switch/Redemption)' : 'Equity Stock',
          s.symbol,
          `"${(s.name || s.symbol).replace(/"/g, '""')}"`,
          s.exchange || '',
          s.qty,
          s.sellPrice,
          (s.totalProceeds || s.qty * s.sellPrice).toFixed(2),
          (s.totalCost || 0).toFixed(2),
          (s.netGain || s.realized || 0).toFixed(2),
          s.taxType,
          '',
          '',
          '',
        ]);
      }
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `portfin-capital-gains-report-FY${selectedFy}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isCurrentFy = selectedFy === '2026-27';

  return (
    <div className={styles.taxRoot}>
      {/* Header bar */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <div className={styles.titleWithBadge}>
            <ReceiptIndianRupee size={20} color="var(--accent2)" />
            <span className={styles.titleText}>Income Tax & Capital Gains Schedule</span>
            <span className={styles.budgetBadge}>BUDGET 2024 REGIME</span>
          </div>
          <div className={styles.subtitle}>
            Equity LTCG @ 12.5% (Sec 112A, ₹1.25L exempt) · STCG @ 20% (Sec 111A) · Cess @ 4%
          </div>
        </div>

        <div className={styles.controlsArea}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} color="var(--text3)" />
            <select
              className={styles.fySelect}
              value={selectedFy}
              onChange={(e) => setSelectedFy(e.target.value)}
            >
              {report.availableFys.map(f => (
                <option key={f} value={f}>
                  FY {f} {f === '2026-27' ? '(Current / AY 2027-28)' : f === '2025-26' ? '(AY 2026-27)' : ''}
                </option>
              ))}
              <option value="ALL">All Financial Years</option>
            </select>
          </div>

          <button
            className={styles.exportBtn}
            onClick={handleExportCsv}
            disabled={!report.sells || report.sells.length === 0}
            title="Export Schedule CG format to CSV"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        {/* Total Realized */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>
            <span>Net Realized P&L</span>
            <Scale size={14} />
          </div>
          <div
            className={`${styles.kpiValue} mono-privacy`}
            style={{ color: colorPnl(report.totalRealized) }}
          >
            {fmtCr(report.totalRealized)}
          </div>
          <div className={styles.kpiSub}>
            <div className={styles.kpiSubRow}>
              <span>Total Transactions:</span>
              <span className="mono-privacy" style={{ fontWeight: 600 }}>{report.sells.length}</span>
            </div>
            <div className={styles.kpiSubRow}>
              <span>Gross Gains:</span>
              <span className="mono-privacy" style={{ color: 'var(--green2)' }}>
                +{fmtCr(report.grossLtcg + report.grossStcg)}
              </span>
            </div>
            <div className={styles.kpiSubRow}>
              <span>Gross Losses:</span>
              <span className="mono-privacy" style={{ color: 'var(--red2)' }}>
                -{fmtCr(report.grossLtcl + report.grossStcl)}
              </span>
            </div>
          </div>
        </div>

        {/* LTCG */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>
            <span>Long-Term Gains (LTCG)</span>
            <span className={styles.tagLTCG}>12.5%</span>
          </div>
          <div
            className={`${styles.kpiValue} mono-privacy`}
            style={{ color: colorPnl(report.netLtcg) }}
          >
            {fmtCr(report.netLtcg)}
          </div>
          <div className={styles.kpiSub}>
            <div className={styles.kpiSubRow}>
              <span>Sec 112A Exemption:</span>
              <span className="mono-privacy" style={{ color: 'var(--green2)' }}>
                {fmtCr(report.exemptLtcg)} / ₹1.25L
              </span>
            </div>
            <div className={styles.kpiSubRow}>
              <span>Taxable LTCG:</span>
              <span className="mono-privacy" style={{ fontWeight: 700 }}>
                {fmtCr(report.taxableLtcg)}
              </span>
            </div>
            <div className={styles.kpiSubRow}>
              <span>LTCG Tax @ 12.5%:</span>
              <span className="mono-privacy" style={{ color: report.ltcgTax > 0 ? 'var(--red2)' : 'var(--text2)' }}>
                {fmtCr(report.ltcgTax)}
              </span>
            </div>
          </div>
        </div>

        {/* STCG */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>
            <span>Short-Term Gains (STCG)</span>
            <span className={styles.tagSTCG}>20.0%</span>
          </div>
          <div
            className={`${styles.kpiValue} mono-privacy`}
            style={{ color: colorPnl(report.netStcg) }}
          >
            {fmtCr(report.netStcg)}
          </div>
          <div className={styles.kpiSub}>
            <div className={styles.kpiSubRow}>
              <span>Gross STCG:</span>
              <span className="mono-privacy">+{fmtCr(report.grossStcg)}</span>
            </div>
            <div className={styles.kpiSubRow}>
              <span>Gross STCL:</span>
              <span className="mono-privacy" style={{ color: 'var(--red2)' }}>
                -{fmtCr(report.grossStcl)}
              </span>
            </div>
            <div className={styles.kpiSubRow}>
              <span>STCG Tax @ 20%:</span>
              <span className="mono-privacy" style={{ color: report.stcgTax > 0 ? 'var(--red2)' : 'var(--text2)' }}>
                {fmtCr(report.stcgTax)}
              </span>
            </div>
          </div>
        </div>

        {/* Total Tax Payable */}
        <div className={styles.kpiCard} style={{
          borderColor: report.totalTax === 0 ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.4)',
          background: report.totalTax === 0 ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.04)',
        }}>
          <div className={styles.kpiLabel}>
            <span>Estimated Tax Payable</span>
            <ShieldCheck size={15} color={report.totalTax === 0 ? 'var(--green2)' : 'var(--red2)'} />
          </div>
          <div
            className={`${styles.kpiValue} mono-privacy`}
            style={{ color: report.totalTax === 0 ? 'var(--green2)' : 'var(--red2)' }}
          >
            {report.totalTax === 0 ? '₹0.00' : fmtCr(report.totalTax)}
          </div>
          <div className={styles.kpiSub}>
            <div className={styles.kpiSubRow}>
              <span>Base Tax:</span>
              <span className="mono-privacy">{fmtCr(report.baseTax)}</span>
            </div>
            <div className={styles.kpiSubRow}>
              <span>4% Cess:</span>
              <span className="mono-privacy">{fmtCr(report.cess)}</span>
            </div>
            <div className={styles.kpiSubRow}>
              <span>Status:</span>
              {report.totalTax === 0 ? (
                <span className={styles.taxZeroBadge}>ZERO LIABILITY</span>
              ) : (
                <span style={{ color: 'var(--red2)', fontWeight: 700 }}>TAX DUE</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Explainer / Highlights banner */}
      <div className={styles.explainerBanner}>
        <Info className={styles.explainerIcon} size={18} />
        <div className={styles.explainerContent}>
          <strong>Tax Analysis for FY {selectedFy}:</strong>{' '}
          {report.sells.length === 0 ? (
            'No sell trades or mutual fund redemptions found for this financial year.'
          ) : report.totalTax === 0 ? (
            <>
              Your net taxable capital gains liability is <strong>₹0.00</strong>. Your net LTCG of{' '}
              <strong>{fmtCr(report.netLtcg)}</strong> falls entirely within the annual{' '}
              <strong>₹1,25,000 Section 112A exemption limit</strong>.
              {report.grossLtcl > 0 && (
                <> Furthermore, <strong>{fmtCr(report.ltclUsedAgainstLtcg)}</strong> of Long-Term Capital Loss was set off against Long-Term Capital Gains.</>
              )}
              {report.netStcg < 0 && (
                <> You also have a net Short-Term Capital Loss of <strong>{fmtCr(Math.abs(report.netStcg))}</strong> that can be carried forward for up to 8 assessment years.</>
              )}
            </>
          ) : (
            <>
              Your estimated capital gains tax is <strong>{fmtCr(report.totalTax)}</strong> (Base Tax: {fmtCr(report.baseTax)} + 4% Cess: {fmtCr(report.cess)}).
              {report.exemptLtcg > 0 && <> The first <strong>{fmtCr(report.exemptLtcg)}</strong> of LTCG was exempted under Section 112A.</>}
            </>
          )}
        </div>
      </div>

      {/* Inter-head Loss Set-off Schedule & Asset Breakdown */}
      {report.sells.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          {/* Loss Set-Off Schedule */}
          <div className={styles.setOffCard}>
            <div className={styles.sectionHeading}>
              <CheckCircle2 size={16} color="var(--green2)" />
              <span>Loss Set-off & Carry-Forward Summary</span>
            </div>
            <div className={styles.setOffGrid}>
              <div className={styles.setOffItem}>
                <div className={styles.setOffTitle}>
                  <span>LTCL Set Off against LTCG</span>
                  <span className={styles.setOffAmount} style={{ color: 'var(--green2)' }}>
                    {fmtCr(report.ltclUsedAgainstLtcg)}
                  </span>
                </div>
                <div className={styles.setOffDesc}>
                  Long-term losses set off intra-head against long-term gains.
                </div>
              </div>

              <div className={styles.setOffItem}>
                <div className={styles.setOffTitle}>
                  <span>STCL Set Off against STCG/LTCG</span>
                  <span className={styles.setOffAmount} style={{ color: 'var(--yellow)' }}>
                    {fmtCr(report.stclUsedAgainstStcg + report.stclUsedAgainstLtcg)}
                  </span>
                </div>
                <div className={styles.setOffDesc}>
                  Short-term losses set off against STCG ({fmtCr(report.stclUsedAgainstStcg)}) and LTCG ({fmtCr(report.stclUsedAgainstLtcg)}).
                </div>
              </div>

              <div className={styles.setOffItem}>
                <div className={styles.setOffTitle}>
                  <span>Unabsorbed Loss for Carry-Forward</span>
                  <span className={styles.setOffAmount} style={{ color: (report.unabsorbedStcl + report.unabsorbedLtcl) > 0 ? 'var(--accent2)' : 'var(--text3)' }}>
                    {fmtCr(report.unabsorbedStcl + report.unabsorbedLtcl)}
                  </span>
                </div>
                <div className={styles.setOffDesc}>
                  Eligible to carry forward for up to 8 assessment years (STCL: {fmtCr(report.unabsorbedStcl)}, LTCL: {fmtCr(report.unabsorbedLtcl)}).
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown by Stocks vs Mutual Funds */}
          <div className={styles.setOffCard}>
            <div className={styles.sectionHeading}>
              <PieChart size={16} color="var(--accent2)" />
              <span>Asset Category Split</span>
            </div>
            <div className={styles.setOffGrid}>
              <div className={styles.setOffItem}>
                <div className={styles.setOffTitle}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <TrendingUp size={14} color="var(--accent2)" /> Equity Stocks
                  </span>
                  <span
                    className={`${styles.setOffAmount} mono-privacy`}
                    style={{ color: colorPnl(report.breakdown.stocks.total) }}
                  >
                    {fmtCr(report.breakdown.stocks.total)}
                  </span>
                </div>
                <div className={styles.setOffDesc}>
                  LTCG: {fmtCr(report.breakdown.stocks.ltcg)} · STCG: {fmtCr(report.breakdown.stocks.stcg)}
                </div>
              </div>

              <div className={styles.setOffItem}>
                <div className={styles.setOffTitle}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PieChart size={14} color="#c084fc" /> Mutual Funds (Switch/Redemption)
                  </span>
                  <span
                    className={`${styles.setOffAmount} mono-privacy`}
                    style={{ color: colorPnl(report.breakdown.mf.total) }}
                  >
                    {fmtCr(report.breakdown.mf.total)}
                  </span>
                </div>
                <div className={styles.setOffDesc}>
                  LTCG: {fmtCr(report.breakdown.mf.ltcg)} · STCG: {fmtCr(report.breakdown.mf.stcg)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className={styles.filterBar}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginRight: 4 }}>
          Filter Assets:
        </span>
        {[
          { key: 'ALL', label: `All Transactions (${report.sells.length})` },
          { key: 'STOCK', label: `Equity Stocks (${report.sells.filter(s => s.assetType === 'STOCK').length})` },
          { key: 'MF', label: `Mutual Funds (${report.sells.filter(s => s.assetType === 'MF').length})` },
        ].map(tab => (
          <button
            key={tab.key}
            className={`${styles.filterBtn} ${filterAsset === tab.key ? styles.filterBtnActive : ''}`}
            onClick={() => setFilterAsset(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Transactions Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.taxTable}>
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th style={{ textAlign: 'left' }}>Sell Date</th>
                <th style={{ textAlign: 'left' }}>Asset / Symbol</th>
                <th>Type</th>
                <th>Units</th>
                <th style={{ textAlign: 'right' }}>Sell Price</th>
                <th style={{ textAlign: 'right' }}>Proceeds</th>
                <th style={{ textAlign: 'right' }}>Cost Basis (FIFO)</th>
                <th style={{ textAlign: 'right' }}>Gain / Loss</th>
                <th>Tax Term</th>
              </tr>
            </thead>
            <tbody>
              {displayedSells.length === 0 ? (
                <tr>
                  <td colSpan={10} className={styles.emptyState}>
                    No sell or switch transactions found matching this filter.
                  </td>
                </tr>
              ) : (
                displayedSells.map((s, idx) => {
                  const isExpanded = !!expandedRows[idx];
                  const hasLots = s.matchedLots && s.matchedLots.length > 0;
                  const isMF = s.assetType === 'MF';

                  return (
                    <React.Fragment key={idx}>
                      <tr>
                        <td style={{ textAlign: 'center', cursor: hasLots ? 'pointer' : 'default' }} onClick={() => hasLots && toggleRow(idx)}>
                          {hasLots && (
                            isExpanded ? <ChevronDown size={14} color="var(--text3)" /> : <ChevronRight size={14} color="var(--text3)" />
                          )}
                        </td>
                        <td style={{ textAlign: 'left', fontWeight: 600 }}>{s.date}</td>
                        <td style={{ textAlign: 'left' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{s.symbol}</span>
                            <span style={{ fontSize: 10, color: 'var(--text3)' }}>{s.exchange}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.name}
                          </div>
                        </td>
                        <td>
                          {isMF ? (
                            <span className={styles.tagMF}>MF Switch</span>
                          ) : (
                            <span className={styles.tagStock}>Stock</span>
                          )}
                        </td>
                        <td className="mono-privacy" style={{ textAlign: 'center' }}>{fmt(s.qty, isMF ? 3 : 0)}</td>
                        <td className="mono-privacy" style={{ textAlign: 'right' }}>₹{fmt(s.sellPrice, 2)}</td>
                        <td className="mono-privacy" style={{ textAlign: 'right' }}>₹{fmt(s.totalProceeds, 2)}</td>
                        <td className="mono-privacy" style={{ textAlign: 'right' }}>₹{fmt(s.totalCost, 2)}</td>
                        <td
                          className="mono-privacy"
                          style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: colorPnl(s.netGain),
                          }}
                        >
                          {s.netGain >= 0 ? '+' : ''}₹{fmt(s.netGain, 2)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={s.taxType === 'LTCG' ? styles.tagLTCG : styles.tagSTCG}>
                            {s.taxType}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded Lots Details */}
                      {isExpanded && hasLots && (
                        <tr className={styles.lotDetailsRow}>
                          <td colSpan={10}>
                            <div className={styles.lotDetailsContainer}>
                              <div style={{ fontWeight: 700, color: 'var(--accent2)', marginBottom: 4 }}>
                                Matched Buy Lots (FIFO Basis):
                              </div>
                              <table className={styles.lotSubTable}>
                                <thead>
                                  <tr>
                                    <th>Buy Date</th>
                                    <th>Units Matched</th>
                                    <th>Purchase Price</th>
                                    <th>Cost Basis</th>
                                    <th>Days Held</th>
                                    <th>Term</th>
                                    <th style={{ textAlign: 'right' }}>Gain / Loss</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.matchedLots.map((m, mIdx) => (
                                    <tr key={mIdx}>
                                      <td>{m.buyDate}</td>
                                      <td className="mono-privacy">{fmt(m.qty, isMF ? 3 : 0)}</td>
                                      <td className="mono-privacy">₹{fmt(m.buyPrice, 2)}</td>
                                      <td className="mono-privacy">₹{fmt(m.costBasis, 2)}</td>
                                      <td>{m.holdDays} days</td>
                                      <td>
                                        <span className={m.taxType === 'LTCG' ? styles.tagLTCG : styles.tagSTCG}>
                                          {m.taxType}
                                        </span>
                                      </td>
                                      <td
                                        className="mono-privacy"
                                        style={{
                                          textAlign: 'right',
                                          fontWeight: 600,
                                          color: colorPnl(m.gain),
                                        }}
                                      >
                                        {m.gain >= 0 ? '+' : ''}₹{fmt(m.gain, 2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
