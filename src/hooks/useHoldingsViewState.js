'use client';

import { useMemo, useState } from 'react';

export const HOLDING_EPSILON = 1e-6;
const DEFAULT_GROUP_KEY = h => h.sector || 'Other';

export function useHoldingsViewState({
  holdings,
  groupKey = DEFAULT_GROUP_KEY,
  search = '',
  searchFields = [],
}) {
  const [sort, setSort] = useState({ key: 'returnPct', dir: -1 });
  const [group, setGroup] = useState('All');
  const [expanded, setExpanded] = useState({});
  const [mode, setMode] = useState('active');

  const activeHoldings = useMemo(
    () => holdings.filter(h => h.qty > HOLDING_EPSILON),
    [holdings]
  );
  const exitedHoldings = useMemo(
    () => holdings.filter(h => h.qty <= HOLDING_EPSILON),
    [holdings]
  );
  const sourceHoldings = mode === 'active' ? activeHoldings : exitedHoldings;

  const groups = useMemo(
    () => ['All', ...[...new Set(sourceHoldings.map(groupKey))].sort()],
    [sourceHoldings, groupKey]
  );

  const effectiveGroup = groups.includes(group) ? group : 'All';

  const rows = useMemo(() => {
    let list = effectiveGroup === 'All'
      ? [...sourceHoldings]
      : sourceHoldings.filter(h => groupKey(h) === effectiveGroup);

    const query = search.trim().toLowerCase();
    if (query && searchFields.length) {
      list = list.filter(h =>
        searchFields.some(field => String(field(h) || '').toLowerCase().includes(query))
      );
    }

    const key = sort.key;
    list.sort((a, b) =>
      sort.dir * (key === 'lots' ? a.lots.length - b.lots.length : (a[key] ?? 0) - (b[key] ?? 0))
    );
    return list;
  }, [effectiveGroup, groupKey, search, searchFields, sort, sourceHoldings]);

  const maxRet = useMemo(
    () => Math.max(...sourceHoldings.map(h => Math.abs(h.returnPct)), 1),
    [sourceHoldings]
  );

  const dataErrorCount = useMemo(
    () => holdings.filter(h => h.hasDataError).length,
    [holdings]
  );

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: -1 });
  }

  function toggleExpanded(symbol) {
    setExpanded(e => ({ ...e, [symbol]: !e[symbol] }));
  }

  const allExpanded = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.every(r => !!expanded[r.symbol]);
  }, [rows, expanded]);

  function expandAll() {
    const next = {};
    rows.forEach(r => { next[r.symbol] = true; });
    setExpanded(next);
  }

  function collapseAll() {
    setExpanded({});
  }

  function toggleExpandAll() {
    if (allExpanded) {
      collapseAll();
    } else {
      expandAll();
    }
  }

  return {
    sort,
    setSort,
    group: effectiveGroup,
    setGroup,
    expanded,
    setExpanded,
    allExpanded,
    expandAll,
    collapseAll,
    toggleExpandAll,
    mode,
    setMode,
    activeHoldings,
    exitedHoldings,
    sourceHoldings,
    activeCount: activeHoldings.length,
    exitedCount: exitedHoldings.length,
    dataErrorCount,
    groups,
    rows,
    maxRet,
    toggleSort,
    toggleExpanded,
  };
}

export function downloadCsv(filename, rows) {
  const a = document.createElement('a');
  a.href = 'data:text/csv,' + encodeURIComponent(rows.map(r => r.join(',')).join('\n'));
  a.download = filename;
  a.click();
}
