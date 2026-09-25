import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  BrainCircuit,
  CalendarDays,
  ClipboardCheck,
  FolderKanban,
  GraduationCap,
  MessageSquareText,
  Sparkles,
  Target,
} from 'lucide-react';
import '../landing.css';

const heroFeatures = [
  {
    id: 'plan',
    icon: Sparkles,
    title: 'AI Lesson Planning',
    text: 'Create structured lesson plans based on your course content.',
    enterFrom: 'left',
  },
  {
    id: 'assess',
    icon: ClipboardCheck,
    title: 'Smart Assessments',
    text: 'Generate quizzes and assessments from your learning materials.',
    enterFrom: 'top',
  },
  {
    id: 'organise',
    icon: FolderKanban,
    title: 'Digital Organisation',
    text: 'Keep lessons, topics, materials and activities organised.',
    enterFrom: 'bottom',
  },
  {
    id: 'assistant',
    icon: MessageSquareText,
    title: 'Interactive AI Assistant',
    text: 'Ask questions, refine plans and generate content through conversation.',
    enterFrom: 'right',
  },
];

const storyCards = [
  { icon: Target, title: 'Learning objectives', text: 'Shape every lesson around outcomes that students can actually reach.' },
  { icon: BookOpen, title: 'Topics and activities', text: 'Sequence teaching activities so each class has a clear rhythm.' },
  { icon: CalendarDays, title: 'Teaching calendar', text: 'Map lessons, holidays and assessments onto a living schedule.' },
];

function Reveal({ as: Tag = 'div', className = '', delay = 0, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        node.classList.add('is-visible');
        observer.disconnect();
      }
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={`lp-reveal ${className}`} style={{ '--lp-delay': `${delay}ms` }}>
      {children}
    </Tag>
  );
}

function WaveDivider({ from = '#f7f3eb', to = '#efe6da', flip = false }) {
  return (
    <div className={`lp-wave ${flip ? 'is-flip' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none">
        <path fill={to} d="M0,64 C240,120 480,0 720,40 C960,80 1200,120 1440,56 L1440,120 L0,120 Z" />
        <path fill={from} opacity="0.55" d="M0,80 C320,20 560,110 820,70 C1080,30 1280,10 1440,48 L1440,0 L0,0 Z" />
      </svg>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, text, onActivate, className = '', style }) {
  return (
    <article className={`lp-float-card lp-orbit-card ${className}`} style={style}>
      <button type="button" className="lp-orbit-card-hit" onClick={onActivate} aria-label={title}>
        <span className="lp-card-icon"><Icon size={18} /></span>
        <h3>{title}</h3>
        <p>{text}</p>
      </button>
    </article>
  );
}

/**
 * Desktop: cards assemble around the hero image, then rotate through 4 stations (train).
 * Mobile: simplified stacked entrance without continuous orbit.
 */
function AnimatedHeroCards({ onActivate }) {
  const [phase, setPhase] = useState('idle'); // idle → entering → assembled → train
  const [station, setStation] = useState(0);
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const isCompact = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches,
    [],
  );

  useEffect(() => {
    if (reduceMotion) {
      setPhase('assembled');
      return undefined;
    }
    const enterTimer = window.setTimeout(() => setPhase('entering'), 380);
    const assembledTimer = window.setTimeout(() => setPhase('assembled'), 2400);
    const trainTimer = window.setTimeout(() => {
      if (!isCompact) setPhase('train');
    }, 3200);
    return () => {
      window.clearTimeout(enterTimer);
      window.clearTimeout(assembledTimer);
      window.clearTimeout(trainTimer);
    };
  }, [reduceMotion, isCompact]);

  useEffect(() => {
    if (phase !== 'train' || reduceMotion || isCompact) return undefined;
    const id = window.setInterval(() => {
      setStation((current) => (current + 1) % heroFeatures.length);
    }, 3400);
    return () => window.clearInterval(id);
  }, [phase, reduceMotion, isCompact]);

  return (
    <div
      className={`lp-orbit ${phase === 'train' ? 'is-train' : ''} ${phase === 'entering' || phase === 'assembled' || phase === 'train' ? 'is-live' : ''}`}
    >
      {heroFeatures.map((card, index) => {
        const slot = (index + station) % heroFeatures.length;
        const Icon = card.icon;
        return (
          <FeatureCard
            key={card.id}
            icon={Icon}
            title={card.title}
            text={card.text}
            onActivate={onActivate}
            className={[
              `lp-orbit-slot-${slot}`,
              `from-${card.enterFrom}`,
              phase === 'idle' ? 'is-waiting' : '',
              phase !== 'idle' ? 'is-assembled' : '',
              phase === 'train' ? 'is-travelling' : '',
            ].filter(Boolean).join(' ')}
            style={{ '--lp-delay': `${index * 220}ms` }}
          />
        );
      })}
    </div>
  );
}

export default function LandingPage({ onNavigate }) {
  useEffect(() => {
    document.title = 'PlanWise AI — Digital Lesson Plan System';
    document.body.classList.add('lp-lock');
    return () => {
      document.body.classList.remove('lp-lock');
      document.title = 'PlanWise AI';
    };
  }, []);

  return (
    <div className="lp">
      <header className="lp-nav lp-nav-light">
        <button type="button" className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="lp-brand-mark"><GraduationCap size={18} /></span>
          <strong>PlanWise AI</strong>
        </button>
        <nav className="lp-nav-links" aria-label="Account">
          <button type="button" onClick={() => onNavigate('register')}>Sign Up</button>
          <span aria-hidden="true">|</span>
          <button type="button" onClick={() => onNavigate('login')}>Log In</button>
        </nav>
      </header>

      <section className="lp-hero lp-hero-split">
        <div className="lp-hero-inner lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-kicker">Digital Lesson Plan System</p>
            <h1>Plan smarter.<br />Teach better.</h1>
            <p className="lp-hero-lead">
              Help lecturers and teachers create, manage and organise digital lesson plans,
              learning materials, assessments and teaching activities in one calm workspace.
            </p>
            <button type="button" className="lp-cta" onClick={() => onNavigate('register')}>
              Get Started
            </button>
          </div>

          <div className="lp-hero-visual" aria-hidden="false">
            <AnimatedHeroCards onActivate={() => onNavigate('register')} />
          </div>
        </div>
        <WaveDivider from="#f7f3eb" to="#efe6da" />
      </section>

      <section className="lp-section lp-intro">
        <div className="lp-wrap lp-split">
          <Reveal className="lp-copy">
            <p className="lp-eyebrow">What the system is</p>
            <h2>Plan your lessons digitally.</h2>
            <p>
              PlanWise AI turns course outlines into a teaching structure you can actually use:
              topics, objectives, activities, assessments and a schedule that stays aligned with
              the classroom.
            </p>
          </Reveal>
          <Reveal className="lp-photo lp-portrait" delay={140}>
            <img src="/landing/hero.png?v=4" alt="A smiling graduate in academic dress" />
          </Reveal>
        </div>
      </section>

      <WaveDivider from="#efe6da" to="#f7f3eb" />

      <section className="lp-section lp-float-section">
        <div className="lp-wrap">
          <Reveal className="lp-copy lp-center">
            <p className="lp-eyebrow">How it helps</p>
            <h2>Everything teaching needs, kept close together.</h2>
            <p>
              Use floating tools for the parts of planning that used to live in separate documents,
              chats and spreadsheets.
            </p>
          </Reveal>
          <div className="lp-feature-static">
            {heroFeatures.map(({ icon: Icon, title, text }) => (
              <Reveal className="lp-float-card lp-static-card" key={title}>
                <button type="button" className="lp-orbit-card-hit" onClick={() => onNavigate('register')}>
                  <span className="lp-card-icon"><Icon size={18} /></span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <WaveDivider from="#f7f3eb" to="#fffdf9" />

      <section className="lp-section lp-ai">
        <div className="lp-wrap lp-split lp-split-reverse">
          <Reveal className="lp-photo lp-photo-portrait" delay={80}>
            <img src="/landing/graduate-roses.jpg" alt="Graduate in green academic dress holding roses" />
          </Reveal>
          <Reveal className="lp-copy" delay={160}>
            <p className="lp-eyebrow">AI assistance</p>
            <h2>Let AI help you build better lesson plans.</h2>
            <p>
              Talk through a topic, refine an explanation, or generate learning content from the
              materials you already teach. The assistant follows the conversation instead of
              handing you a canned reply.
            </p>
            <ul className="lp-points">
              <li><BrainCircuit size={16} /> Natural follow-up questions and explanations</li>
              <li><Sparkles size={16} /> Lesson ideas grounded in your course content</li>
              <li><MessageSquareText size={16} /> Quizzes, examples and assignments on request</li>
            </ul>
          </Reveal>
        </div>
      </section>

      <WaveDivider from="#fffdf9" to="#f3eee4" />

      <section className="lp-section lp-assess">
        <div className="lp-wrap lp-split">
          <Reveal className="lp-copy">
            <p className="lp-eyebrow">Assessments and quizzes</p>
            <h2>Create quizzes without starting from a blank page.</h2>
            <p>
              Turn learning materials into assessments that match the lesson. Review, edit and
              keep everything connected to the same course.
            </p>
          </Reveal>
          <Reveal className="lp-photo lp-photo-wide" delay={140}>
            <img src="/landing/ceremony.jpg" alt="An academic gathering in a lecture hall" />
          </Reveal>
        </div>
      </section>

      <WaveDivider from="#f3eee4" to="#efe6da" />

      <section className="lp-section lp-organise">
        <div className="lp-wrap">
          <Reveal className="lp-copy lp-center">
            <p className="lp-eyebrow">Organisation</p>
            <h2>Organise topics, objectives and activities.</h2>
            <p>Keep the teaching sequence visible, so progress is something you can see — not guess.</p>
          </Reveal>
          <div className="lp-story-cards">
            {storyCards.map(({ icon: Icon, title, text }, index) => (
              <Reveal className="lp-story-card" delay={index * 110} key={title}>
                <span className="lp-card-icon"><Icon size={18} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <WaveDivider from="#efe6da" to="#f7f3eb" />

      <section className="lp-section lp-schedule">
        <div className="lp-wrap lp-split lp-split-reverse">
          <Reveal className="lp-photo" delay={80}>
            <img src="/landing/graduates.jpg" alt="Graduates in academic dress" />
          </Reveal>
          <Reveal className="lp-copy" delay={160}>
            <p className="lp-eyebrow">Calendar planning</p>
            <h2>Keep your teaching schedule organised.</h2>
            <p>
              Place lessons, assessments and events on one calendar. When a plan changes, the
              schedule can move with it — so the term stays readable.
            </p>
          </Reveal>
        </div>
      </section>

      <WaveDivider from="#f7f3eb" to="#5c3d2e" />

      <section className="lp-finale lp-finale-dark">
        <div className="lp-wrap lp-split">
          <Reveal className="lp-copy">
            <p className="lp-eyebrow">One workspace</p>
            <h2>Everything you need to plan and teach in one place.</h2>
            <p>
              Digital lesson plans, AI support, assessments, materials and a teaching calendar —
              ready when your next class is.
            </p>
            <div className="lp-finale-actions">
              <button type="button" className="lp-cta" onClick={() => onNavigate('register')}>Get Started</button>
              <button type="button" className="lp-ghost" onClick={() => onNavigate('login')}>Log In</button>
            </div>
          </Reveal>
          <Reveal className="lp-photo lp-portrait" delay={140}>
            <img src="/landing/hero.png?v=4" alt="Graduate smiling in academic dress" />
          </Reveal>
        </div>
      </section>

      <footer className="lp-footer">
        <span>PlanWise AI</span>
        <small>Digital Lesson Plan System · {new Date().getFullYear()}</small>
      </footer>
    </div>
  );
}
