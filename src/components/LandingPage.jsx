import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  CloudUpload,
  GraduationCap,
  Menu,
  Sparkles,
  X,
} from 'lucide-react';
import TypedText from './TypedText.jsx';
import '../landing.css';

function LessonPlanIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lp-lesson-bg" x1="8" y1="4" x2="58" y2="60">
          <stop offset="0" stopColor="#ffe7a8" />
          <stop offset="1" stopColor="#e3942d" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lp-lesson-bg)" />
      <rect x="16" y="13" width="30" height="39" rx="4" fill="#fffdf8" />
      <path d="M38 13h8v13l-4-2.4L38 26V13z" fill="#d24b3c" />
      <rect x="21" y="22" width="16" height="2.6" rx="1.2" fill="#e0b15a" />
      <rect x="21" y="28" width="20" height="2.2" rx="1" fill="#f0e2c8" />
      <rect x="21" y="33.5" width="14" height="2.2" rx="1" fill="#f0e2c8" />
      <rect x="21" y="39" width="18" height="2.2" rx="1" fill="#f0e2c8" />
    </svg>
  );
}

function QuizIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lp-quiz-bg" x1="6" y1="4" x2="58" y2="60">
          <stop offset="0" stopColor="#49d18a" />
          <stop offset="1" stopColor="#157a45" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lp-quiz-bg)" />
      <rect x="18" y="16" width="28" height="36" rx="4" fill="#fff" />
      <rect x="26" y="11" width="12" height="8" rx="2.5" fill="#f0b429" />
      <path d="M24 30.5l2.8 2.8 6.2-7" fill="none" stroke="#178a48" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 41.5l2.8 2.8 6.2-7" fill="none" stroke="#178a48" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AssistantIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lp-chat-bg" x1="4" y1="2" x2="60" y2="62">
          <stop offset="0" stopColor="#8eb6ff" />
          <stop offset="1" stopColor="#5a45d6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lp-chat-bg)" />
      <path d="M15 22h30a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H29l-8 7v-7h-6a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6z" fill="#fff" />
      <circle cx="28" cy="34" r="2.2" fill="#5a45d6" />
      <circle cx="35" cy="34" r="2.2" fill="#5a45d6" />
      <circle cx="42" cy="34" r="2.2" fill="#5a45d6" />
      <path d="M48 13.5l1.5 3.4 3.4 1.5-3.4 1.5-1.5 3.4-1.5-3.4-3.4-1.5 3.4-1.5z" fill="#ffe08a" />
    </svg>
  );
}

function CalendarAppIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#f3efe6" />
      <rect x="11" y="15" width="42" height="37" rx="7" fill="#fff" />
      <path d="M11 22h42v-2.2A7 7 0 0 0 46 15H18a7 7 0 0 0-7 4.8V22z" fill="#e4533d" />
      <rect x="20" y="12" width="4" height="8" rx="2" fill="#3d332c" />
      <rect x="40" y="12" width="4" height="8" rx="2" fill="#3d332c" />
      <text x="32" y="44" textAnchor="middle" fontSize="16" fontWeight="800" fill="#2c241e" fontFamily="Manrope, sans-serif">12</text>
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lp-up-bg" x1="8" y1="4" x2="56" y2="60">
          <stop offset="0" stopColor="#79c4ff" />
          <stop offset="1" stopColor="#1f6fd0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lp-up-bg)" />
      <path d="M14 30h12l3.5-6H50a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V34a4 4 0 0 1 4-4z" fill="#ffe6a3" />
      <path d="M32 29v15" stroke="#1c5eae" strokeWidth="3" strokeLinecap="round" />
      <path d="M25.5 35.5 32 28l6.5 7.5" fill="none" stroke="#1c5eae" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LevelsIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lp-lv-bg" x1="6" y1="4" x2="58" y2="60">
          <stop offset="0" stopColor="#3e8f72" />
          <stop offset="1" stopColor="#16382c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lp-lv-bg)" />
      <rect x="13" y="38" width="11" height="14" rx="2.5" fill="#8ee0b0" />
      <rect x="26.5" y="27" width="11" height="25" rx="2.5" fill="#f2c14e" />
      <rect x="40" y="15" width="11" height="37" rx="2.5" fill="#fff" />
    </svg>
  );
}

const features = [
  { icon: LessonPlanIcon, title: 'AI-Powered Lesson Plans', text: 'Generate detailed, structured lesson plans from your course content.' },
  { icon: QuizIcon, title: 'Assessments & Quizzes', text: 'Create tests, worksheets, and quizzes at the right difficulty level.' },
  { icon: AssistantIcon, title: 'AI Assistant', text: 'Ask for ideas, refine a plan, and get teaching support in conversation.' },
  { icon: CalendarAppIcon, title: 'Smart Calendar', text: 'Place lessons, assessments, and activities on one teaching schedule.' },
  { icon: UploadIcon, title: 'Upload Your Files', text: 'Use your own documents, PDFs, and notes as the source for generation.' },
  { icon: LevelsIcon, title: 'Multiple Difficulty Levels', text: 'Generate at Easy, Advanced, or Professional depth for every learner.' },
];

const steps = [
  { icon: CloudUpload, title: 'Upload Your Files', text: 'Add your documents, PDFs, or lesson materials.' },
  { icon: Sparkles, title: 'Let AI Work', text: 'Generate lesson plans, assessments, and quizzes in seconds.' },
  { icon: CalendarDays, title: 'Review & Edit', text: 'Make changes, adjust the level, and save to your calendar.' },
];

// DEMO ONLY — replace these sample quotes with real educator testimonials before publishing them as fact.
const demoTestimonials = [
  { quote: 'Sample quote: planning a week of lessons from one outline used to take an evening. This is the kind of help I want beside the classroom.', name: 'Sample educator', role: 'Placeholder · High school' },
  { quote: 'Sample quote: quizzes and lesson activities that stay tied to the same material would save our department a lot of repeated work.', name: 'Sample lecturer', role: 'Placeholder · University' },
  { quote: 'Sample quote: a calm workspace for plans, assessments, and the calendar is what I would actually open on a Sunday night.', name: 'Sample teacher', role: 'Placeholder · Primary' },
];

const benefits = [
  'User-friendly and intuitive design',
  'AI-powered lesson planning',
  'Interactive teaching assistant',
  'Smart calendar for lessons and assessments',
  'Easy, Advanced, and Professional levels',
  'Works across phones, tablets, and desktops',
];

function Reveal({ className = '', delay = 0, children, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        node.classList.add('is-visible');
        observer.disconnect();
      }
    }, { threshold: 0.14 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`lp-reveal ${className}`} style={{ '--lp-delay': `${delay}ms` }} {...rest}>
      {children}
    </div>
  );
}

export default function LandingPage({ onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const fanRef = useRef(null);
  const featureGridRef = useRef(null);

  useEffect(() => {
    document.title = 'PlanWise AI — Digital Lesson Plan System';
    document.body.classList.add('lp-lock');
    return () => {
      document.body.classList.remove('lp-lock');
      document.title = 'PlanWise AI';
    };
  }, []);

  useEffect(() => {
    const node = fanRef.current;
    if (!node) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.classList.add('is-visible');
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        node.classList.add('is-visible');
        observer.disconnect();
      }
    }, { threshold: 0.28 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const grid = featureGridRef.current;
    if (!grid) return undefined;
    const showCards = () => {
      grid.querySelectorAll('.lp-feature-card').forEach((card) => card.classList.add('is-visible'));
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      showCards();
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        showCards();
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  function go(section) {
    setMenuOpen(false);
    onNavigate(section);
  }

  function scrollToId(id) {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function tiltCard(event) {
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty('--tilt-x', `${(-py * 5).toFixed(2)}deg`);
    card.style.setProperty('--tilt-y', `${(px * 6).toFixed(2)}deg`);
  }

  function resetCard(event) {
    event.currentTarget.style.removeProperty('--tilt-x');
    event.currentTarget.style.removeProperty('--tilt-y');
  }

  return (
    <div className="lp">
      <header className="lp-nav">
        <button type="button" className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="lp-brand-mark"><GraduationCap size={18} /></span>
          <strong>PlanWise AI</strong>
        </button>
        <nav className={`lp-nav-links ${menuOpen ? 'is-open' : ''}`} aria-label="Account">
          <button type="button" onClick={() => go('login')}>Log In</button>
          <button type="button" className="lp-nav-signup" onClick={() => go('register')}>Sign Up</button>
        </nav>
        <button type="button" className="lp-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen((value) => !value)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-shade" aria-hidden="true" />
        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <p className="lp-kicker">AI-powered education</p>
            <h1>
              <TypedText text="Smarter lesson plans." keepCaret={false} />
              <TypedText as="em" text="Brighter classrooms." startDelay={"Smarter lesson plans.".length * 46 + 260} />
            </h1>
            <p>
              Create lesson plans, assessments, quizzes, and teaching resources with an assistant
              designed for lecturers and teachers.
            </p>
            <div className="lp-hero-actions">
              <button type="button" className="lp-btn lp-btn-gold" onClick={() => go('register')}>
                Get Started Free
              </button>
            </div>
            <div className="lp-proof">
              <span className="lp-proof-faces" aria-hidden="true"><i /><i /><i /><i /></span>
              <strong>Built for modern educators</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section" id="lp-features">
        <div className="lp-wrap">
          <Reveal className="lp-center">
            <p className="lp-eyebrow">Why choose us</p>
            <h2>Everything you need for modern teaching</h2>
            <p>From lesson plans to assessments, PlanWise keeps the tools of a teaching week in one calm workspace.</p>
          </Reveal>
          <div className="lp-feature-grid" ref={featureGridRef}>
            {features.map(({ icon: Icon, title, text }, index) => (
              <Reveal className={`lp-feature-card lp-assemble ${index < 3 ? 'from-row-left' : 'from-row-right'}`} delay={0} key={title} onMouseMove={tiltCard} onMouseLeave={resetCard}>
                <div className="lp-card-body">
                  <span className="lp-card-icon"><Icon /></span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-showcase">
        <div className="lp-wrap lp-split">
          <Reveal className="lp-showcase-visual">
            <img src="/landing/hero-desk.jpg" alt="A wooden desk with books, a plant, and a laptop" />
            <div className="lp-app-mock" aria-hidden="true">
              <div className="lp-app-mock-bar"><GraduationCap size={14} /> PlanWise AI</div>
              <strong>Create your lesson plan</strong>
              <span>Course · Topics · Schedule</span>
              <i />
              <i />
              <em>Objectives ready</em>
            </div>
          </Reveal>
          <Reveal className="lp-copy" delay={120}>
            <p className="lp-eyebrow">Built for educators</p>
            <h2>Save time. Teach better.</h2>
            <ul className="lp-checks">
              {benefits.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <button type="button" className="lp-btn lp-btn-gold" onClick={() => go('register')}>
              Get Started Free
            </button>
          </Reveal>
        </div>
      </section>

      <section className="lp-section" id="lp-how">
        <div className="lp-wrap">
          <Reveal className="lp-center">
            <p className="lp-eyebrow">How it works</p>
            <h2>Get started in 3 simple steps</h2>
            <p>Upload what you already teach, let the assistant draft the structure, then edit before you save.</p>
          </Reveal>
          <div className="lp-steps">
            {steps.map(({ icon: Icon, title, text }, index) => (
              <Reveal className="lp-step" delay={index * 90} key={title}>
                <span className="lp-step-num">{index + 1}</span>
                <span className="lp-step-icon"><Icon size={20} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-quotes" id="lp-stories">
        <div className="lp-wrap">
          <Reveal className="lp-center lp-quotes-head">
            <p className="lp-eyebrow">Sample voices</p>
            <h2>What teachers are saying</h2>
            <p>These cards are editable placeholders, not real reviews.</p>
          </Reveal>
          <div className="lp-quote-row">
            {demoTestimonials.map((item, index) => (
              <Reveal className="lp-quote" delay={index * 80} key={item.name}>
                <span className="lp-stars" aria-hidden="true">★★★★★</span>
                <p>{item.quote}</p>
                <footer>
                  <span className="lp-avatar" aria-hidden="true">{item.name.slice(0, 1)}</span>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.role}</small>
                  </div>
                </footer>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-finale-wrap" id="lp-start" aria-label="Graduation photographs">
        <div className="lp-fan" ref={fanRef}>
          <figure className="lp-fan-card lp-fan-left">
            <div className="lp-fan-sheet">
              <img src="/landing/grad-bouquet.jpg" alt="A graduate in a green gown holding a bouquet of red roses" />
            </div>
          </figure>
          <figure className="lp-fan-card lp-fan-right">
            <div className="lp-fan-sheet">
              <img src="/landing/grad-group.jpg" alt="Four graduates in green gowns standing together outdoors" />
            </div>
          </figure>
          <figure className="lp-fan-card lp-fan-center">
            <div className="lp-fan-sheet">
              <img src="/landing/grad-portrait.jpg" alt="A graduate in a black and red gown smiling during a ceremony" />
            </div>
          </figure>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <button type="button" className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <span className="lp-brand-mark"><GraduationCap size={16} /></span>
              <strong>PlanWise AI</strong>
            </button>
            <p>Help educators create lesson plans, assessments, quizzes, and teaching resources with a calm AI workspace.</p>
            <div className="lp-social" aria-label="Social">
              <span title="Facebook" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M14 9h3V6h-3c-1.7 0-3 1.3-3 3v2H8v3h3v7h3v-7h3l1-3h-4V9c0-.6.4-1 1-1z" /></svg></span>
              <span title="Instagram" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" strokeWidth="1.8" d="M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" /><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" /></svg></span>
              <span title="X" aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M14.7 10.4 21.4 3h-1.6l-5.8 6.4L9.2 3H3.5l7 10-7 7.6h1.6l6.1-6.8 4.9 6.8h5.7l-7.1-9.2Zm-2.2 2.4-.7-1L5.7 4.2h2.4l4.5 6.2.7 1 5.9 8.2h-2.4l-4.3-5.8Z" /></svg></span>
              <span title="LinkedIn" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6.5 9H4V20h2.5V9ZM5.2 4A1.6 1.6 0 1 0 5.2 7.2 1.6 1.6 0 0 0 5.2 4ZM20 20h-2.5v-5.6c0-1.6-.6-2.6-2-2.6-1 0-1.6.7-1.9 1.4-.1.2-.1.6-.1.9V20H11V9h2.4v1.5c.4-.7 1.3-1.8 3.2-1.8 2.3 0 4 1.5 4 4.8V20Z" /></svg></span>
            </div>
          </div>
          <nav className="lp-footer-col" aria-label="Product">
            <strong>Product</strong>
            <button type="button" onClick={() => scrollToId('lp-features')}>Lesson plans</button>
            <button type="button" onClick={() => scrollToId('lp-features')}>Assessments</button>
            <button type="button" onClick={() => scrollToId('lp-features')}>Quizzes</button>
            <button type="button" onClick={() => scrollToId('lp-features')}>AI assistant</button>
            <button type="button" onClick={() => scrollToId('lp-features')}>Calendar</button>
          </nav>
          <nav className="lp-footer-col" aria-label="Company">
            <strong>Company</strong>
            <button type="button" onClick={() => scrollToId('lp-stories')}>About</button>
            <button type="button" onClick={() => scrollToId('lp-features')}>Features</button>
            <button type="button" onClick={() => scrollToId('lp-start')}>Contact</button>
            <button type="button" onClick={() => go('login')}>Help</button>
          </nav>
          <div className="lp-footer-cta">
            <strong>Ready to teach smarter?</strong>
            <p>Open your workspace and start a lesson plan.</p>
            <button type="button" className="lp-btn lp-btn-gold" onClick={() => go('register')}>Get Started Free</button>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <small>© {new Date().getFullYear()} PlanWise AI. All rights reserved.</small>
        </div>
      </footer>
    </div>
  );
}
