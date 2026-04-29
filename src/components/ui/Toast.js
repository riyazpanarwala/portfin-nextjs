'use client';

import { usePortfolio } from '@/context/PortfolioContext';

export default function ToastContainer() {
  const { toasts } = usePortfolio();

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px',
      display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 1000,
    }}>
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
          <span>{t.type === 'green' ? '✅' : t.type === 'red' ? '❌' : 'ℹ️'}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
