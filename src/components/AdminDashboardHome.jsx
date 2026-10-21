import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  LogIn,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import AssignRoleDialog from './AssignRoleDialog.jsx';
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

function formatWhen(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function formatShortTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function initialsFrom(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
}

function activityIcon(summary = '') {
  const text = String(summary).toLowerCase();
  if (text.includes('fail')) return Activity;
  if (text.includes('sign') || text.includes('login') || text.includes('signed')) return LogIn;
  if (text.includes('account') || text.includes('approval') || text.includes('register')) return UserPlus;
  if (text.includes('assessment') || text.includes('quiz')) return ClipboardCheck;
  if (text.includes('lesson') || text.includes('plan')) return FileText;
  return Activity;
}

export default function AdminDashboardHome({
  user,
  overview,
  loading = false,
  error = '',
  onNavigate,
  onRefresh,
}) {
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [assigning, setAssigning] = useState(null);
  const [notice, setNotice] = useState('');
  const cards = overview?.cards || {};
  const pending = overview?.pendingApprovals || [];
  const recent = overview?.recentActivity || [];
  const displayName = String(user?.name || 'Administrator').trim();
  const todayDisplay = new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const monthCells = useMemo(() => buildMonthMatrix(monthAnchor), [monthAnchor]);
  const monthLabel = monthAnchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const todayDate = new Date().getDate();
  const isCurrentMonth = monthAnchor.getMonth() === new Date().getMonth()
    && monthAnchor.getFullYear() === new Date().getFullYear();
  const pendingCount = cards.pendingApprovals ?? pending.length ?? 0;

  const pendingAside = (
    <aside className={`pw-hero-panel ${pendingCount > 0 ? 'is-active' : ''}`}>
      <div className="pw-hero-panel-status">
        <span className="pw-hero-dot" />
        <strong>{pendingCount > 0 ? 'Approvals waiting' : 'Inbox clear'}</strong>
      </div>
      <div className="pw-hero-panel-value">{pendingCount}</div>
      <small>
        {pendingCount === 1 ? 'Pending account request' : 'Pending account requests'}
        {' · '}
        {todayDisplay.replace(/^.*?,\s*/, '')}
      </small>
      <button type="button" className="pw-hero-panel-btn" onClick={() => onNavigate?.('admin-users')}>
        <Users size={14} /> Review accounts <ArrowRight size={14} />
      </button>
    </aside>
  );

  return (
    <div className="dlp-dash">
      <div className="dlp-dash-main">
        <DashboardHero
          userName={displayName}
          subtitle="Here's what's happening with your system today."
          workspaceLabel="PlanWise Administration"
          workspaceHint="Your workspace"
          roleLabel="Administrator"
          roleHint="Your role"
          variant="admin"
          aside={pendingAside}
        />

        {error ? <p className="dlp-empty">{error}</p> : null}
        {notice ? <p className="dlp-empty">{notice}</p> : null}
        {loading && !overview ? <p className="dlp-empty">Loading platform totals...</p> : null}

        <section className="dlp-actions">
          <article className="dlp-action tone-green">
            <span className="dlp-action-icon"><Users size={20} /></span>
            <h3>Manage Users</h3>
            <p>Create educator accounts and approve sign-up requests.</p>
            <button type="button" className="dlp-action-cta" onClick={() => onNavigate?.('admin-users')}>
              Open Accounts <ArrowRight size={14} />
            </button>
          </article>
          <article className="dlp-action tone-blue">
            <span className="dlp-action-icon"><FileText size={20} /></span>
            <h3>Lesson Plans</h3>
            <p>Review plans saved by lecturers and teachers.</p>
            <button type="button" className="dlp-action-cta" onClick={() => onNavigate?.('admin-plans')}>
              View Plans <ArrowRight size={14} />
            </button>
          </article>
          <article className="dlp-action tone-purple">
            <span className="dlp-action-icon"><ClipboardCheck size={20} /></span>
            <h3>Assessments</h3>
            <p>Inspect quizzes and assessments across the platform.</p>
            <button type="button" className="dlp-action-cta" onClick={() => onNavigate?.('admin-assessments')}>
              Open Assessments <ArrowRight size={14} />
            </button>
          </article>
          <article className="dlp-action tone-gold">
            <span className="dlp-action-icon"><Activity size={20} /></span>
            <h3>System Activity</h3>
            <p>Track registrations, AI usage, and attendance events.</p>
            <button type="button" className="dlp-action-cta" onClick={() => onNavigate?.('admin-activity')}>
              View Activity <ArrowRight size={14} />
            </button>
          </article>
        </section>

        <section className="dlp-mid-grid">
          <article className="dlp-card">
            <header className="dlp-card-head">
              <h2>Pending approvals</h2>
              <button type="button" className="dlp-link" onClick={() => onNavigate?.('admin-users')}>View all</button>
            </header>
            {pending.length ? (
              <div className="pw-pending-list">
                {pending.slice(0, 6).map((item) => {
                  const name = item.fullName || item.name || 'Pending user';
                  return (
                    <div key={item.id} className="pw-pending-row">
                      <span className="pw-pending-avatar" aria-hidden="true">{initialsFrom(name)}</span>
                      <div className="pw-pending-copy">
                        <strong>{name}</strong>
                        <span>{item.email}</span>
                        <div className="pw-pending-meta">
                          {(item.requestedRole || item.username || item.role) ? (
                            <em className="pw-role-chip">{item.requestedRole || item.role}{item.username ? ` · ${item.username}` : ''}</em>
                          ) : null}
                          <small>{formatWhen(item.createdAt)}</small>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="pw-pending-action"
                        onClick={() => setAssigning(item)}
                      >
                        Approve
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="dlp-empty">No accounts are waiting for approval.</p>
            )}
          </article>

          <article className="dlp-card">
            <header className="dlp-card-head">
              <h2>Recent activity</h2>
              <button type="button" className="dlp-link" onClick={() => onNavigate?.('admin-activity')}>View all</button>
            </header>
            {recent.length ? (
              <div className="pw-activity-list">
                {recent.slice(0, 6).map((row) => {
                  const Icon = activityIcon(row.summary);
                  return (
                    <div key={row.id} className="pw-activity-row">
                      <span className="pw-activity-icon" aria-hidden="true"><Icon size={16} /></span>
                      <div className="pw-activity-copy">
                        <strong>{row.summary}</strong>
                        <span>{row.user || 'System'}</span>
                      </div>
                      <time className="pw-activity-time" dateTime={row.createdAt}>
                        {formatShortTime(row.createdAt)}
                        <br />
                        {new Date(row.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </time>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="dlp-empty">No recent activity yet.</p>
            )}
          </article>

          <article className="dlp-card dlp-cal-card">
            <header className="dlp-card-head">
              <h2>Platform calendar</h2>
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
                  className={`dlp-cal-day ${day && isCurrentMonth && day === todayDate ? 'today' : ''} ${day ? '' : 'empty'}`}
                  disabled={!day}
                  onClick={() => onNavigate?.('admin-attendance')}
                >
                  {day || ''}
                </button>
              ))}
            </div>
            <div className="pw-quick-links">
              <button type="button" className="pw-quick-link" onClick={() => onNavigate?.('admin-attendance')}>
                <Clock3 size={16} /> Attendance
              </button>
              <button type="button" className="pw-quick-link" onClick={() => onNavigate?.('admin-analytics')}>
                <BarChart3 size={16} /> Analytics
              </button>
            </div>
          </article>
        </section>

        <section className="dlp-lower-row">
          <div className="dlp-stats">
            <header className="dlp-card-head">
              <h2><TrendingUp size={15} /> Platform stats</h2>
            </header>
            <div className="dlp-stats-row">
              <div className="dlp-stat tone-green">
                <span className="dlp-stat-icon"><Users size={14} /></span>
                <span>Total users</span>
                <strong>{cards.users ?? 0}</strong>
                <small>{cards.approvedUsers ?? 0} approved</small>
              </div>
              <div className="dlp-stat tone-blue">
                <span className="dlp-stat-icon"><FileText size={14} /></span>
                <span>Lesson plans</span>
                <strong>{cards.lessonPlans ?? 0}</strong>
                <small>Across the platform</small>
              </div>
              <div className="dlp-stat tone-gold">
                <span className="dlp-stat-icon"><ClipboardCheck size={14} /></span>
                <span>Assessments</span>
                <strong>{cards.assessmentsAndQuizzes ?? 0}</strong>
                <small>{cards.assessments ?? 0} tests · {cards.quizzes ?? 0} quizzes</small>
              </div>
              <div className="dlp-stat tone-purple">
                <span className="dlp-stat-icon"><Clock3 size={14} /></span>
                <span>Attendance</span>
                <strong>{cards.attendanceSessions ?? 0}</strong>
                <small>Clock-in sessions</small>
              </div>
            </div>
          </div>
          <aside className="dlp-quote-card" aria-label="Inspiration">
            <div className="dlp-quote-media">
              <p className="dlp-quote-main">Great systems are built by great people.</p>
              <span className="dlp-quote-rule" />
              <p className="dlp-quote-sub">Approve thoughtfully. Lead clearly.</p>
            </div>
          </aside>
        </section>
      </div>

      <AssignRoleDialog
        user={assigning}
        onClose={() => setAssigning(null)}
        onApproved={() => {
          setAssigning(null);
          setNotice('Role assigned and login email queued.');
          onRefresh?.();
        }}
      />
    </div>
  );
}
