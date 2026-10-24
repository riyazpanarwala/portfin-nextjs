import { createHash } from 'node:crypto';
import { computeHoldings } from './store.js';
import { buildSnapshotData, cachedValuationInputs } from './snapshotValuation.js';
import { flattenTrade } from './apiHelpers.js';
import { tradeOrder, lockPortfolio } from './ledger.js';
import { isDelistedStock } from './marketDataPolicy.js';

export function indiaDate(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function dailySnapshotId(portfolioId, date) {
  const hash = createHash('sha256').update(`portfin:daily-snapshot:v1:${portfolioId}:${date}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function loadLedger(db, portfolioId) {
  const trades = await db.trade.findMany({ where: { portfolioId }, include: { instrument: true }, orderBy: tradeOrder });
  const actions = await db.corporateAction.findMany({ where: { portfolioId }, orderBy: [{ exDate: 'asc' }, { id: 'asc' }] });
  return { trades, actions };
}

const activeIds = (trades, actions, asOf) => new Set(computeHoldings(trades.map(flattenTrade), {}, { corporateActions: actions, asOf }).filter(h => h.qty > 1e-9).map(h => h.instrumentId));

/** Refresh owned active holdings and save one automated checkpoint per IST day. */
export async function runDailyPortfolioSnapshots({ db, collectPrices, ownerEmail, now = new Date(), log = () => {}, onStage = () => {} }) {
  onStage('configuration');
  if (typeof ownerEmail !== 'string' || !ownerEmail.trim().includes('@')) throw new Error('Set PORTFOLIO_OWNER_EMAIL to the account email used to sign in.');
  const asOf = indiaDate(now);
  onStage('owner_lookup');
  const portfolios = await db.portfolio.findMany({ where: { user: { email: { equals: ownerEmail.trim(), mode: 'insensitive' } } }, select: { id: true, userId: true } });
  if (!portfolios.length) {
    onStage('owner_not_found');
    throw new Error('No portfolios match PORTFOLIO_OWNER_EMAIL.');
  }
  onStage('ledger_read');
  const instruments = new Map();
  for (const portfolio of portfolios) {
    const { trades, actions } = await db.$transaction(tx => loadLedger(tx, portfolio.id), { isolationLevel: 'RepeatableRead', timeout: 20000 });
    const active = activeIds(trades, actions, asOf);
    for (const trade of trades) if (active.has(trade.instrumentId)) instruments.set(trade.instrumentId, trade.instrument);
  }
  const refreshed = new Set();
  onStage('update');
  const eligible = [...instruments.values()].filter(i => !isDelistedStock(i));
  const groups = [eligible.filter(i => i.assetType === 'MF')];
  const stocks = eligible.filter(i => i.assetType === 'STOCK');
  for (let index = 0; index < stocks.length; index += 20) groups.push(stocks.slice(index, index + 20));
  for (const group of groups.filter(group => group.length)) {
    try {
      const { meta } = await collectPrices(group, { force: true }, { db });
      for (const instrument of group) {
        const quote = meta[instrument.id];
        if (['amfi', 'yahoo'].includes(quote?.source) && !quote.stale && quote.asOf <= asOf) {
          refreshed.add(instrument.id);
        } else log('A provider refresh was unavailable.');
      }
    } catch { log('A price refresh batch failed; affected snapshots will be skipped.'); }
  }
  const result = { asOf, refreshed: refreshed.size, eligible: eligible.length, saved: 0, skippedEmpty: 0, failures: [] };
  for (const portfolio of portfolios) {
    try {
      const saved = await db.$transaction(async tx => {
        await lockPortfolio(tx, portfolio.id, portfolio.userId);
        // Reload under the ledger lock: trades or corporate actions may have changed during price fetching.
        const { trades, actions } = await loadLedger(tx, portfolio.id);
        if (!trades.some(t => t.tradeDate.toISOString().slice(0, 10) <= asOf)) return false;
        const active = activeIds(trades, actions, asOf);
        const currentInstruments = [...new Map(trades.map(t => [t.instrumentId, t.instrument])).values()];
        for (const instrument of currentInstruments.filter(i => active.has(i.id))) {
          if (!isDelistedStock(instrument) && !refreshed.has(instrument.id)) throw new Error(`Price refresh missing for ${instrument.symbol}; snapshot not saved.`);
          const priceDate = instrument.priceAsOf?.toISOString().slice(0, 10);
          if (actions.some(a => a.instrumentId === instrument.id && a.exDate.toISOString().slice(0, 10) > priceDate && a.exDate.toISOString().slice(0, 10) <= asOf)) throw new Error(`Price predates a corporate action for ${instrument.symbol}; snapshot not saved.`);
        }
        const portfolioRow = await tx.portfolio.findUnique({ where: { id: portfolio.id } });
        const { prices, meta } = cachedValuationInputs(currentInstruments);
        const data = buildSnapshotData(trades.map(flattenTrade), prices, meta, { asOf, corporateActions: actions, revision: portfolioRow.revision });
        const id = dailySnapshotId(portfolio.id, asOf);
        // Manual snapshots round to a minute. A 1ms offset avoids their unique timestamp slot.
        const snapshotAt = new Date(Math.floor(now.getTime() / 1000) * 1000 + 1);
        await tx.snapshot.upsert({ where: { id }, create: { id, portfolioId: portfolio.id, snapshotAt, ...data }, update: { snapshotAt, ...data } });
        return true;
      }, { timeout: 20000 });
      if (saved) result.saved++; else result.skippedEmpty++;
    } catch (error) {
      result.failures.push({ portfolioId: portfolio.id, message: error.message });
    }
  }
  return result;
}
