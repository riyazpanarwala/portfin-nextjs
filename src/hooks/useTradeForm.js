'use client';

import { useState, useEffect, useRef } from 'react';

const INITIAL_FORM = {
  symbol: '', name: '', assetType: 'STOCK', exchange: 'NSE',
  tradeType: 'BUY', quantity: '', price: '', brokerage: '', taxBrokerage: '',
  tradeDate: new Date().toISOString().slice(0, 10), sector: '', isin: undefined,
};

export function useTradeForm({ addTrade, deleteTrade, trades }) {
  const [form, setForm]               = useState(INITIAL_FORM);
  const [submitting, setSubmitting]   = useState(false);
  const [success, setSuccess]         = useState(false);
  const [deleteId, setDeleteId]       = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug]         = useState(false);
  const [sugLoading, setSugLoading]   = useState(false);
  const debounceRef = useRef(null);
  const skipSearchRef = useRef(false);

  function setField(k, v) {
    if (k === 'symbol') {
      skipSearchRef.current = false;
    }
    setForm(f => ({ ...f, [k]: v, ...(k === 'symbol' ? { isin: undefined } : {}) }));
  }

  function handleAssetTypeChange(at) {
    skipSearchRef.current = false;
    setField('assetType', at);
    setField('exchange', at === 'MF' ? 'AMFI' : 'NSE');
    setField('symbol', '');
    setField('name', '');
  }

  // Autocomplete
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    if (form.symbol.length < 1) {
      const timer = setTimeout(() => {
        setSuggestions([]);
        setShowSug(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    let active = true;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSugLoading(true);
      try {
        const p = new URLSearchParams({
          q: form.symbol,
          limit: '8',
          // Stocks search both NSE and BSE; selecting a result sets its exchange.
          ...(form.assetType === 'MF' && { exchange: 'AMFI' }),
          ...(form.assetType && { assetType: form.assetType }),
        });
        const res = await fetch(`/api/instruments/search?${p}`);
        if (res.ok && active && !skipSearchRef.current) {
          const { instruments } = await res.json();
          setSuggestions(instruments || []);
          setShowSug(true);
        }
      } catch {
        if (active) setSuggestions([]);
      } finally {
        if (active) setSugLoading(false);
      }
    }, 250);

    return () => {
      active = false;
    };
  }, [form.symbol, form.assetType]);

  function pickSuggestion(inst) {
    skipSearchRef.current = true;
    clearTimeout(debounceRef.current);
    setSuggestions([]);
    setShowSug(false);
    setForm(f => ({
      ...f,
      symbol:    inst.symbol,
      name:      inst.name,
      assetType: inst.assetType,
      exchange:  inst.exchange,
      sector:    inst.sector || f.sector,
      isin: inst.isin || undefined,
      price:     inst.price ? parseFloat(inst.price).toFixed(2) : f.price,
    }));
  }

  async function handleSubmit() {
    if (!form.symbol || !form.quantity || !form.price || !form.tradeDate) return;
    setSubmitting(true);
    try {
    await addTrade({
      ...form,
      quantity:  parseFloat(form.quantity),
      price:     parseFloat(form.price),
      brokerage: form.brokerage ? parseFloat(form.brokerage) : undefined,
    });
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setForm(f => ({ ...f, symbol: '', name: '', isin: undefined, quantity: '', price: '', brokerage: '', taxBrokerage: '', sector: '' }));
    }, 1800);
    } catch { setSuccess(false); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(id) {
    setDeleteId(id);
    await deleteTrade(id);
    setDeleteId(null);
  }

  const recentTrades = [...trades]
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))
    .slice(0, 12);

  const txValue = form.quantity && form.price
    ? parseFloat(form.quantity) * parseFloat(form.price)
    : null;

  const canSubmit = !submitting && !!form.symbol && !!form.quantity && !!form.price;

  return {
    form, setField, handleAssetTypeChange,
    submitting, success, deleteId,
    suggestions, showSug, setShowSug, sugLoading,
    pickSuggestion, handleSubmit, handleDelete,
    recentTrades, txValue, canSubmit,
  };
}
