import { HttpError, requireOwnedPortfolio } from './auth.js';
import { lockPortfolio } from './ledger.js';

export async function confirmSaleTaxEligibility(db, session, input) {
  const { portfolioId, saleIds, confirmed } = input || {};
  if (confirmed !== true || !Array.isArray(saleIds) || !saleIds.length || saleIds.length > 1000 || saleIds.some(id => typeof id !== 'string' || !id) || new Set(saleIds).size !== saleIds.length) {
    throw new HttpError(400, 'Select sales and explicitly confirm their equity and STT eligibility.');
  }
  await requireOwnedPortfolio(portfolioId, session, db);
  return db.$transaction(async tx => {
    await lockPortfolio(tx, portfolioId, session.userId);
    const sales = await tx.trade.findMany({ where: { portfolioId, id: { in: saleIds }, tradeType: 'SELL' }, include: { instrument: true } });
    if (sales.length !== saleIds.length) throw new HttpError(400, 'One or more selected sales are unavailable in this portfolio.');
    if (sales.some(sale => sale.sttEligible === false || sale.taxCategory === 'OTHER' || sale.instrument.taxCategory === 'OTHER' || !['STOCK', 'MF'].includes(sale.instrument.assetType))) {
      throw new HttpError(409, 'A selected sale is explicitly ineligible; it cannot be confirmed as eligible equity.');
    }
    const result = await tx.trade.updateMany({ where: { portfolioId, id: { in: saleIds }, tradeType: 'SELL', sttEligible: null }, data: { sttEligible: true, taxCategory: 'EQUITY_ELIGIBLE', taxEligibilityConfirmedAt: new Date() } });
    // Synchronize paginated trade loads without invalidating monetary snapshots:
    // this records tax confirmation and does not change quantities or prices.
    if (result.count) await tx.portfolio.update({ where: { id: portfolioId }, data: { revision: { increment: 1 } } });
    return { confirmed: result.count };
  });
}
