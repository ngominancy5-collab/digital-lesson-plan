import { useEffect, useState } from 'react';

export default function TypedText({
  text,
  accent = '',
  as: Tag = 'span',
  className = '',
  startDelay = 0,
  speed = 46,
  keepCaret = true,
}) {
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [count, setCount] = useState(reduceMotion ? text.length : 0);

  useEffect(() => {
    if (reduceMotion || count >= text.length) return undefined;
    const delay = count === 0 ? startDelay : speed;
    const timer = window.setTimeout(() => setCount((current) => current + 1), delay);
    return () => window.clearTimeout(timer);
  }, [count, reduceMotion, speed, startDelay, text]);

  const accentAt = accent && text.endsWith(accent) ? text.length - accent.length : -1;

  function paint(value) {
    if (accentAt < 0 || value.length <= accentAt) return value;
    return (
      <>
        {value.slice(0, accentAt)}
        <em>{value.slice(accentAt)}</em>
      </>
    );
  }

  return (
    <Tag className={`typed-line${className ? ` ${className}` : ''}`}>
      <span className="typed-ghost" aria-hidden="true">{paint(text)}</span>
      <span className="typed-live" aria-hidden="true">
        {paint(text.slice(0, count))}
        {(keepCaret || count < text.length) && <i className="typed-caret" />}
      </span>
      <span className="sr-only">{text}</span>
    </Tag>
  );
}
