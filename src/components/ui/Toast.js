'use client';

import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { usePortfolio } from '@/context/PortfolioContext';

export default function ToastContainer() {
  const { toasts } = usePortfolio();

  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className="toast" style={{
          background: 'var(--bg2)',
          border: `1px solid ${t.type === 'green' ? 'rgba(16,185,129,0.4)' : t.type === 'red' ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)'}`,
          borderRadius: '10px', padding: '12px 16px',
          color: 'var(--text)', fontSize: '13px', fontWeight: '500',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: '8px',
          minWidth: '240px',
        }}>
          {t.type === 'green' ? <CheckCircle2 size={16} color="var(--green2)" /> : t.type === 'red' ? <AlertCircle size={16} color="var(--red2)" /> : <Info size={16} color="var(--accent2)" />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}
