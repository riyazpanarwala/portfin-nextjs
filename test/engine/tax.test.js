import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeHoldings,
  computeCapitalGainsReport,
  simulateTaxHarvesting,
  generateSchedule112ACsv,
  generateSchedule112AJson,
  generateSchedule111ACsv,
  generateHarvestingExecutionCsv,
} from '../../src/lib/store.js';

test('Tax Engine: computeCapitalGainsReport computes Budget 2024 LTCG (12.5%, ₹1.25L exempt) and STCG (20%)', () => {
  const trades = [
    // Stock 1: LTCG winner (held > 365 days)
    {
      symbol: 'INFY',
      isin: 'INE009A01021',
      name: 'Infosys Limited',
      assetType: 'STOCK',
      exchange: 'NSE',
      tradeType: 'BUY',
      quantity: '100',
      price: '1000',
      tradeDate: '2024-04-10',
    },
    {
      symbol: 'INFY',
      isin: 'INE009A01021',
      name: 'Infosys Limited',
      assetType: 'STOCK',
      exchange: 'NSE',
      tradeType: 'SELL',
      quantity: '100',
      price: '2500',
      tradeDate: '2026-05-15', // FY 2026-27 (LTCG: 100 * 1500 = 1,50,000)
    },
    // Stock 2: STCG winner (held < 365 days)
    {
      symbol: 'TCS',
      isin: 'INE467B01029',
      name: 'Tata Consultancy Services',
      assetType: 'STOCK',
      exchange: 'NSE',
      tradeType: 'BUY',
      quantity: '10',
      price: '3000',
      tradeDate: '2026-04-01',
    },
    {
      symbol: 'TCS',
      isin: 'INE467B01029',
      name: 'Tata Consultancy Services',
      assetType: 'STOCK',
      exchange: 'NSE',
      tradeType: 'SELL',
      quantity: '10',
      price: '3500',
      tradeDate: '2026-06-01', // FY 2026-27 (STCG: 10 * 500 = 5,000)
    },
  ];

  const holdings = computeHoldings(trades);
  const report = computeCapitalGainsReport(holdings, { fy: '2026-27' });

  // LTCG: ₹1,50,000
  assert.equal(report.grossLtcg, 150000);
  assert.equal(report.exemptLtcg, 125000); // Budget 2024 ₹1.25L exemption
  assert.equal(report.taxableLtcg, 25000);  // 1,50,000 - 1,25,000 = 25,000
  assert.equal(report.ltcgTax, 25000 * 0.125); // 3,125

  // STCG: ₹5,000
  assert.equal(report.grossStcg, 5000);
  assert.equal(report.netTaxableStcg, 5000);
  assert.equal(report.stcgTax, 5000 * 0.20); // 1,000

  // Cess @ 4%
  const baseTax = (25000 * 0.125) + (5000 * 0.20); // 4,125
  const cess = baseTax * 0.04; // 165
  assert.equal(report.baseTax, baseTax);
  assert.equal(report.cess, cess);
  assert.equal(report.totalTax, baseTax + cess); // 4,290

  // Schedule 112A check
  assert.ok(Array.isArray(report.schedule112A));
  assert.equal(report.schedule112A.length, 1);
  assert.equal(report.schedule112A[0].isin, 'INE009A01021');
  assert.equal(report.schedule112A[0].fullValueConsideration, 250000);
  assert.equal(report.schedule112A[0].costOfAcquisition, 100000);
  assert.equal(report.schedule112A[0].netLtcg, 150000);
});

test('Tax Engine: Loss Set-off Rules (LTCL offsets LTCG, STCL offsets STCG then LTCG)', () => {
  const trades = [
    // LTCG gain ₹1,00,000
    { symbol: 'A', name: 'A', assetType: 'STOCK', exchange: 'NSE', tradeType: 'BUY', quantity: '100', price: '1000', tradeDate: '2024-01-01' },
    { symbol: 'A', name: 'A', assetType: 'STOCK', exchange: 'NSE', tradeType: 'SELL', quantity: '100', price: '2000', tradeDate: '2026-05-01' },
    // LTCL loss ₹40,000
    { symbol: 'B', name: 'B', assetType: 'STOCK', exchange: 'NSE', tradeType: 'BUY', quantity: '100', price: '1000', tradeDate: '2024-01-01' },
    { symbol: 'B', name: 'B', assetType: 'STOCK', exchange: 'NSE', tradeType: 'SELL', quantity: '100', price: '600', tradeDate: '2026-05-01' },
    // STCG gain ₹20,000
    { symbol: 'C', name: 'C', assetType: 'STOCK', exchange: 'NSE', tradeType: 'BUY', quantity: '100', price: '100', tradeDate: '2026-04-01' },
    { symbol: 'C', name: 'C', assetType: 'STOCK', exchange: 'NSE', tradeType: 'SELL', quantity: '100', price: '300', tradeDate: '2026-05-01' },
    // STCL loss ₹30,000
    { symbol: 'D', name: 'D', assetType: 'STOCK', exchange: 'NSE', tradeType: 'BUY', quantity: '100', price: '400', tradeDate: '2026-04-01' },
    { symbol: 'D', name: 'D', assetType: 'STOCK', exchange: 'NSE', tradeType: 'SELL', quantity: '100', price: '100', tradeDate: '2026-05-01' },
  ];

  const holdings = computeHoldings(trades);
  const report = computeCapitalGainsReport(holdings, { fy: '2026-27' });

  // Gross:
  // LTCG = 1,00,000, LTCL = 40,000 -> Rem LTCG = 60,000
  // STCG = 20,000, STCL = 30,000 -> Rem STCL = 10,000 (after wiping out 20,000 STCG)
  // Excess STCL (10,000) offsets remaining LTCG (60,000) -> Net LTCG = 50,000
  // Net STCG = 0
  // Net LTCG (50,000) <= 1,25,000 exemption limit -> Taxable LTCG = 0, Total Tax = 0!
  assert.equal(report.ltclUsedAgainstLtcg, 40000);
  assert.equal(report.stclUsedAgainstStcg, 20000);
  assert.equal(report.stclUsedAgainstLtcg, 10000);
  assert.equal(report.netTaxableStcg, 0);
  assert.equal(report.taxableLtcg, 0);
  assert.equal(report.totalTax, 0);
});

test('Schedule 112A Export: CSV and JSON formatting', () => {
  const trades = [
    {
      symbol: 'HDFCBANK',
      isin: 'INE040A01034',
      name: 'HDFC Bank Limited',
      assetType: 'STOCK',
      exchange: 'NSE',
      tradeType: 'BUY',
      quantity: '50',
      price: '1400',
      tradeDate: '2024-02-15',
    },
    {
      symbol: 'HDFCBANK',
      isin: 'INE040A01034',
      name: 'HDFC Bank Limited',
      assetType: 'STOCK',
      exchange: 'NSE',
      tradeType: 'SELL',
      quantity: '50',
      price: '1800',
      tradeDate: '2026-08-10',
    },
  ];

  const holdings = computeHoldings(trades);
  const report = computeCapitalGainsReport(holdings, { fy: '2026-27' });

  // CSV test
  const csv = generateSchedule112ACsv(report);
  assert.ok(csv.includes('Sr. No.'));
  assert.ok(csv.includes('INE040A01034'));
  assert.ok(csv.includes('HDFC Bank Limited'));
  assert.ok(csv.includes('90000.00')); // 50 * 1800
  assert.ok(csv.includes('70000.00')); // 50 * 1400

  // JSON test
  const jsonStr = generateSchedule112AJson(report);
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.financialYear, '2026-27');
  assert.equal(parsed.assessmentYear, '2027-28');
  assert.equal(parsed.schedule112A.length, 1);
  assert.equal(parsed.schedule112A[0].isin, 'INE040A01034');
  assert.equal(parsed.schedule112A[0].fullValueOfConsideration, 90000);
  assert.equal(parsed.schedule112A[0].costOfAcquisitionWithoutIndexation, 70000);
});

test('Schedule 111A Export: CSV formatting with Consolidated Summary Header and STCG trades', () => {
  const trades = [
    {
      symbol: 'WIPRO',
      isin: 'INE075A01022',
      name: 'Wipro Limited',
      assetType: 'STOCK',
      exchange: 'NSE',
      tradeType: 'BUY',
      quantity: '100',
      price: '400',
      tradeDate: '2026-04-10',
    },
    {
      symbol: 'WIPRO',
      isin: 'INE075A01022',
      name: 'Wipro Limited',
      assetType: 'STOCK',
      exchange: 'NSE',
      tradeType: 'SELL',
      quantity: '100',
      price: '480',
      tradeDate: '2026-06-15',
    },
  ];

  const holdings = computeHoldings(trades);
  const report = computeCapitalGainsReport(holdings, { fy: '2026-27' });

  const csv = generateSchedule111ACsv(report);
  assert.ok(csv.includes('# ITR-2 SCHEDULE CG — SECTION 111A'));
  assert.ok(csv.includes('# 1. Full Value of Consideration (Gross Short-Term Sale Proceeds):,48000.00'));
  assert.ok(csv.includes('# 2. Cost of Acquisition without indexation (FIFO Basis):,40000.00'));
  assert.ok(csv.includes('# 5. Net Short-Term Capital Gain u/s 111A:,8000.00'));
  assert.ok(csv.includes('INE075A01022'));
  assert.ok(csv.includes('Wipro Limited'));
  assert.ok(csv.includes('48000.00'));
  assert.ok(csv.includes('8000.00'));
});

test('Smart Tax Harvesting Simulator: Recommends 0% LTCG Gain Step-Up & Loss Offsets', () => {
  // Scenario:
  // User has realized ₹20,000 STCG in current FY (tax liability = ₹4,000 + cess = ₹4,160)
  // User holds open positions:
  // 1. LOSER: Stock X with ₹20,000 unrealized loss (STCL) -> Can wipe out ₹20,000 STCG!
  // 2. WINNER: Stock Y held > 365 days with ₹50,000 unrealized gain -> Can step up ₹50,000 tax-free!
  const trades = [
    // Realized trade in FY 2026-27
    { symbol: 'REAL1', name: 'Realized Stock', assetType: 'STOCK', exchange: 'NSE', tradeType: 'BUY', quantity: '100', price: '100', tradeDate: '2026-04-01' },
    { symbol: 'REAL1', name: 'Realized Stock', assetType: 'STOCK', exchange: 'NSE', tradeType: 'SELL', quantity: '100', price: '300', tradeDate: '2026-06-01' }, // STCG: 20,000
    // Open position 1 (Loser)
    { symbol: 'LOSER', name: 'Loser Stock', assetType: 'STOCK', exchange: 'NSE', tradeType: 'BUY', quantity: '100', price: '500', tradeDate: '2026-05-01' },
    // Open position 2 (Winner, LTCG)
    { symbol: 'WINNER', name: 'Winner Stock', assetType: 'STOCK', exchange: 'NSE', tradeType: 'BUY', quantity: '100', price: '500', tradeDate: '2024-01-01' },
  ];

  // CMP overrides
  const currentPrices = {
    REAL1: 300,
    LOSER: 300,  // Loss = 100 * (300 - 500) = -20,000 (STCL)
    WINNER: 1000, // Gain = 100 * (1000 - 500) = +50,000 (LTCG)
  };

  const holdings = computeHoldings(trades, currentPrices);
  const realizedReport = computeCapitalGainsReport(holdings, { fy: '2026-27' });

  // Baseline tax
  assert.equal(realizedReport.grossStcg, 20000);
  assert.equal(realizedReport.stcgTax, 4000);
  assert.equal(realizedReport.totalTax, 4160);

  // Run Simulator in OPTIMAL strategy
  const sim = simulateTaxHarvesting(holdings, realizedReport, {}, 'OPTIMAL');

  // Simulator should recommend harvesting LOSER to wipe out STCG liability
  assert.ok(sim.orders.length > 0);
  assert.ok(sim.impact.immediateTaxSaved >= 4160); // Wiped out the ₹4,160 tax!
  assert.equal(sim.simulated.totalTax, 0);

  // Future tax shielded from LTCG step-up
  assert.ok(sim.impact.harvestedTaxFreeGains > 0);
  assert.ok(sim.impact.futureLtcgTaxShielded > 0);

  // Execution CSV generation
  const execCsv = generateHarvestingExecutionCsv(sim.orders);
  assert.ok(execCsv.includes('SELL'));
  assert.ok(execCsv.includes('LOSER') || execCsv.includes('WINNER'));
});
