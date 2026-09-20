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
  Sliders,
  Sparkles,
  FileSpreadsheet,
  FileCode,
  FileText,
  Copy,
  Check,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';
import { usePortfolio } from '@/context/PortfolioContext';
import {
  computeCapitalGainsReport,
  simulateTaxHarvesting,
  generateSchedule112ACsv,
  generateSchedule112AJson,
  generateSchedule111ACsv,
  generateHarvestingExecutionCsv,
  fmt,
  fmtCr,
  colorPnl,
} from '@/lib/store';
import styles from './TaxReportView.module.css';
import IncomeTaxExport from './IncomeTaxExport';

export default function TaxReportView() {
  const { holdings = [], trades = [], isDiscreet } = usePortfolio();

  // Active top-level view tab: 'REPORT' | 'SIMULATOR'
  const [activeTab, setActiveTab] = useState('REPORT');

  // Selected Financial Year (Default: '2026-27')
  const [selectedFy, setSelectedFy] = useState('2026-27');
  // Asset category filter: 'ALL' | 'STOCK' | 'MF'
  const [filterAsset, setFilterAsset] = useState('ALL');
  // Expanded lots state for report table
  const [expandedRows, setExpandedRows] = useState({});
  // Export menu open/close
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Simulator State
  const [simulatorStrategy, setSimulatorStrategy] = useState('OPTIMAL'); // 'OPTIMAL' | 'GAIN' | 'LOSS'
  const [lotOverrides, setLotOverrides] = useState({});
  const [copiedPlan, setCopiedPlan] = useState(false);

  // Compute full capital gains report for selected FY
  const report = useMemo(() => {
    return computeCapitalGainsReport(holdings, { fy: selectedFy });
  }, [holdings, selectedFy]);

  // Current FY report specifically for simulation baseline
  const currentFyReport = useMemo(() => {
    return computeCapitalGainsReport(holdings, { fy: '2026-27' });
  }, [holdings]);

  // Run harvesting simulation
  const simulation = useMemo(() => {
    return simulateTaxHarvesting(holdings, currentFyReport, lotOverrides, simulatorStrategy);
  }, [holdings, currentFyReport, lotOverrides, simulatorStrategy]);

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter sells table by asset type
  const displayedSells = useMemo(() => {
    if (!report.sells) return [];
    if (filterAsset === 'ALL') return report.sells;
    return report.sells.filter(s => s.assetType === filterAsset);
  }, [report.sells, filterAsset]);

  // Download helper
  const triggerDownload = (content, filename, type = 'text/csv;charset=utf-8;') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportMenuOpen(false);
  };

  // 1. Audit Schedule CG CSV Export
  const handleExportAuditCsv = () => {
    if (!report.sells || report.sells.length === 0) return;

    const headers = [
      'Sell Date',
      'Asset Type',
      'Symbol',
      'ISIN',
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
            s.isin || '',
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
          s.isin || '',
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

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    triggerDownload(csvContent, `portfin-capital-gains-audit-FY${selectedFy}.csv`);
  };

  // 2. Official Schedule 112A CSV Export
  const handleExportSchedule112ACsv = () => {
    const csvContent = generateSchedule112ACsv(report);
    triggerDownload(csvContent, `ITR2-Schedule-112A-FY${selectedFy}.csv`);
  };

  // 3. Schedule 112A JSON Export
  const handleExportSchedule112AJson = () => {
    const jsonContent = generateSchedule112AJson(report);
    triggerDownload(jsonContent, `ITR2-Schedule-112A-FY${selectedFy}.json`, 'application/json');
  };

  // 4. Official Schedule 111A (STCG) CSV Export
  const handleExportSchedule111ACsv = () => {
    const csvContent = generateSchedule111ACsv(report);
    triggerDownload(csvContent, `ITR2-Schedule-111A-STCG-FY${selectedFy}.csv`);
  };

  // 4. Simulator Execution Plan CSV Export
  const handleExportHarvestingPlan = () => {
    if (!simulation.orders || simulation.orders.length === 0) return;
    const csvContent = generateHarvestingExecutionCsv(simulation.orders);
    triggerDownload(csvContent, `portfin-tax-harvesting-execution-plan-FY2026-27.csv`);
  };

  // Copy plan to clipboard
  const handleCopyPlan = () => {
    if (!simulation.orders || simulation.orders.length === 0) return;
    const lines = [
      `PORTFIN TAX-HARVESTING EXECUTION PLAN (FY 2026-27)`,
      `Immediate Tax Saved: ₹${Math.round(simulation.impact.immediateTaxSaved).toLocaleString('en-IN')}`,
      `Total Estimated Proceeds: ₹${Math.round(simulation.impact.totalProceeds).toLocaleString('en-IN')}`,
      `Generated Orders:`,
      ...simulation.orders.map((o, idx) =>
        `${idx + 1}. SELL ${fmt(o.unitsToSell, o.assetType === 'MF' ? 3 : 0)} units of ${o.symbol} @ ₹${fmt(o.cmp, 2)} | Proceeds: ₹${fmt(o.estimatedProceeds, 2)} | P&L: ₹${fmt(o.gainOrLoss, 2)} (${o.taxType}) | Action: ${o.strategyAction}`
      ),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedPlan(true);
    setTimeout(() => setCopiedPlan(false), 2500);
  };

  // Simulator Lot interaction helpers
  const handleToggleLot = (lotKey) => {
    const current = simulation.effectiveSelections[lotKey] || { selected: false, harvestRatio: 1 };
    setLotOverrides(prev => ({
      ...prev,
      [lotKey]: {
        selected: !current.selected,
        harvestRatio: current.harvestRatio || 1,
      },
    }));
  };

  const handleRatioChange = (lotKey, harvestRatio) => {
    setLotOverrides(prev => ({
      ...prev,
      [lotKey]: {
        selected: true,
        harvestRatio: Math.max(0.01, Math.min(1, harvestRatio)),
      },
    }));
  };

  const handleSelectAllWinners = () => {
    const overrides = {};
    for (const lot of simulation.gainCandidates) {
      overrides[lot.lotKey] = { selected: true, harvestRatio: 1 };
    }
    setLotOverrides(overrides);
  };

  const handleSelectAllLosers = () => {
    const overrides = {};
    for (const lot of simulation.lossCandidates) {
      overrides[lot.lotKey] = { selected: true, harvestRatio: 1 };
    }
    setLotOverrides(overrides);
  };

  const handleResetSimulator = () => {
    setLotOverrides({});
  };

  return (
    <div className={styles.taxRoot}>
      {/* Top Header Row */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <div className={styles.titleWithBadge}>
            <ReceiptIndianRupee size={20} color="var(--accent2)" />
            <span className={styles.titleText}>Income Tax & Capital Gains Engine</span>
            <span className={styles.budgetBadge}>BUDGET 2024 REGIME</span>
          </div>
          <div className={styles.subtitle}>
            Equity LTCG @ 12.5% (Sec 112A, ₹1.25L exempt) · STCG @ 20% (Sec 111A) · Cess @ 4%
          </div>
        </div>

        <div className={styles.controlsArea}>
          {activeTab === 'REPORT' && (
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
          )}

          {activeTab === 'REPORT' ? (
            <div className={styles.exportMenuWrapper}>
              <button
                className={styles.exportBtn}
                onClick={() => setExportMenuOpen(prev => !prev)}
                disabled={!report.sells || report.sells.length === 0}
                title="Export tax reports in CSV / JSON formats"
              >
                <Download size={14} /> Export Tax Filing <ChevronDown size={12} />
              </button>
              {exportMenuOpen && (
                <div className={styles.exportDropdown}>
                  <button className={styles.exportDropdownItem} onClick={handleExportSchedule112ACsv}>
                    <FileSpreadsheet size={14} color="var(--green2)" />
                    <div>
                      <div style={{ fontWeight: 600 }}>ITR-2 Schedule 112A (CSV)</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>Official ITD format for CA & utilities</div>
                    </div>
                  </button>
                  <button className={styles.exportDropdownItem} onClick={handleExportSchedule112AJson}>
                    <FileCode size={14} color="var(--accent2)" />
                    <div>
                      <div style={{ fontWeight: 600 }}>Schedule 112A (JSON)</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>Ready for tax portal API e-filing</div>
                    </div>
                  </button>
                  <button className={styles.exportDropdownItem} onClick={handleExportSchedule111ACsv}>
                    <FileSpreadsheet size={14} color="var(--yellow)" />
                    <div>
                      <div style={{ fontWeight: 600 }}>ITR-2 Schedule 111A (STCG CSV)</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>Consolidated summary + scrip-wise for CA</div>
                    </div>
                  </button>
                  <button className={styles.exportDropdownItem} onClick={handleExportAuditCsv}>
                    <FileText size={14} color="var(--teal)" />
                    <div>
                      <div style={{ fontWeight: 600 }}>Detailed Schedule CG Audit (CSV)</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>Complete lot-by-lot FIFO matching</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              className={styles.exportBtn}
              onClick={handleExportHarvestingPlan}
              disabled={simulation.orders.length === 0}
            >
              <Download size={14} /> Export Plan (CSV)
            </button>
          )}
        </div>
      </div>

      {activeTab === 'REPORT' && <IncomeTaxExport key={selectedFy} holdings={holdings} trades={trades} fy={selectedFy} />}
      {/* Top Navigation Tabs */}
      <div className={styles.navTabBar}>
        <button
          className={`${styles.navTabBtn} ${activeTab === 'REPORT' ? styles.navTabBtnActive : ''}`}
          onClick={() => setActiveTab('REPORT')}
        >
          <FileSpreadsheet size={15} />
          <span>Schedule CG & 112A Report</span>
        </button>
        <button
          className={`${styles.navTabBtn} ${activeTab === 'SIMULATOR' ? styles.navTabBtnSimulatorActive : ''}`}
          onClick={() => setActiveTab('SIMULATOR')}
        >
          <Sparkles size={15} />
          <span>Smart Tax-Harvesting Simulator</span>
          {simulation.candidateLots.length > 0 && (
            <span style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 10,
              background: 'rgba(16,185,129,0.2)',
              color: 'var(--green2)',
              fontWeight: 700,
            }}>
              {simulation.candidateLots.length} Lots
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: SCHEDULE CG & 112A REPORT */}
      {activeTab === 'REPORT' && (
        <>
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

          {/* Official Schedule 112A Summary Panel */}
          <div className={styles.schedule112ABox}>
            <div className={styles.schedule112AHeader}>
              <div className={styles.schedule112ATitle}>
                <FileSpreadsheet size={16} color="var(--accent2)" />
                <span>ITR-2 Schedule 112A Summary (Long-Term Capital Gains on Equities & Equity MFs)</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={styles.exportBtn}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={handleExportSchedule112ACsv}
                  disabled={!report.schedule112A || report.schedule112A.length === 0}
                >
                  <Download size={12} /> Schedule 112A CSV
                </button>
                <button
                  className={styles.exportBtn}
                  style={{ padding: '4px 10px', fontSize: 11, background: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.3)', color: 'var(--accent2)' }}
                  onClick={handleExportSchedule112AJson}
                  disabled={!report.schedule112A || report.schedule112A.length === 0}
                >
                  <FileCode size={12} /> JSON Format
                </button>
              </div>
            </div>

            <div className={styles.schedule112AGrid}>
              <div className={styles.schedule112ACell}>
                <div className={styles.schedule112ACellLabel}>Qualifying Sales</div>
                <div className={styles.schedule112ACellVal}>{report.schedule112A ? report.schedule112A.length : 0}</div>
              </div>
              <div className={styles.schedule112ACell}>
                <div className={styles.schedule112ACellLabel}>Full Value of Consideration</div>
                <div className={`${styles.schedule112ACellVal} mono-privacy`}>
                  ₹{fmt((report.schedule112A || []).reduce((s, r) => s + r.fullValueConsideration, 0), 2)}
                </div>
              </div>
              <div className={styles.schedule112ACell}>
                <div className={styles.schedule112ACellLabel}>Cost of Acquisition</div>
                <div className={`${styles.schedule112ACellVal} mono-privacy`}>
                  ₹{fmt((report.schedule112A || []).reduce((s, r) => s + r.costOfAcquisition, 0), 2)}
                </div>
              </div>
              <div className={styles.schedule112ACell}>
                <div className={styles.schedule112ACellLabel}>Section 112A Exemption</div>
                <div className={`${styles.schedule112ACellVal} mono-privacy`} style={{ color: 'var(--green2)' }}>
                  ₹{fmt(report.exemptLtcg, 2)}
                </div>
              </div>
              <div className={styles.schedule112ACell}>
                <div className={styles.schedule112ACellLabel}>Taxable LTCG @ 12.5%</div>
                <div className={`${styles.schedule112ACellVal} mono-privacy`} style={{ color: report.taxableLtcg > 0 ? 'var(--red2)' : 'var(--text)' }}>
                  ₹{fmt(report.taxableLtcg, 2)}
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

          {/* Inter-head Loss Set-off Schedule & Asset Split */}
          {report.sells.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
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
                    <th>ISIN</th>
                    <th>Type</th>
                    <th>Units</th>
                    <th style={{ textAlign: 'right' }}>Sell Price</th>
                    <th style={{ textAlign: 'right' }}>Proceeds</th>
                    <th style={{ textAlign: 'right' }}>Cost Basis</th>
                    <th style={{ textAlign: 'right' }}>Gain / Loss</th>
                    <th>Tax Term</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedSells.length === 0 ? (
                    <tr>
                      <td colSpan={11} className={styles.emptyState}>
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
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
                              {s.isin || '—'}
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
                              <td colSpan={11}>
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
        </>
      )}

      {/* TAB 2: SMART TAX-HARVESTING SIMULATOR */}
      {activeTab === 'SIMULATOR' && (
        <div className={styles.simulatorRoot}>
          {/* Strategy Selector Bar */}
          <div className={styles.strategyBar}>
            <div
              className={`${styles.strategyCard} ${simulatorStrategy === 'OPTIMAL' ? styles.strategyCardActive : ''}`}
              onClick={() => { setSimulatorStrategy('OPTIMAL'); setLotOverrides({}); }}
            >
              <div className={styles.strategyHeader}>
                <div className={styles.strategyTitle}>
                  <Sparkles size={16} color="var(--green2)" />
                  <span>Combined Optimal Strategy</span>
                </div>
                {simulatorStrategy === 'OPTIMAL' && <CheckCircle2 size={15} color="var(--green2)" />}
              </div>
              <div className={styles.strategyDesc}>
                Simultaneously offsets realized STCG & LTCG with available losses AND harvests winning LTCG lots up to your unused ₹1.25L exemption.
              </div>
            </div>

            <div
              className={`${styles.strategyCard} ${simulatorStrategy === 'GAIN' ? styles.strategyCardActive : ''}`}
              onClick={() => { setSimulatorStrategy('GAIN'); setLotOverrides({}); }}
            >
              <div className={styles.strategyHeader}>
                <div className={styles.strategyTitle}>
                  <TrendingUp size={16} color="var(--accent2)" />
                  <span>0% Tax Gain Harvesting (Step-Up)</span>
                </div>
                {simulatorStrategy === 'GAIN' && <CheckCircle2 size={15} color="var(--accent2)" />}
              </div>
              <div className={styles.strategyDesc}>
                Locks in unrealized LTCG gains within the annual ₹1.25L tax-free limit, permanently stepping up cost basis to CMP with zero tax liability.
              </div>
            </div>

            <div
              className={`${styles.strategyCard} ${simulatorStrategy === 'LOSS' ? styles.strategyCardActive : ''}`}
              onClick={() => { setSimulatorStrategy('LOSS'); setLotOverrides({}); }}
            >
              <div className={styles.strategyHeader}>
                <div className={styles.strategyTitle}>
                  <Scale size={16} color="var(--yellow)" />
                  <span>Tax-Loss Harvesting</span>
                </div>
                {simulatorStrategy === 'LOSS' && <CheckCircle2 size={15} color="var(--yellow)" />}
              </div>
              <div className={styles.strategyDesc}>
                Selects unrealized loss positions (STCL & LTCL) to wipe out current FY taxable capital gains, prioritized by 20% STCG savings.
              </div>
            </div>
          </div>

          {/* Live Impact Comparison Grid */}
          <div className={styles.impactGrid}>
            <div className={`${styles.impactCard} ${styles.impactCardHighlight}`}>
              <div className={styles.impactLabel}>
                <span>Immediate Tax Saved</span>
                <ShieldCheck size={15} color="var(--green2)" />
              </div>
              <div className={`${styles.impactValue} mono-privacy`} style={{ color: 'var(--green2)' }}>
                ₹{Math.round(simulation.impact.immediateTaxSaved).toLocaleString('en-IN')}
              </div>
              <div className={styles.impactSub}>
                <span>Current Tax: ₹{Math.round(simulation.baseline.totalTax).toLocaleString('en-IN')}</span>
                <span>Simulated: ₹{Math.round(simulation.simulated.totalTax).toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className={styles.impactCard}>
              <div className={styles.impactLabel}>
                <span>LTCG 0% Exemption Used</span>
                <span className={styles.tagLTCG}>Max ₹1.25L</span>
              </div>
              <div className={`${styles.impactValue} mono-privacy`}>
                ₹{Math.round(simulation.simulated.exemptLtcg).toLocaleString('en-IN')}
              </div>
              <div className={styles.impactSub}>
                <span>Baseline: ₹{Math.round(simulation.baseline.exemptLtcg).toLocaleString('en-IN')}</span>
                <span style={{ color: 'var(--accent2)' }}>+{fmtCr(simulation.impact.harvestedTaxFreeGains)} added</span>
              </div>
            </div>

            <div className={styles.impactCard}>
              <div className={styles.impactLabel}>
                <span>Future Tax Shielded</span>
                <TrendingUp size={14} color="var(--accent2)" />
              </div>
              <div className={`${styles.impactValue} mono-privacy`} style={{ color: 'var(--accent2)' }}>
                ₹{Math.round(simulation.impact.futureLtcgTaxShielded).toLocaleString('en-IN')}
              </div>
              <div className={styles.impactSub}>
                <span>Step-up gain: ₹{Math.round(simulation.impact.harvestedTaxFreeGains).toLocaleString('en-IN')}</span>
                <span>@ 12.5% future tax</span>
              </div>
            </div>

            <div className={styles.impactCard}>
              <div className={styles.impactLabel}>
                <span>Cash Released</span>
                <Scale size={14} />
              </div>
              <div className={`${styles.impactValue} mono-privacy`}>
                {fmtCr(simulation.impact.totalProceeds)}
              </div>
              <div className={styles.impactSub}>
                <span>{simulation.impact.selectedLotsCount} lot(s) selected</span>
                <span>Available to re-invest</span>
              </div>
            </div>
          </div>

          {/* Simulator Action & Presets Bar */}
          <div className={styles.simActionBar}>
            <div className={styles.presetBtnGroup}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginRight: 4 }}>
                Quick Presets:
              </span>
              <button className={styles.presetBtn} onClick={() => setLotOverrides({})}>
                <Sparkles size={12} color="var(--green2)" /> Auto-Recommend
              </button>
              <button className={styles.presetBtn} onClick={handleSelectAllWinners}>
                <TrendingUp size={12} color="var(--accent2)" /> All 0% Winners
              </button>
              <button className={styles.presetBtn} onClick={handleSelectAllLosers}>
                <Scale size={12} color="var(--yellow)" /> All Loss Offsets
              </button>
              <button className={styles.presetBtn} onClick={handleResetSimulator}>
                <RotateCcw size={12} /> Clear
              </button>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              Total Financial Benefit: <strong style={{ color: 'var(--green2)' }}>
                ₹{Math.round(simulation.impact.totalFinancialBenefit).toLocaleString('en-IN')}
              </strong> (Immediate Saved + Future Shielded)
            </div>
          </div>

          {/* Interactive Candidate Holdings Table */}
          <div className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={`${styles.taxTable} ${styles.candidateTable}`}>
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: 'center' }}>Harvest</th>
                    <th style={{ textAlign: 'left' }}>Asset / Symbol</th>
                    <th>Buy Date</th>
                    <th>Held</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Total Units</th>
                    <th style={{ textAlign: 'right' }}>CMP</th>
                    <th style={{ textAlign: 'right' }}>Cost Basis</th>
                    <th style={{ textAlign: 'right' }}>Unrealized P&L</th>
                    <th style={{ textAlign: 'center' }}>Harvest Qty</th>
                    <th style={{ textAlign: 'right' }}>Sale Value</th>
                    <th style={{ textAlign: 'right' }}>Gain / Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.candidateLots.length === 0 ? (
                    <tr>
                      <td colSpan={12} className={styles.emptyState}>
                        No open positions eligible for tax harvesting found in this portfolio.
                      </td>
                    </tr>
                  ) : (
                    simulation.candidateLots.map((lot) => {
                      const sel = simulation.effectiveSelections[lot.lotKey] || { selected: false, harvestRatio: 1 };
                      const isSelected = sel.selected;
                      const isMF = lot.assetType === 'MF';

                      return (
                        <tr
                          key={lot.lotKey}
                          className={isSelected ? styles.candidateRowSelected : ''}
                        >
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleLot(lot.lotKey)}
                              style={{ cursor: 'pointer', accentColor: 'var(--green2)' }}
                            />
                          </td>
                          <td style={{ textAlign: 'left' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{lot.symbol}</span>
                              <span className={lot.assetType === 'MF' ? styles.tagMF : styles.tagStock}>
                                {lot.assetType}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {lot.name}
                            </div>
                          </td>
                          <td>{lot.buyDate || '—'}</td>
                          <td>{lot.holdDays}d</td>
                          <td>
                            {lot.isGain && lot.isLTCG && (
                              <span className={styles.tagLTCG}>LTCG Winner (0%)</span>
                            )}
                            {lot.isLoss && !lot.isLTCG && (
                              <span className={styles.tagSTCG}>STCL Loser (20%)</span>
                            )}
                            {lot.isLoss && lot.isLTCG && (
                              <span className={styles.tagLTCG} style={{ color: 'var(--red2)', borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)' }}>
                                LTCL Loser (12.5%)
                              </span>
                            )}
                            {lot.isGain && !lot.isLTCG && (
                              <span className={styles.tagSTCG}>STCG Winner</span>
                            )}
                          </td>
                          <td className="mono-privacy" style={{ textAlign: 'right' }}>
                            {fmt(lot.qty, isMF ? 3 : 0)}
                          </td>
                          <td className="mono-privacy" style={{ textAlign: 'right' }}>
                            ₹{fmt(lot.cmp, 2)}
                          </td>
                          <td className="mono-privacy" style={{ textAlign: 'right' }}>
                            ₹{fmt(lot.costBasis, 2)}
                          </td>
                          <td
                            className="mono-privacy"
                            style={{
                              textAlign: 'right',
                              fontWeight: 700,
                              color: colorPnl(lot.unrealizedGain),
                            }}
                          >
                            {lot.unrealizedGain >= 0 ? '+' : ''}₹{fmt(lot.unrealizedGain, 2)}
                          </td>
                          <td>
                            <div className={styles.harvestPctGroup}>
                              {[
                                { label: '25%', val: 0.25 },
                                { label: '50%', val: 0.50 },
                                { label: '100%', val: 1.0 },
                              ].map(p => (
                                <button
                                  key={p.label}
                                  className={`${styles.harvestPctBtn} ${isSelected && Math.abs(sel.harvestRatio - p.val) < 0.05 ? styles.harvestPctBtnActive : ''}`}
                                  onClick={() => handleRatioChange(lot.lotKey, p.val)}
                                >
                                  {p.label}
                                </button>
                              ))}
                              <input
                                type="range"
                                min="0.05"
                                max="1.0"
                                step="0.05"
                                value={sel.harvestRatio || 1}
                                onChange={(e) => handleRatioChange(lot.lotKey, parseFloat(e.target.value))}
                                className={styles.sliderInput}
                                title={`${Math.round((sel.harvestRatio || 1) * 100)}% to sell`}
                              />
                            </div>
                          </td>
                          <td className="mono-privacy" style={{ textAlign: 'right' }}>
                            {isSelected ? `₹${fmt(lot.qty * sel.harvestRatio * lot.cmp, 2)}` : '—'}
                          </td>
                          <td
                            className="mono-privacy"
                            style={{
                              textAlign: 'right',
                              fontWeight: 700,
                              color: isSelected ? colorPnl(lot.unrealizedGain * sel.harvestRatio) : 'var(--text3)',
                            }}
                          >
                            {isSelected ? (
                              `${(lot.unrealizedGain * sel.harvestRatio) >= 0 ? '+' : ''}₹${fmt(lot.unrealizedGain * sel.harvestRatio, 2)}`
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actionable Execution Orders Sheet */}
          {simulation.orders.length > 0 && (
            <div className={styles.ordersCard}>
              <div className={styles.ordersHeader}>
                <div className={styles.ordersTitle}>
                  <CheckCircle2 size={16} color="var(--green2)" />
                  <span>Actionable Order Execution Plan ({simulation.orders.length} orders generated)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className={styles.presetBtn} onClick={handleCopyPlan}>
                    {copiedPlan ? <Check size={13} color="var(--green2)" /> : <Copy size={13} />}
                    {copiedPlan ? 'Copied to Clipboard!' : 'Copy Plan'}
                  </button>
                  <button className={styles.exportBtn} onClick={handleExportHarvestingPlan}>
                    <Download size={13} /> Download Plan CSV
                  </button>
                </div>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.taxTable}>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th style={{ textAlign: 'left' }}>Symbol / Security</th>
                      <th>Units to Sell</th>
                      <th style={{ textAlign: 'right' }}>CMP</th>
                      <th style={{ textAlign: 'right' }}>Est. Sale Proceeds</th>
                      <th style={{ textAlign: 'right' }}>Triggered P&L</th>
                      <th>Tax Term</th>
                      <th style={{ textAlign: 'left' }}>Execution & Re-entry Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.orders.map((o, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center' }}>
                          <span className={styles.actionBadgeSell}>SELL</span>
                        </td>
                        <td style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 700 }}>{o.symbol}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{o.name}</div>
                        </td>
                        <td className="mono-privacy" style={{ textAlign: 'center', fontWeight: 600 }}>
                          {fmt(o.unitsToSell, o.assetType === 'MF' ? 3 : 0)}
                        </td>
                        <td className="mono-privacy" style={{ textAlign: 'right' }}>
                          ₹{fmt(o.cmp, 2)}
                        </td>
                        <td className="mono-privacy" style={{ textAlign: 'right', fontWeight: 600 }}>
                          ₹{fmt(o.estimatedProceeds, 2)}
                        </td>
                        <td
                          className="mono-privacy"
                          style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: colorPnl(o.gainOrLoss),
                          }}
                        >
                          {o.gainOrLoss >= 0 ? '+' : ''}₹{fmt(o.gainOrLoss, 2)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={o.taxType === 'LTCG' ? styles.tagLTCG : styles.tagSTCG}>
                            {o.taxType}
                          </span>
                        </td>
                        <td style={{ textAlign: 'left' }}>
                          <span className={styles.strategyPill}>
                            {o.strategyAction}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
