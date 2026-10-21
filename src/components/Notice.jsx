import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';

/** Top-right flash toast. Never renders inline in a form. */
export default function Notice({
  tone = 'error',
  message,
  detail = '',
  onRetry,
  duration = 5200,
  onDismiss,
}) {
  useEffect(() => {
    if (!message || !duration || !onDismiss) return undefined;
    const timer = window.setTimeout(() => onDismiss(), duration);
    return () => window.clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message || typeof document === 'undefined') return null;

  const isError = tone === 'error' || tone === 'warning';
  const text = [message, detail].filter(Boolean).join(' ');

  return createPortal(
    <div
      className={`pw-flash-popup is-${isError ? 'error' : 'ok'}${onRetry ? ' has-action' : ''}`}
      role={isError ? 'alert' : 'status'}
    >
      {isError ? <AlertCircle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
      <span>{text}</span>
      {onRetry ? (
        <button type="button" className="pw-flash-retry" onClick={onRetry}>
          <RotateCcw size={13} />
          Try again
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
