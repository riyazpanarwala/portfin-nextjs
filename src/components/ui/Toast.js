'use client';

import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { usePortfolio } from '@/context/PortfolioContext';
import styles from './UI.module.css';

const BORDER_COLOR = {
  green: 'rgba(16,185,129,0.4)',
  red:   'rgba(239,68,68,0.4)',
  blue:  'rgba(59,130,246,0.4)',
};

export default function ToastContainer() {
  const { toasts } = usePortfolio();

  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast ${styles.toastItem}`}
          style={{ border: `1px solid ${BORDER_COLOR[t.type] || BORDER_COLOR.blue}` }}
        >
          {t.type === 'green'
            ? <CheckCircle2 size={16} color="var(--green2)" />
            : t.type === 'red'
            ? <AlertCircle  size={16} color="var(--red2)"   />
            : <Info         size={16} color="var(--accent2)" />
          }
          {t.msg}
        </div>
      ))}
    </div>
  );
}
