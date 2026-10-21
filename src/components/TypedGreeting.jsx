import { useEffect, useMemo, useRef, useState } from 'react';

function getGreetingPeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

export function useTimeGreeting() {
  const [period, setPeriod] = useState(() => getGreetingPeriod());

  useEffect(() => {
    const sync = () => {
      const next = getGreetingPeriod();
      setPeriod((current) => (current === next ? current : next));
    };
    sync();
    const id = window.setInterval(sync, 30000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => ({
    period,
    phrase: `Good ${period},`,
  }), [period]);
}

/**
 * Time-aware character-by-character greeting for dashboard heroes.
 * Respects prefers-reduced-motion and does not restart on unrelated re-renders.
 */
export default function TypedGreeting({
  name = '',
  className = '',
  speed = 58,
  as: Tag = 'h1',
}) {
  const { phrase, period } = useTimeGreeting();
  const displayName = String(name || '').trim() || 'Educator';
  const fullText = `${phrase} ${displayName}!`;
  const animationKey = `${period}|${displayName}`;
  const reduceMotion = useMemo(() => (
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ), []);

  const [visible, setVisible] = useState(reduceMotion ? fullText.length : 0);
  const [done, setDone] = useState(reduceMotion);
  const lastKey = useRef(animationKey);

  useEffect(() => {
    if (lastKey.current !== animationKey) {
      lastKey.current = animationKey;
      if (reduceMotion) {
        setVisible(fullText.length);
        setDone(true);
        return undefined;
      }
      setVisible(0);
      setDone(false);
    }

    if (reduceMotion || visible >= fullText.length) {
      if (visible >= fullText.length) setDone(true);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setVisible((count) => Math.min(count + 1, fullText.length));
    }, speed);

    return () => window.clearTimeout(timer);
  }, [animationKey, fullText.length, reduceMotion, speed, visible]);

  const typed = fullText.slice(0, visible);
  const phrasePart = typed.slice(0, Math.min(typed.length, phrase.length));
  const afterPhrase = typed.length > phrase.length ? typed.slice(phrase.length) : '';

  return (
    <Tag className={`pw-typed-greeting${className ? ` ${className}` : ''}`}>
      <span className="pw-typed-ghost" aria-hidden="true">
        <em>{phrase}</em>
        {' '}
        <strong>{displayName}!</strong>
      </span>
      <span className="pw-typed-live" aria-hidden="true">
        <em>{phrasePart}</em>
        {afterPhrase ? <strong>{afterPhrase}</strong> : null}
        {!done ? <i className="pw-typed-caret" /> : null}
      </span>
      <span className="sr-only">{fullText}</span>
    </Tag>
  );
}
