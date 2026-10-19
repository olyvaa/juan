import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

export type Confirm = { title: string; message: ReactNode; action: string; destructive?: boolean; onConfirm: () => void };

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}
    >
      <span className="knob" />
    </button>
  );
}

export function StatusPill({ kind, children }: { kind: 'good' | 'warn' | 'bad' | 'neutral'; children: ReactNode }) {
  const icon = kind === 'good' ? <CheckCircle2 size={13} /> : kind === 'bad' ? <XCircle size={13} /> : kind === 'warn' ? <AlertTriangle size={13} /> : <Info size={13} />;
  return <span className={`pill ${kind}`}>{icon}{children}</span>;
}

export function Tile({ label, value, sub, valueTone }: { label: string; value: ReactNode; sub?: ReactNode; valueTone?: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <strong className={`tile-value ${valueTone || ''}`}>{value}</strong>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}

export function Section({ title, footer, children, action }: { title?: string; footer?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="group">
      {(title || action) && <div className="group-head">{title && <h2>{title}</h2>}{action}</div>}
      <div className="group-card">{children}</div>
      {footer && <p className="group-foot">{footer}</p>}
    </section>
  );
}

export function ConfirmSheet({ c, onClose }: { c: Confirm; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="alertdialog" aria-modal="true" aria-labelledby="sheet-title">
        <h3 id="sheet-title">{c.title}</h3>
        <div className="sheet-body">{c.message}</div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button
            type="button" className={`btn ${c.destructive ? 'danger' : 'primary'}`} autoFocus
            onClick={() => { c.onConfirm(); onClose(); }}
          >{c.action}</button>
        </div>
      </div>
    </div>
  );
}

