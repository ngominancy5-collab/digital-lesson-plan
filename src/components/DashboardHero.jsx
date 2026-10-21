import { useEffect, useMemo, useState } from 'react';
import { Building2, ShieldCheck, Sun, UserRound } from 'lucide-react';
import TypedGreeting from './TypedGreeting.jsx';
import { apiUrl, siteImageApi } from '../services/api.js';

const FALLBACK_HERO = '/dashboard/hero-classroom-2x.jpg';

function resolveMediaUrl(url) {
  if (!url) return FALLBACK_HERO;
  if (/^https?:\/\//i.test(url) || url.startsWith('/dashboard/')) return url;
  const apiBase = apiUrl('').replace(/\/api\/?$/, '');
  return `${apiBase}${url.startsWith('/') ? url : `/${url}`}`;
}

export default function DashboardHero({
  userName,
  subtitle,
  workspaceLabel,
  workspaceHint = 'Your workspace',
  roleLabel,
  roleHint = 'Your role',
  variant = 'educator',
  aside = null,
}) {
  const RoleIcon = variant === 'admin' ? ShieldCheck : UserRound;
  const [slides, setSlides] = useState([]);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    let active = true;
    siteImageApi.hero()
      .then((rows) => {
        if (!active) return;
        setSlides(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (active) setSlides([]);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % slides.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const heroSrc = useMemo(() => {
    if (!slides.length) return FALLBACK_HERO;
    const slide = slides[slideIndex % slides.length];
    return resolveMediaUrl(slide?.storageUrl);
  }, [slides, slideIndex]);

  return (
    <section className={`pw-hero pw-hero--${variant}`}>
      <img
        className="pw-hero-img"
        src={heroSrc}
        alt=""
        width={3072}
        height={1023}
        decoding="async"
      />
      <div className="pw-hero-shade" aria-hidden="true" />
      <div className="pw-hero-copy">
        <TypedGreeting name={userName} className="pw-hero-greeting" />
        <p className="pw-hero-sub">
          <Sun size={16} className="pw-hero-sun" aria-hidden="true" />
          <span>{subtitle}</span>
        </p>
        <div className="pw-hero-meta">
          <div className="pw-hero-pill">
            <span className="pw-hero-pill-icon" aria-hidden="true"><Building2 size={15} /></span>
            <span>
              <strong>{workspaceLabel}</strong>
              <small>{workspaceHint}</small>
            </span>
          </div>
          <div className="pw-hero-pill">
            <span className="pw-hero-pill-icon" aria-hidden="true"><RoleIcon size={15} /></span>
            <span>
              <strong>{roleLabel}</strong>
              <small>{roleHint}</small>
            </span>
          </div>
        </div>
      </div>
      {aside ? <div className="pw-hero-aside">{aside}</div> : null}
    </section>
  );
}
