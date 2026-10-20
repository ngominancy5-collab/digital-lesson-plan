import { useEffect, useState } from 'react';
import { adminApi } from '../services/api.js';
import './admin-panel.css';

const RANGES = [
  ['7', '7 days'],
  ['30', '30 days'],
  ['90', '90 days'],
  ['all', 'All history'],
];

function formatWhen(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="admin-pager">
      <span className="admin-muted">{total} records</span>
      <div className="admin-actions">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="admin-muted">Page {page} of {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

function Bars({ series }) {
  const max = Math.max(1, ...series.map((item) => item.count));
  if (!series.length) return <p className="admin-muted">No records in this range.</p>;
  return (
    <div className="admin-chart" aria-hidden="true">
      {series.map((item) => (
        <div className="admin-bar" key={item.date} title={`${item.date}: ${item.count}`}>
          <span style={{ height: `${Math.max(4, (item.count / max) * 100)}px` }} />
          <small>{item.date.slice(5)}</small>
        </div>
      ))}
    </div>
  );
}

function useLoad(loader, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(deps);
  useEffect(() => {
    let active = true;
    setLoading(true);
    loader()
      .then((next) => { if (active) { setData(next); setError(''); } })
      .catch((err) => { if (active) setError(err.message || 'Could not load this page.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [key]);
  return { data, error, loading, reload: () => loader().then(setData).catch((err) => setError(err.message || 'Could not load this page.')) };
}

export function AssignRoleDialog({ user, onClose, onApproved }) {
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  if (!user) return null;
  async function submit(event) {
    event.preventDefault();
    if (!role) {
      setError('Select Teacher or Lecturer.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await adminApi.approve(user.id, { role });
      onApproved();
    } catch (err) {
      setError(err.message || 'The account was not approved.');
      setLoading(false);
    }
  }
  return (
    <div className="admin-dialog-backdrop" role="presentation">
      <form className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="assign-role-title" onSubmit={submit}>
        <h2 id="assign-role-title">Approve and Assign Role</h2>
        <div className="admin-identity">
          <strong>{user.fullName || user.name}</strong>
          <span>{user.email}</span>
          <span>{user.institution || 'No institution'} · Registered {formatWhen(user.createdAt)}</span>
        </div>
        <fieldset className="admin-role-choice">
          <legend>Assigned role</legend>
          {['teacher', 'lecturer'].map((item) => (
            <label key={item}>
              <input type="radio" name="assigned-role" value={item} checked={role === item} onChange={() => { setRole(item); setError(''); }} />
              <span>{item === 'teacher' ? 'Teacher' : 'Lecturer'}</span>
            </label>
          ))}
        </fieldset>
        {error && <p className="admin-error">{error}</p>}
        <div className="admin-actions">
          <button type="submit" className="primary" disabled={loading || !role}>{loading ? 'Approving...' : 'Approve and Send Role'}</button>
          <button type="button" onClick={onClose} disabled={loading}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default function AdminPanel({ section }) {
  if (section === 'admin-users') return <UsersPage />;
  if (section === 'admin-activity') return <ActivityPage />;
  if (section === 'admin-plans') return <PlansPage />;
  if (section === 'admin-assessments') return <AssessmentsPage />;
  if (section === 'admin-attendance') return <AttendancePage />;
  if (section === 'admin-ai') return <AiPage />;
  if (section === 'admin-analytics') return <AnalyticsPage />;
  return <OverviewPage />;
}

function OverviewPage() {
  const { data, error, loading, reload } = useLoad(() => adminApi.overview(), []);
  const [assigning, setAssigning] = useState(null);
  const [notice, setNotice] = useState('');
  const cards = data?.cards;
  return (
    <section className="admin-panel">
      <div className="admin-heading">
        <span className="admin-kicker">ADMINISTRATION</span>
        <h1>Welcome back, Administrator</h1>
        <p>Monitor your platform&apos;s users, educational activities, and performance in one place.</p>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {notice && <p className="admin-note">{notice}</p>}
      {loading && <p className="admin-muted">Loading platform totals...</p>}
      {cards && (
        <>
          <div className="admin-cards">
            <article className="admin-card"><span>Total Users</span><strong>{cards.users}</strong></article>
            <article className="admin-card"><span>Pending Approvals</span><strong>{cards.pendingApprovals}</strong></article>
            <article className="admin-card"><span>Approved Users</span><strong>{cards.approvedUsers}</strong></article>
            <article className="admin-card"><span>Awaiting Role Confirmation</span><strong>{cards.awaitingRoleConfirmation}</strong></article>
            <article className="admin-card"><span>Confirmed Accounts</span><strong>{cards.confirmedAccounts}</strong></article>
            <article className="admin-card"><span>Suspended Accounts</span><strong>{cards.suspendedAccounts}</strong></article>
          </div>
          <article className="admin-table-card">
            <h2>Pending approvals</h2>
            {data.pendingApprovals?.length ? (
              <table className="admin-table">
                <thead><tr><th>Name</th><th>Email</th><th>Institution</th><th>Registered</th><th>Status</th><th>Role</th><th></th></tr></thead>
                <tbody>
                  {data.pendingApprovals.map((user) => (
                    <tr key={user.id}>
                      <td>{user.fullName}</td>
                      <td>{user.email}</td>
                      <td>{user.institution || 'Not set'}</td>
                      <td>{formatWhen(user.createdAt)}</td>
                      <td><span className="admin-status">{user.accountStatus}</span></td>
                      <td>{user.role}</td>
                      <td>
                        {user.role === 'Administrator'
                          ? <button type="button" className="primary" onClick={() => adminApi.approve(user.id).then(() => { setNotice('Account updated.'); reload(); }).catch((err) => setNotice(err.message || 'The account was not updated.'))}>Approve</button>
                          : <button type="button" className="primary" onClick={() => setAssigning(user)}>Approve and Assign Role</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="admin-muted">No accounts are waiting for approval.</p>}
          </article>
          <div className="admin-cards">
            <article className="admin-card"><span>Lesson plans</span><strong>{cards.lessonPlans}</strong><small>{data.comparisons.lessonPlans.current} in the last 30 days, {data.comparisons.lessonPlans.previous} in the 30 days before</small></article>
            <article className="admin-card"><span>Assessments and quizzes</span><strong>{cards.assessmentsAndQuizzes}</strong><small>{cards.assessments} assessments, {cards.quizzes} quizzes</small></article>
            <article className="admin-card"><span>Attendance sessions</span><strong>{cards.attendanceSessions}</strong><small>Clock-in records, not logins</small></article>
            <article className="admin-card"><span>AI activity</span><strong>{cards.aiTrackedSuccess}</strong><small>{cards.aiStoredOutputs} stored AI outputs. {cards.aiTrackedFailed} failed requests since logging started.</small></article>
          </div>
          <article className="admin-table-card">
            <h2>Recent activity</h2>
            {data.recentActivity.length ? (
              <table className="admin-table">
                <thead><tr><th>When</th><th>User</th><th>Activity</th></tr></thead>
                <tbody>
                  {data.recentActivity.map((row) => (
                    <tr key={row.id}><td>{formatWhen(row.createdAt)}</td><td>{row.user}</td><td>{row.summary}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="admin-muted">Activity logging starts with the next registration, sign-in, lesson, assessment, attendance, or AI action. Older actions were not stored as events.</p>}
          </article>
        </>
      )}
      <AssignRoleDialog user={assigning} onClose={() => setAssigning(null)} onApproved={() => { setAssigning(null); setNotice('Role assigned and login email queued.'); reload(); }} />
    </section>
  );
}

function UsersPage() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('educators');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [notice, setNotice] = useState('');
  const { data, error, loading, reload } = useLoad(() => adminApi.directory({ q, role, status, sort, page, pageSize: 10 }), [q, role, status, sort, page]);

  async function act(action, id, label) {
    if (!window.confirm(`${label} this account?`)) return;
    setNotice('');
    try {
      await action(id);
      setNotice('Account updated.');
      const next = await adminApi.user(id);
      setSelected(next);
      await reload();
    } catch (err) {
      setNotice(err.message || 'The account was not updated.');
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-heading"><span className="admin-kicker">USERS</span><h1>Lecturers and teachers</h1><p>Search the directory and review each account without seeing passwords.</p></div>
      <div className="admin-toolbar">
        <input value={q} placeholder="Search name, email, or institution" onChange={(event) => { setPage(1); setQ(event.target.value); }} />
        <select value={role} onChange={(event) => { setPage(1); setRole(event.target.value); }}>
          <option value="educators">Lecturers and teachers</option>
          <option value="lecturer">Lecturers</option>
          <option value="teacher">Teachers</option>
          <option value="admin">Administrators</option>
        </select>
        <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
          <option value="">All statuses</option>
          {['approved', 'pending', 'suspended', 'inactive', 'rejected'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="createdAt">Newest</option>
          <option value="name">Name</option>
          <option value="email">Email</option>
          <option value="role">Role</option>
          <option value="status">Status</option>
          <option value="lastLoginAt">Last sign-in</option>
        </select>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {notice && <p className="admin-note">{notice}</p>}
      {loading && <p className="admin-muted">Loading users...</p>}
      {data && (
        <article className="admin-table-card">
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Institution</th><th>Registered</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.users.length ? data.users.map((user) => (
                <tr key={user.id}>
                  <td>{user.fullName}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.institution || 'Not set'}</td>
                  <td>{formatWhen(user.createdAt)}</td>
                  <td>{user.lastLoginAt ? formatWhen(user.lastLoginAt) : 'Not recorded'}</td>
                  <td><span className="admin-status">{user.accountStatus}{user.accountStatus === 'approved' && user.role !== 'Administrator' && user.roleConfirmed === false ? ' · awaiting confirmation' : ''}</span></td>
                  <td><button type="button" onClick={() => adminApi.user(user.id).then(setSelected)}>View</button></td>
                </tr>
              )) : <tr><td colSpan="8">No accounts match these filters.</td></tr>}
            </tbody>
          </table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </article>
      )}
      {selected && (
        <article className="admin-detail">
          <h2>{selected.fullName}</h2>
          <p className="admin-muted">{selected.email} · {selected.role} · {selected.institution || 'No institution'}</p>
          <p>{selected.lessonPlans} lesson plans · {selected.assessments} assessments · {selected.quizzes} quizzes · {selected.attendanceSessions} attendance sessions</p>
          <div className="admin-actions">
            {selected.accountStatus === 'pending' && selected.role !== 'Administrator' && <button type="button" className="primary" onClick={() => setAssigning(selected)}>Approve and Assign Role</button>}
            {selected.accountStatus === 'pending' && selected.role === 'Administrator' && <button type="button" className="primary" onClick={() => act(adminApi.approve, selected.id, 'Approve')}>Approve</button>}
            {selected.accountStatus === 'pending' && <button type="button" onClick={() => act(adminApi.reject, selected.id, 'Reject')}>Reject</button>}
            {selected.accountStatus === 'approved' && selected.role !== 'Administrator' && <button type="button" onClick={() => act(adminApi.suspend, selected.id, 'Suspend')}>Suspend</button>}
            {selected.accountStatus === 'approved' && selected.role !== 'Administrator' && <button type="button" onClick={() => act(adminApi.deactivate, selected.id, 'Deactivate')}>Deactivate</button>}
            {['suspended', 'inactive'].includes(selected.accountStatus) && <button type="button" className="primary" onClick={() => act(adminApi.restore, selected.id, 'Reactivate')}>Reactivate</button>}
            <button type="button" onClick={() => setSelected(null)}>Close</button>
          </div>
        </article>
      )}
      <AssignRoleDialog user={assigning} onClose={() => setAssigning(null)} onApproved={async () => {
        const id = assigning.id;
        setAssigning(null);
        setNotice('Role assigned and login email queued.');
        const next = await adminApi.user(id);
        setSelected(next);
        await reload();
      }} />
    </section>
  );
}

function ActivityPage() {
  const [range, setRange] = useState('30');
  const [type, setType] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(() => adminApi.activity({ range, type, role, page, pageSize: 12 }), [range, type, role, page]);
  return (
    <section className="admin-panel">
      <div className="admin-heading"><span className="admin-kicker">ACTIVITY</span><h1>System activity</h1><p>Events recorded after activity logging was added. Passwords are never stored here.</p></div>
      <div className="admin-toolbar">
        <RangePicker value={range} onChange={(next) => { setPage(1); setRange(next); }} />
        <select value={type} onChange={(event) => { setPage(1); setType(event.target.value); }}>
          <option value="">All types</option>
          {['user.registered', 'auth.login', 'auth.login_failed', 'lesson.created', 'lesson.updated', 'ai.lesson_plan', 'assessment.created', 'ai.assessment', 'quiz.created', 'ai.quiz', 'calendar.created', 'calendar.updated', 'attendance.clock_in', 'attendance.clock_out', 'ai.assistant', 'admin.approve', 'admin.deactivate', 'admin.restore'].map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={role} onChange={(event) => { setPage(1); setRole(event.target.value); }}>
          <option value="">All roles</option>
          <option value="lecturer">Lecturer</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Administrator</option>
        </select>
        <button type="button" onClick={() => adminApi.exportCsv('activity', { range, type, role })}>Export CSV</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {loading && <p className="admin-muted">Loading activity...</p>}
      {data && (
        <article className="admin-table-card">
          <table className="admin-table">
            <thead><tr><th>When</th><th>User</th><th>Role</th><th>Type</th><th>Description</th></tr></thead>
            <tbody>
              {data.events.length ? data.events.map((row) => (
                <tr key={row.id}>
                  <td>{formatWhen(row.createdAt)}</td>
                  <td>{row.user}</td>
                  <td>{row.role || '—'}</td>
                  <td>{row.type}</td>
                  <td>{row.summary}{row.targetId ? ` · ${row.targetType} ${row.targetId.slice(0, 8)}` : ''}</td>
                </tr>
              )) : <tr><td colSpan="5">No activity matches these filters.</td></tr>}
            </tbody>
          </table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </article>
      )}
    </section>
  );
}

function RangePicker({ value, onChange }) {
  return (
    <div className="admin-range admin-actions">
      {RANGES.map(([id, label]) => <button type="button" key={id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>{label}</button>)}
    </div>
  );
}

function PlansPage() {
  const [q, setQ] = useState('');
  const [range, setRange] = useState('all');
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(() => adminApi.lessonPlans({ q, range, page, pageSize: 10 }), [q, range, page]);
  return (
    <section className="admin-panel">
      <div className="admin-heading"><span className="admin-kicker">LESSON PLANS</span><h1>Lesson plans</h1><p>Saved plans from lecturers and teachers. New saves appear here after refresh.</p></div>
      <div className="admin-toolbar">
        <input value={q} placeholder="Search title, subject, topic, or creator" onChange={(event) => { setPage(1); setQ(event.target.value); }} />
        <RangePicker value={range} onChange={(next) => { setPage(1); setRange(next); }} />
        <button type="button" onClick={() => adminApi.exportCsv('lesson-plans', { q, range })}>Export CSV</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {loading && <p className="admin-muted">Loading lesson plans...</p>}
      {data && (
        <article className="admin-table-card">
          <p className="admin-muted">{data.total} plans in this view</p>
          <table className="admin-table">
            <thead><tr><th>Title</th><th>Creator</th><th>Subject</th><th>Topic</th><th>Institution</th><th>Created</th></tr></thead>
            <tbody>
              {data.plans.length ? data.plans.map((plan) => (
                <tr key={plan.id}><td>{plan.title}{plan.aiGenerated ? ' · AI' : ''}</td><td>{plan.creator}</td><td>{plan.subject || '—'}</td><td>{plan.topic || '—'}</td><td>{plan.institution || '—'}</td><td>{formatWhen(plan.createdAt)}</td></tr>
              )) : <tr><td colSpan="6">No lesson plans match these filters.</td></tr>}
            </tbody>
          </table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </article>
      )}
    </section>
  );
}

function AssessmentsPage() {
  const [q, setQ] = useState('');
  const [range, setRange] = useState('all');
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(() => adminApi.assessments({ q, range, page, pageSize: 8 }), [q, range, page]);
  return (
    <section className="admin-panel">
      <div className="admin-heading"><span className="admin-kicker">ASSESSMENTS</span><h1>Assessments and quizzes</h1></div>
      <div className="admin-toolbar">
        <input value={q} placeholder="Search title or creator" onChange={(event) => { setPage(1); setQ(event.target.value); }} />
        <RangePicker value={range} onChange={(next) => { setPage(1); setRange(next); }} />
      </div>
      {error && <div className="admin-error">{error}</div>}
      {loading && <p className="admin-muted">Loading assessments...</p>}
      {data && (
        <>
          <div className="admin-cards">
            <article className="admin-card"><span>Assessments</span><strong>{data.assessmentTotal}</strong></article>
            <article className="admin-card"><span>Quizzes</span><strong>{data.quizTotal}</strong></article>
          </div>
          <article className="admin-table-card">
            <h2>Assessments</h2>
            <table className="admin-table">
              <thead><tr><th>Title</th><th>Creator</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>{data.assessments.length ? data.assessments.map((row) => <tr key={row.id}><td>{row.title}</td><td>{row.creator}</td><td>{row.type}</td><td>{row.status}</td><td>{formatWhen(row.createdAt)}</td></tr>) : <tr><td colSpan="5">No assessments in this view.</td></tr>}</tbody>
            </table>
          </article>
          <article className="admin-table-card">
            <h2>Quizzes</h2>
            <table className="admin-table">
              <thead><tr><th>Title</th><th>Creator</th><th>Difficulty</th><th>Created</th></tr></thead>
              <tbody>{data.quizzes.length ? data.quizzes.map((row) => <tr key={row.id}><td>{row.title}</td><td>{row.creator}</td><td>{row.difficulty}</td><td>{formatWhen(row.createdAt)}</td></tr>) : <tr><td colSpan="4">No quizzes in this view.</td></tr>}</tbody>
            </table>
            <Pager page={data.page} pageSize={data.pageSize} total={Math.max(data.assessmentTotal, data.quizTotal)} onPage={setPage} />
          </article>
        </>
      )}
    </section>
  );
}

function AttendancePage() {
  const [range, setRange] = useState('30');
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(() => adminApi.attendance({ range, userId, page, pageSize: 12 }), [range, userId, page]);
  return (
    <section className="admin-panel">
      <div className="admin-heading"><span className="admin-kicker">ATTENDANCE</span><h1>Clock-in records</h1><p>These are attendance sessions, not sign-ins. Open sessions have not been clocked out.</p></div>
      <div className="admin-toolbar">
        <RangePicker value={range} onChange={(next) => { setPage(1); setRange(next); }} />
        <select value={userId} onChange={(event) => { setPage(1); setUserId(event.target.value); }}>
          <option value="">All users</option>
          {(data?.users || []).map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}
        </select>
        <button type="button" onClick={() => adminApi.exportCsv('attendance', { range, userId })}>Export CSV</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {loading && <p className="admin-muted">Loading attendance...</p>}
      {data && (
        <>
          <div className="admin-cards">
            <article className="admin-card"><span>Today</span><strong>{data.summaries.today}</strong></article>
            <article className="admin-card"><span>Last 7 days</span><strong>{data.summaries.thisWeek}</strong></article>
            <article className="admin-card"><span>Last 30 days</span><strong>{data.summaries.thisMonth}</strong></article>
            <article className="admin-card"><span>Still clocked in</span><strong>{data.openSessions}</strong></article>
            <article className="admin-card"><span>Completed</span><strong>{data.completedSessions}</strong></article>
          </div>
          <article className="admin-table-card">
            <table className="admin-table">
              <thead><tr><th>User</th><th>Date</th><th>Clock in</th><th>Clock out</th><th>Status</th></tr></thead>
              <tbody>
                {data.sessions.length ? data.sessions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.user}</td>
                    <td>{row.date}</td>
                    <td>{formatWhen(row.clockIn)}</td>
                    <td>{row.clockOut ? formatWhen(row.clockOut) : 'Still open'}</td>
                    <td><span className={`admin-status ${row.status}`}>{row.status}</span></td>
                  </tr>
                )) : <tr><td colSpan="5">No attendance sessions in this range.</td></tr>}
              </tbody>
            </table>
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </article>
        </>
      )}
    </section>
  );
}

function AiPage() {
  const [range, setRange] = useState('30');
  const { data, error, loading } = useLoad(() => adminApi.aiUsage({ range }), [range]);
  return (
    <section className="admin-panel">
      <div className="admin-heading"><span className="admin-kicker">AI</span><h1>AI usage</h1><p>Tracked requests start when an AI action is logged. Stored outputs count records already in the database.</p></div>
      <RangePicker value={range} onChange={setRange} />
      {error && <div className="admin-error">{error}</div>}
      {loading && <p className="admin-muted">Loading AI usage...</p>}
      {data && (
        <div className="admin-cards">
          <article className="admin-card"><span>Tracked successful requests</span><strong>{data.trackedSuccess}</strong><small>Since activity logging started</small></article>
          <article className="admin-card"><span>Tracked failed requests</span><strong>{data.trackedFailed}</strong><small>High-level failures only. No private prompts are stored.</small></article>
          <article className="admin-card"><span>Stored AI lesson plans</span><strong>{data.stored.aiLessonPlans}</strong></article>
          <article className="admin-card"><span>Stored quizzes</span><strong>{data.stored.quizzes}</strong></article>
          <article className="admin-card"><span>Assistant replies</span><strong>{data.stored.assistantReplies}</strong></article>
          <article className="admin-card"><span>Not tracked</span><strong>—</strong><small>{data.notTracked.join('. ')}.</small></article>
        </div>
      )}
    </section>
  );
}

function AnalyticsPage() {
  const [range, setRange] = useState('30');
  const { data, error, loading } = useLoad(() => adminApi.analytics({ range }), [range]);
  const charts = data ? [
    ['Registrations', data.series.users],
    ['Lesson plans', data.series.lessonPlans],
    ['Attendance', data.series.attendance],
    ['Assessments', data.series.assessments],
    ['Quizzes', data.series.quizzes],
    ['Tracked AI requests', data.series.ai],
  ] : [];
  return (
    <section className="admin-panel">
      <div className="admin-heading"><span className="admin-kicker">REPORTS</span><h1>Analytics and reports</h1><p>Counts come from saved records. Tracked AI requests only include events logged after this update.</p></div>
      <div className="admin-toolbar">
        <RangePicker value={range} onChange={setRange} />
        <button type="button" onClick={() => adminApi.exportCsv('users', { range })}>Export users</button>
        <button type="button" onClick={() => adminApi.exportCsv('lesson-plans', { range })}>Export lesson plans</button>
        <button type="button" onClick={() => adminApi.exportCsv('attendance', { range })}>Export attendance</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {loading && <p className="admin-muted">Loading charts...</p>}
      {charts.map(([title, series]) => (
        <article className="admin-table-card" key={title}>
          <h2>{title}</h2>
          <Bars series={series} />
        </article>
      ))}
    </section>
  );
}
