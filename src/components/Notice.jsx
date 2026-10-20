import { useState } from 'react';
import { AlertCircle, CheckCircle2, Info, RotateCcw } from 'lucide-react';

const ICONS = {
  error: AlertCircle,
  warning: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

export default function Notice({
  tone = 'error',
  message,
  detail = '',
  onRetry,
}) {
  const [open, setOpen] = useState(false);
  if (!message) return null;
  const Icon = ICONS[tone] || AlertCircle;
  return (
    <div className={`pw-notice is-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={15} aria-hidden="true" />
      <div className="pw-notice-copy">
        <p>{message}</p>
        {detail ? (
          <button type="button" className="pw-notice-toggle" onClick={() => setOpen((value) => !value)}>
            {open ? 'Hide details' : 'View details'}
          </button>
        ) : null}
        {open && detail ? <p className="pw-notice-detail">{detail}</p> : null}
      </div>
      {onRetry ? (
        <button type="button" className="pw-notice-retry" onClick={onRetry}>
          <RotateCcw size={13} />
          Try again
        </button>
      ) : null}
    </div>
  );
}
