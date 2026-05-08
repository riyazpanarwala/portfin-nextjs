'use client';

import { useState } from 'react';

const DEFAULTS = [
  { label: 'Mutual Funds (MF)', key: 'MF',    target: 70, color: 'var(--teal)'   },
  { label: 'Equity Stocks',     key: 'STOCK',  target: 20, color: 'var(--purple)' },
  { label: 'ETF / Index',       key: 'ETF',    target: 10, color: 'var(--accent2)'},
];

export function useRebalancer({ stats }) {
  const [allocations, setAllocations] = useState(DEFAULTS);

  const total = allocations.reduce((s, a) => s + a.target, 0);

  const currentPct = {
    MF:    stats.totalValue > 0 ? (stats.mfValue / stats.totalValue * 100) : 0,
    STOCK: stats.totalValue > 0 ? (stats.stValue / stats.totalValue * 100) : 0,
    ETF:   0,
  };

  const actions = allocations.map(a => {
    const curr     = currentPct[a.key] || 0;
    const targetVal = stats.totalValue * (a.target / 100);
    const currVal   = stats.totalValue * (curr / 100);
    const diff      = targetVal - currVal;
    return { ...a, curr, targetVal, currVal, diff };
  });

  function setTarget(key, val) {
    setAllocations(prev =>
      prev.map(a => a.key === key
        ? { ...a, target: Math.max(0, Math.min(100, +val)) }
        : a
      )
    );
  }

  const isBalanced = total === 100;

  return { allocations, total, isBalanced, actions, setTarget };
}
