import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileStack,
  FileText,
  TrendingUp,
} from 'lucide-react';
import DashboardHero from './DashboardHero.jsx';
import './dashboard-reference.css';
import './dashboard-premium.css';

function buildMonthMatrix(anchor) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatClock(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DashboardHome({
  user,
  savedPlans = [],
  assessments = [],
  calendarEvents = [],
  markingCount = 0,
  dateLabel,
  activeClock = null,
  onClockIn,
  onClockOut,
  onNavigate,
  onCreatePlan,
}) {
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const displayName = String(user?.name || '').trim();
  const institution = String(user?.institution || '').trim();
  const role = String(user?.role || '').trim();
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayDisplay = dateLabel
    || new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const todaySchedule = useMemo(() => (
    calendarEvents
      .filter((event) => String(event.date || '') === todayKey)
      .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')))
      .slice(0, 6)
      .map((event, index) => ({
        id: event.id || `${event.title}-${index}`,
        time: [event.startTime, event.endTime].filter(Boolean).join(' – ') || 'All day',
        title: event.title,
        place: event.description || event.type || '',
        tone: (index % 4) + 1,
      }))
  ), [calendarEvents, todayKey]);

  const deadlines = useMemo(() => (
    calendarEvents
      .filter((event) => {
        const type = String(event.type || '').toLowerCase();
        return ['assessment', 'assignment', 'exam', 'deadline', 'quiz'].includes(type)
          || /due|deadline|submit/i.test(event.title || '');
      })
      .filter((event) => event.date)
      .map((event) => {
        const due = daysUntil(event.date);
        return {
          id: event.id,
          title: event.title,
          meta: [event.description, event.type].filter(Boolean).join(' · ') || event.type || '',
          badge: new Date(`${event.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase(),
          dueLabel: due == null ? 'Upcoming' : due < 0 ? 'Overdue' : due === 0 ? 'Due today' : `Due in ${due} day${due === 1 ? '' : 's'}`,
          urgency: due != null && due <= 3 ? 'hot' : due != null && due <= 7 ? 'warm' : 'calm',
          sortKey: event.date,
        };
      })
      .sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)))
      .slice(0, 5)
  ), [calendarEvents]);

  const monthCells = useMemo(() => buildMonthMatrix(monthAnchor), [monthAnchor]);
  const monthLabel = monthAnchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const todayDate = new Date().getDate();
  const isCurrentMonth = monthAnchor.getMonth() === new Date().getMonth() && monthAnchor.getFullYear() === new Date().getFullYear();

  const eventDays = useMemo(() => {
    const year = monthAnchor.getFullYear();
    const month = monthAnchor.getMonth();
    const set = new Set();
    calendarEvents.forEach((event) => {
      if (!event.date) return;
      const date = new Date(`${event.date}T12:00:00`);
      if (date.getFullYear() === year && date.getMonth() === month) set.add(date.getDate());
    });
    return set;
  }, [calendarEvents, monthAnchor]);

  const todayEvents = todaySchedule.slice(0, 3);
  const planCount = savedPlans.length;
  const assessmentCount = assessments.length;
  const paperCount = Number(markingCount) || 0;

  const clockAside = (
    <aside className={`pw-hero-panel ${activeClock ? 'is-active' : ''}`}>
      <div className="pw-hero-panel-status">
        <span className="pw-hero-dot" />
        <strong>{activeClock ? 'Clocked In' : 'Clocked Out'}</strong>
      </div>
      <div className="pw-hero-panel-value">
        {activeClock ? formatClock(activeClock.clockIn) : '—'}
      </div>
      <small>Today, {todayDisplay.replace(/^.*?,\s*/, '')}</small>
      {activeClock ? (
        <button type="button" className="pw-hero-panel-btn soft" onClick={onClockOut}>
          <Clock3 size={14} /> Clock Out
        </button>
      ) : (
        <button type="button" className="pw-hero-panel-btn" onClick={onClockIn}>
          <Clock3 size={14} /> Clock In
        </button>
      )}
    </aside>
  );

  return (
    <div className="dlp-dash">
      <div className="dlp-dash-main">
        <DashboardHero
          userName={displayName || 'Educator'}
          subtitle="Plan better. Teach smarter. Make an impact today."
          workspaceLabel={institution || 'Institution not set'}
          workspaceHint="Your institution"
          roleLabel={role || 'Role not set'}
          roleHint="Your role"
          variant="educator"
          aside={clockAside}
        />

        <section className="dlp-actions">
          <article className="dlp-action tone-green">
            <span className="dlp-action-icon"><BookOpen size={20} /></span>
            <h3>Create Lesson Plan</h3>
            <p>Build or generate lesson plans with AI assistance.</p>
            <button type="button" className="dlp-action-cta" onClick={onCreatePlan}>
              New Lesson Plan <ArrowRight size={14} />
            </button>
          </article>
          <article className="dlp-action tone-blue">
            <span className="dlp-action-icon"><CalendarDays size={20} /></span>
            <h3>View Calendar</h3>
            <p>Check your schedule and upcoming events.</p>
            <button type="button" className="dlp-action-cta" onClick={() => onNavigate?.('calendar')}>
              Open Calendar <ArrowRight size={14} />
            </button>
          </article>
          <article className="dlp-action tone-purple">
            <span className="dlp-action-icon"><ClipboardCheck size={20} /></span>
            <h3>Create Assessment</h3>
            <p>Build quizzes, tests and assignments.</p>
            <button type="button" className="dlp-action-cta" onClick={() => onNavigate?.('assessments')}>
              New Assessment <ArrowRight size={14} />
            </button>
          </article>
          <article className="dlp-action tone-gold">
            <span className="dlp-action-icon"><FileStack size={20} /></span>
            <h3>Upload & Mark Papers</h3>
            <p>Scan or upload papers and let AI mark them.</p>
            <button type="button" className="dlp-action-cta" onClick={() => onNavigate?.('paper-marking')}>
              Start Marking <ArrowRight size={14} />
            </button>
          </article>
        </section>

        <section className="dlp-mid-grid">
          <article className="dlp-card">
            <header className="dlp-card-head">
              <h2>Today&apos;s Schedule</h2>
              <button type="button" className="dlp-link" onClick={() => onNavigate?.('calendar')}>View All</button>
            </header>
            {todaySchedule.length ? (
              <div className="dlp-schedule-list">
                {todaySchedule.map((item) => (
                  <div key={item.id} className={`dlp-schedule-row tone-${item.tone}`}>
                    <span className="dlp-dot" />
                    <div>
                      <small>{item.time}</small>
                      <strong>{item.title}</strong>
                      {item.place ? <span>{item.place}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dlp-empty">No activities scheduled for today.</p>
            )}
          </article>

          <article className="dlp-card">
            <header className="dlp-card-head">
              <h2>Upcoming Deadlines</h2>
            </header>
            {deadlines.length ? (
              <div className="dlp-deadline-list">
                {deadlines.map((item) => (
                  <div key={item.id} className="dlp-deadline-row">
                    <span className="dlp-date-badge">{item.badge}</span>
                    <div className="dlp-deadline-copy">
                      <strong>{item.title}</strong>
                      {item.meta ? <span>{item.meta}</span> : null}
                    </div>
                    <em className={item.urgency}>{item.dueLabel}</em>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dlp-empty">No upcoming deadlines.</p>
            )}
          </article>

          <article className="dlp-card dlp-cal-card">
            <header className="dlp-card-head">
              <h2>My Calendar</h2>
              <div className="dlp-cal-nav">
                <button type="button" aria-label="Previous month" onClick={() => setMonthAnchor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft size={14} /></button>
                <strong>{monthLabel}</strong>
                <button type="button" aria-label="Next month" onClick={() => setMonthAnchor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight size={14} /></button>
              </div>
            </header>
            <div className="dlp-cal-weekdays">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="dlp-cal-grid">
              {monthCells.map((day, index) => (
                <button
                  key={`${monthLabel}-${index}`}
                  type="button"
                  className={`dlp-cal-day ${day && isCurrentMonth && day === todayDate ? 'today' : ''} ${day && eventDays.has(day) ? 'has-event' : ''} ${day ? '' : 'empty'}`}
                  disabled={!day}
                  onClick={() => onNavigate?.('calendar')}
                >
                  {day || ''}
                </button>
              ))}
            </div>
            <div className="dlp-today-events">
              <h3>Today&apos;s Events</h3>
              {todayEvents.length ? todayEvents.map((item) => (
                <div key={item.id}><strong>{item.title}</strong><span>{item.time}</span></div>
              )) : (
                <p className="dlp-empty compact">No events today.</p>
              )}
            </div>
            <div className="pw-quick-links">
              <button type="button" className="pw-quick-link" onClick={() => onNavigate?.('assessments')}>
                <ClipboardCheck size={16} /> Assessments
              </button>
              <button type="button" className="pw-quick-link" onClick={() => onNavigate?.('calendar')}>
                <CalendarDays size={16} /> Full calendar
              </button>
            </div>
          </article>
        </section>

        <section className="dlp-lower-row">
          <div className="dlp-stats">
            <header className="dlp-card-head">
              <h2><TrendingUp size={15} /> Quick Stats</h2>
            </header>
            <div className="dlp-stats-row">
              <div className="dlp-stat tone-green">
                <span className="dlp-stat-icon"><BookOpen size={14} /></span>
                <span>Lesson Plans</span>
                <strong>{planCount}</strong>
                <small>{planCount ? 'Total in workspace' : 'No data yet'}</small>
              </div>
              <div className="dlp-stat tone-blue">
                <span className="dlp-stat-icon"><ClipboardCheck size={14} /></span>
                <span>Assessments</span>
                <strong>{assessmentCount}</strong>
                <small>{assessmentCount ? 'Created in workspace' : 'No data yet'}</small>
              </div>
              <div className="dlp-stat tone-gold">
                <span className="dlp-stat-icon"><FileText size={14} /></span>
                <span>Papers Marked</span>
                <strong>{paperCount}</strong>
                <small>{paperCount ? 'Completed' : 'No data yet'}</small>
              </div>
              <div className="dlp-stat tone-purple">
                <span className="dlp-stat-icon"><Clock3 size={14} /></span>
                <span>Attendance</span>
                <strong>{activeClock ? formatClock(activeClock.clockIn) : '—'}</strong>
                <small>{activeClock ? 'Clocked in today' : 'Not clocked in'}</small>
              </div>
            </div>
          </div>
          <aside className="dlp-quote-card" aria-label="Inspiration">
            <div className="dlp-quote-media">
              <p className="dlp-quote-main">Small steps create big progress.</p>
              <span className="dlp-quote-rule" />
              <p className="dlp-quote-sub">Keep going, you&apos;re making a difference!</p>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
