import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, badRequest } from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/corporate-actions
 * Request Body:
 * {
 *   portfolioId?: string,
 *   symbol: string,
 *   actionType: 'SPLIT' | 'BONUS' | 'REVERSE_SPLIT',
 *   ratioNumerator: number,   // e.g. 5 for 1:5 split, or 1 for 1:1 bonus
 *   ratioDenominator: number, // e.g. 1
 *   exDate?: string,          // YYYY-MM-DD
 *   preview?: boolean
 * }
 */
export const POST = withErrorHandler(
  'POST /api/corporate-actions',
  async (request) => {
    const {
      portfolioId,
      symbol,
      actionType,
      ratioNumerator = 1,
      ratioDenominator = 1,
      exDate,
      preview = false,
    } = await request.json();

    if (!symbol) return badRequest('Symbol is required.');
    if (!actionType || !['SPLIT', 'BONUS', 'REVERSE_SPLIT'].includes(actionType)) {
      return badRequest('Valid actionType (SPLIT, BONUS, REVERSE_SPLIT) is required.');
    }

    const num = parseFloat(ratioNumerator);
    const den = parseFloat(ratioDenominator);

    if (isNaN(num) || num <= 0 || isNaN(den) || den <= 0) {
      return badRequest('Valid positive ratioNumerator and ratioDenominator are required.');
    }

    // Determine multiplier factor
    let multiplier = 1;
    if (actionType === 'SPLIT') {
      multiplier = num / den;
    } else if (actionType === 'BONUS') {
      multiplier = 1 + num / den;
    } else if (actionType === 'REVERSE_SPLIT') {
      multiplier = num / den;
    }

    if (multiplier <= 0 || !isFinite(multiplier)) {
      return badRequest('Invalid ratio multiplier computed.');
    }

    // Find target instrument
    const normSymbol = symbol.toUpperCase().trim();
    const instrument = await prisma.instrument.findFirst({
      where: { symbol: normSymbol },
    });

    if (!instrument) {
      return badRequest(`Instrument with symbol "${normSymbol}" not found.`);
    }

    // Query affected trades
    const whereClause = {
      instrumentId: instrument.id,
    };

    if (portfolioId) {
      whereClause.portfolioId = portfolioId;
    }

    if (exDate && exDate.trim()) {
      whereClause.tradeDate = {
        lte: new Date(exDate),
      };
    }

    const trades = await prisma.trade.findMany({
      where: whereClause,
      orderBy: { tradeDate: 'asc' },
    });

    if (!trades.length) {
      return NextResponse.json({
        message: 'No trades found matching specified criteria.',
        affectedCount: 0,
        trades: [],
      });
    }

    const previewTrades = trades.map((t) => {
      const oldQty = parseFloat(t.quantity);
      const oldPrice = parseFloat(t.price);
      const newQty = oldQty * multiplier;
      const newPrice = oldPrice / multiplier;

      return {
        id: t.id,
        tradeDate: t.tradeDate.toISOString().slice(0, 10),
        tradeType: t.tradeType,
        oldQty,
        oldPrice: parseFloat(oldPrice.toFixed(4)),
        oldInvested: parseFloat((oldQty * oldPrice).toFixed(2)),
        newQty: parseFloat(newQty.toFixed(4)),
        newPrice: parseFloat(newPrice.toFixed(4)),
        newInvested: parseFloat((newQty * newPrice).toFixed(2)),
      };
    });

    if (preview) {
      return NextResponse.json({
        preview: true,
        symbol: normSymbol,
        actionType,
        multiplier,
        affectedCount: trades.length,
        trades: previewTrades,
      });
    }

    // Execute database transaction
    await prisma.$transaction(
      previewTrades.map((pt) =>
        prisma.trade.update({
          where: { id: pt.id },
          data: {
            quantity: pt.newQty,
            price: pt.newPrice,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      message: `Successfully applied ${actionType} action on ${trades.length} trade lots for ${normSymbol}.`,
      symbol: normSymbol,
      actionType,
      updatedCount: trades.length,
    });
  }
);
