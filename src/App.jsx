import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Activity,
  ArrowRight,
  Bell,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
  UploadCloud,
  Plus,
  Circle,
  CircleDashed,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  MoonStar,
  Maximize2,
  Search,
  Sparkles,
  Star,
  TimerReset,
  TrendingUp,
  UserCircle2,
  Wand2,
  BriefcaseBusiness,
  School,
  BarChart3,
  Settings2,
} from 'lucide-react';
import AssistantPage from './components/AssistantPage.jsx';
import CalendarPage from './components/CalendarPage.jsx';
import AssessmentsPage from './components/AssessmentsPage.jsx';
import LandingPage from './components/LandingPage.jsx';
import './auth.css';
import { suggestCalendarFromPlan } from '../shared/learningEngine.js';

const teachingMethodsList = ['Lecture', 'Discussion', 'Demonstration', 'Group work', 'Practical', 'Problem solving', 'Case study', 'Project-based learning'];
const learningActivitiesList = ['Individual exercises', 'Group activities', 'Practical exercises', 'Discussions', 'Presentations', 'Research', 'Demonstrations'];

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'courses', label: 'Courses', icon: BookOpen },
  { id: 'plans', label: 'Lesson Plans', icon: FileText },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'assessments', label: 'Assessments', icon: ClipboardCheck },
  { id: 'assistant', label: 'AI Assistant', icon: BrainCircuit },
  { id: 'resources', label: 'Resources', icon: Sparkles },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'settings', label: 'Settings', icon: TimerReset },
];

const roleNav = {
  Lecturer: ['dashboard', 'courses', 'plans', 'calendar', 'assessments', 'assistant', 'resources', 'progress', 'notifications', 'settings'],
  Teacher: ['dashboard', 'courses', 'plans', 'calendar', 'assessments', 'assistant', 'resources', 'progress', 'notifications', 'settings'],
  Student: ['dashboard', 'courses', 'calendar', 'assistant', 'resources', 'progress', 'notifications', 'settings'],
  'Academic Coordinator': ['dashboard', 'courses', 'progress', 'calendar', 'assessments', 'notifications', 'settings'],
  Administrator: ['dashboard', 'courses', 'progress', 'settings'],
};

const initialForm = {
  courseName: 'Introduction to Web Application Development',
  courseCode: 'BIT346',
  programme: 'Bachelor of Information Technology',
  level: 'Second Year',
  department: 'Computer Science',
  lecturer: 'Nancy Ngomi',
  semester: 'Semester 1',
  academicYear: '2027',
  topics: ['Introduction to Web Applications', 'HTML', 'CSS', 'JavaScript', 'PHP', 'Forms', 'Database Connectivity', 'Sessions', 'Authentication'],
  startDate: '2027-01-12',
  endDate: '2027-04-16',
  numberOfWeeks: 12,
  lessonsPerWeek: 2,
  lessonDuration: '2 hours',
  holidays: [{ date: '2027-03-08', name: 'Public holiday' }],
  teachingMethods: ['Lecture', 'Discussion', 'Demonstration'],
  learningActivities: ['Practical exercises', 'Discussions'],
  difficulty: 'Intermediate',
  customInstructions: 'Make the lessons suitable for students with little prior programming experience.',
};

const statCards = [
  { label: 'Courses', value: '12', detail: '3 active this week', accent: 'indigo', icon: BookOpen },
  { label: 'Lesson Plans', value: '48', detail: '8 completed this month', accent: 'lavender', icon: FileText },
  { label: 'Assessments', value: '27', detail: '5 awaiting review', accent: 'navy', icon: ClipboardCheck },
  { label: 'Teaching Progress', value: '84%', detail: '+6% this month', accent: 'success', icon: TrendingUp },
];

const recentActivity = [
  { title: 'Updated PHP lesson sequence', period: '2h ago', status: 'Draft ready' },
  { title: 'Assessment review scheduled', period: 'Today, 10:30', status: 'Needs approval' },
  { title: 'BIT346 cohort performance review', period: 'Yesterday', status: 'Healthy trend' },
];

const upcomingLessons = [
  { title: 'Introduction to Computer Science', date: '09 Sep', time: '08:00 – 10:00', type: 'Lecture', status: 'Today' },
  { title: 'Database Systems', date: '10 Sep', time: '10:00 – 12:00', type: 'Practical', status: 'Upcoming' },
  { title: 'Web Application Development', date: '11 Sep', time: '08:00 – 10:00', type: 'Lecture', status: 'Upcoming' },
];

const courseProgress = [
  { code: 'BIT346', name: 'Web Application Development', percent: 84 },
  { code: 'BIT325', name: 'Systems Analysis and Design', percent: 68 },
  { code: 'BIT315', name: 'Web Application Development', percent: 72 },
];

const calendarEventData = [
  { title: 'BIT346 Lesson', type: 'lesson', date: '11', day: 'Mon' },
  { title: 'Assessment Review', type: 'assessment', date: '14', day: 'Thu' },
  { title: 'Public Holiday', type: 'event', date: '18', day: 'Mon' },
  { title: 'Examination', type: 'exam', date: '21', day: 'Thu' },
];

const assistantPrompts = ['Create a lesson activity', 'Explain this topic simply', 'Create a quiz', 'Make this lesson more practical', 'Give me examples'];

const topicStatuses = {
  completed: { label: 'Completed', icon: CheckCircle2 },
  in_progress: { label: 'In Progress', icon: CircleDashed },
  not_started: { label: 'Not Started', icon: Circle },
};

function makeId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

function buildCourse({ name = '', code = '', description = '', topics = [], fileName = '' }) {
  const cleanedTopics = topics.filter(Boolean).map((topic) => topic.trim()).filter(Boolean);
  const topicList = cleanedTopics.length ? cleanedTopics : ['Review extracted topics'];
  const modules = [];
  const moduleSize = Math.max(1, Math.ceil(topicList.length / Math.min(4, Math.max(1, Math.ceil(topicList.length / 3)))));
  for (let index = 0; index < topicList.length; index += moduleSize) {
    modules.push({ id: makeId('module'), title: `Module ${modules.length + 1}`, topics: topicList.slice(index, index + moduleSize).map((title) => ({ id: makeId('topic'), title, status: 'not_started' })) });
  }
  return { id: makeId('course'), name: name.trim(), code: code.trim(), description: description.trim(), fileName, semester: '', duration: '', modules, assessments: [], createdAt: new Date().toISOString(), startDate: '', endDate: '' };
}

function courseMetrics(course) {
  const topics = course?.modules?.flatMap((module) => module.topics) || [];
  const completed = topics.filter((topic) => topic.status === 'completed').length;
  const inProgress = topics.filter((topic) => topic.status === 'in_progress').length;
  const total = topics.length;
  return { topics, total, completed, inProgress, percent: total ? Math.round((completed / total) * 100) : 0, modulesCompleted: (course?.modules || []).filter((module) => module.topics.length && module.topics.every((topic) => topic.status === 'completed')).length };
}

function UploadCoursePage({ onCreate }) {
  const [status, setStatus] = useState('idle');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [manual, setManual] = useState(false);
  const [fields, setFields] = useState({ name: '', code: '', description: '', topics: '' });
  const inputRef = useRef(null);
  const supported = ['.pdf', '.doc', '.docx', '.txt'];
  function analyze(file) {
    if (!file) return;
    const extension = `.${file.name.split('.').pop().toLowerCase()}`;
    if (!supported.includes(extension)) { setError('Please choose a PDF, DOC, DOCX, or TXT course outline.'); return; }
    setError(''); setFileName(file.name); setStatus('processing');
    const read = () => { setStatus('success'); if (extension === '.txt') { const reader = new FileReader(); reader.onload = () => { const text = String(reader.result || ''); const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); setFields({ name: lines[0] || '', code: lines.find((line) => /code/i.test(line))?.split(':').pop().trim() || '', description: lines.slice(1, 3).join(' '), topics: lines.slice(3).join('\n') }); }; reader.readAsText(file); } };
    setTimeout(read, 1700);
  }
  function submit(event) { event.preventDefault(); const topics = fields.topics.split(/\r?\n|,|;/).map((topic) => topic.trim()).filter(Boolean); onCreate(buildCourse({ ...fields, topics, fileName })); }
  return <section className="course-upload-page"><div className="account-heading"><div><span className="section-kicker">COURSE WORKSPACE</span><h1>Upload your course outline</h1><p>Let PlanWise turn your source document into a trackable teaching structure.</p></div></div>{status === 'processing' && <div className="panel-card analysis-card"><div className="analysis-spinner" /><h2>Analyzing {fileName}</h2>{['Uploading course outline', 'Reading course outline', 'Identifying course information', 'Extracting topics and objectives', 'Building progress tracker'].map((item, index) => <span className={index < 2 ? 'done' : ''} key={item}>{index < 2 ? '✓' : '○'} {item}...</span>)}</div>}{status !== 'processing' && <><div className="upload-layout"><button className="panel-card upload-dropzone" onClick={() => inputRef.current?.click()}><UploadCloud size={34} /><strong>Drop your file here or browse</strong><span>Supported formats: PDF, DOC, DOCX, TXT</span><input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={(event) => analyze(event.target.files?.[0])} /></button><div className="panel-card manual-card"><div className="settings-title"><Pencil size={18} /><div><h3>Enter course manually</h3><span>For outlines you would rather type in</span></div></div><button className="secondary-button" onClick={() => setManual(true)}>Start manually</button></div></div>{error && <div className="error-box">{error}</div>}{(manual || status === 'success') && <form className="panel-card extracted-form" onSubmit={submit}><div className="panel-head"><div><span className="section-kicker">{status === 'success' ? 'REVIEW EXTRACTED INFORMATION' : 'MANUAL COURSE'}</span><h2>{status === 'success' ? 'Course successfully analyzed.' : 'Create your course'}</h2></div></div><div className="grid-2"><label className="field"><span>Course Name</span><input value={fields.name} onChange={(event) => setFields({ ...fields, name: event.target.value })} placeholder="Not provided" /></label><label className="field"><span>Course Code</span><input value={fields.code} onChange={(event) => setFields({ ...fields, code: event.target.value })} placeholder="Not provided" /></label><label className="field full-span"><span>Course Description</span><textarea rows={3} value={fields.description} onChange={(event) => setFields({ ...fields, description: event.target.value })} placeholder="Not provided" /></label><label className="field full-span"><span>Topics, one per line</span><textarea rows={7} value={fields.topics} onChange={(event) => setFields({ ...fields, topics: event.target.value })} placeholder="Add the topics from your outline" /></label></div><div className="footer-actions-row"><button type="submit" className="primary-button">Create Progress Tracker</button></div></form>}</>}{status === 'success' && <div className="success-toast"><CheckCircle2 size={16} /> Course successfully analyzed.</div>}</section>;
}

function CourseCard({ course, onOpen }) {
  const metrics = courseMetrics(course); const next = metrics.topics.find((topic) => topic.status !== 'completed');
  return <article className="course-card panel-card"><div className="course-card-top"><span className="course-code">{course.code || 'CODE NOT PROVIDED'}</span><BookOpen size={18} /></div><h3>{course.name || 'Course name not provided'}</h3><p>{course.description || 'No course description provided.'}</p><div className="course-card-meta"><span>{course.duration || 'Duration not provided'}</span><span>{metrics.total} topics</span></div><div className="course-progress-head"><span>Progress</span><strong>{metrics.percent}%</strong></div><div className="progress-bar"><span style={{ width: `${metrics.percent}%` }} /></div><small>{metrics.completed} / {metrics.total} topics completed</small><div className="course-next">Next: <strong>{next?.title || 'All topics complete'}</strong></div><button className="secondary-button" onClick={() => onOpen(course.id)}>Open Course <ArrowRight size={14} /></button></article>;
}

function CoursesPage({ courses, onOpen, onUpload }) {
  return <section className="account-page courses-page"><div className="account-heading"><div><span className="section-kicker">COURSE LIBRARY</span><h1>Your courses</h1><p>Each course is its own source of truth for teaching progress.</p></div><button className="primary-button" onClick={onUpload}><UploadCloud size={16} /> Upload Course</button></div>{courses.length ? <div className="courses-grid">{courses.map((course) => <CourseCard key={course.id} course={course} onOpen={onOpen} />)}</div> : <div className="panel-card empty-course"><div className="empty-course-icon"><BookOpen size={26} /></div><h2>No courses yet</h2><p>Upload your first course outline and let PlanWise AI organize your teaching journey.</p><button className="primary-button" onClick={onUpload}><UploadCloud size={16} /> Upload Course</button></div>}</section>;
}

function CourseDetailPage({ course, onBack, onStatusChange }) {
  if (!course) return <section className="account-page empty-course panel-card"><h2>Course not found</h2><p>This course is no longer available in your workspace.</p><button className="primary-button" onClick={onBack}>Back to Courses</button></section>;
  const metrics = courseMetrics(course); const [tab, setTab] = useState('Overview');
  return <section className="account-page course-detail-page"><button className="back-link" onClick={onBack}><ArrowRight size={15} className="back-arrow" /> Courses</button><div className="course-detail-heading"><div><span className="section-kicker">{course.code || 'COURSE'}</span><h1>{course.name || 'Course name not provided'}</h1><p>{course.description || 'Course description not provided.'}</p></div><div className="detail-progress"><strong>{metrics.percent}%</strong><span>Overall progress</span><div className="progress-bar"><span style={{ width: `${metrics.percent}%` }} /></div></div></div><div className="course-tabs">{['Overview', 'Topics', 'Lesson Plans', 'Assessments', 'Calendar', 'Progress', 'Resources'].map((item) => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>{tab === 'Progress' || tab === 'Topics' || tab === 'Overview' ? <div className="course-detail-grid"><div className="panel-card module-card"><div className="panel-head"><div><span className="section-kicker">COURSE STRUCTURE</span><h3>Modules and topics</h3></div><span className="course-count">{metrics.completed}/{metrics.total} complete</span></div>{course.modules.map((module) => <div className="module-block" key={module.id}><div className="module-heading"><strong>{module.title}</strong><span>{courseMetrics({ modules: [module] }).percent}%</span></div>{module.topics.map((topic) => { const StatusIcon = topicStatuses[topic.status].icon; return <div className="topic-status-row" key={topic.id}><button className={`status-control ${topic.status}`} onClick={() => onStatusChange(course.id, module.id, topic.id)} title="Cycle topic status"><StatusIcon size={18} /><span>{topic.title}</span></button><small>{topicStatuses[topic.status].label}</small></div>; })}</div>)}</div><div className="panel-card insight-card"><div className="settings-title"><Sparkles size={18} /><div><h3>Your Teaching Insights</h3><span>Based on this course's actual progress</span></div></div><p>{metrics.completed === metrics.total ? 'All tracked topics are complete. Your course structure is ready for final review.' : metrics.inProgress ? `You have completed ${metrics.completed} of ${metrics.total} planned topics. Continue the ${metrics.inProgress} topic${metrics.inProgress > 1 ? 's' : ''} in progress.` : `You have completed ${metrics.completed} of ${metrics.total} planned topics. Mark a topic in progress when teaching begins.`}</p><div className="insight-stat"><strong>{metrics.inProgress}</strong><span>in progress</span></div><div className="insight-stat"><strong>{metrics.total - metrics.completed - metrics.inProgress}</strong><span>not started</span></div></div></div> : <div className="panel-card empty-tab"><h2>{tab}</h2><p>No {tab.toLowerCase()} have been created for this course yet.</p></div>}</section>;
}

function ProgressPage({ courses, onOpen, onStatusChange }) {
  const totals = courses.reduce((sum, course) => { const metrics = courseMetrics(course); return { total: sum.total + metrics.total, completed: sum.completed + metrics.completed, modules: sum.modules + course.modules.length, modulesCompleted: sum.modulesCompleted + metrics.modulesCompleted }; }, { total: 0, completed: 0, modules: 0, modulesCompleted: 0 });
  const percent = totals.total ? Math.round((totals.completed / totals.total) * 100) : 0;
  return <section className="account-page progress-page"><div className="account-heading"><div><span className="section-kicker">TEACHING OVERVIEW</span><h1>Course Progress</h1><p>A clear view of where your teaching stands across every course.</p></div></div>{courses.length ? <><div className="progress-summary-grid"><div className="panel-card progress-summary-main"><span className="section-kicker">OVERALL COURSE PROGRESS</span><strong>{percent}%</strong><div className="progress-bar"><span style={{ width: `${percent}%` }} /></div><p>{totals.completed} of {totals.total} topics completed</p></div><div className="panel-card progress-number"><strong>{totals.completed}/{totals.total}</strong><span>Topics Completed</span></div><div className="panel-card progress-number"><strong>{totals.modulesCompleted}/{totals.modules}</strong><span>Modules Completed</span></div></div><div className="progress-course-list">{courses.map((course) => <div className="panel-card progress-course-row" key={course.id}><div><span className="course-code">{course.code || 'CODE NOT PROVIDED'}</span><h3>{course.name || 'Course name not provided'}</h3></div><div className="progress-row-bar"><div className="progress-bar"><span style={{ width: `${courseMetrics(course).percent}%` }} /></div><strong>{courseMetrics(course).percent}%</strong></div><button className="pill-button" onClick={() => onOpen(course.id)}>View <ArrowRight size={13} /></button></div>)}</div></> : <div className="panel-card empty-course"><div className="empty-course-icon"><TrendingUp size={26} /></div><h2>No progress to show</h2><p>Upload a course outline to begin tracking your teaching journey.</p></div>}</section>;
}

const defaultUser = {
  id: 'demo-user',
  name: 'Nancy Ngomi',
  email: 'nancy@example.com',
  role: 'Lecturer',
  institution: '',
  department: 'Information Technology',
  phone: '',
  avatar: '',
  memberSince: 'September 2026',
};

const roleOptions = [
  { value: 'Lecturer', icon: GraduationCap, description: 'Plan and manage university courses and lessons.' },
  { value: 'Teacher', icon: School, description: 'Create and manage school lessons and assessments.' },
  { value: 'Student', icon: BookOpen, description: 'Study with the AI tutor, take quizzes and track your progress.' },
  { value: 'Academic Coordinator', icon: BarChart3, description: 'Monitor teaching progress across educators.' },
  { value: 'Administrator', icon: Settings2, description: 'Manage users, institutions and system settings.' },
  { value: 'Other', icon: BriefcaseBusiness, description: 'Specify a different professional role.' },
];

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getStoredUsers() {
  try { return JSON.parse(localStorage.getItem('planwiseUsers') || '[]'); } catch { return []; }
}

function AuthShell({ children, mode = 'login', onNavigate }) {
  return (
    <div className={`leaf-auth ${mode === 'register' ? 'is-register' : ''}`}>
      <div className="leaf-auth-bg" aria-hidden="true" />
      <button type="button" className="leaf-auth-home" onClick={() => onNavigate?.('landing')}>
        <div className="brand-mark"><GraduationCap size={18} /></div>
        <strong>PlanWise AI</strong>
      </button>
      <div className="leaf-auth-card">
        <div className="leaf-auth-form">{children}</div>
        <aside className="leaf-auth-art" aria-hidden="true">
          <div className="leaf-fronds">
            <span />
            <span />
            <span />
            <span />
          </div>
        </aside>
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, placeholder = 'Enter your password', autoComplete }) {
  const [visible, setVisible] = useState(false);
  return <label className="auth-field"><span>{label}</span><div className="password-input"><LockKeyhole size={16} /><input type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>;
}

function LoginPage({ onLogin, onNavigate }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [remember, setRemember] = useState(true); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  async function submit(event) { event.preventDefault(); setError(''); if (!email.trim()) { setError('Please enter your email.'); return; } if (!password) { setError('Please enter your password.'); return; } setLoading(true); await new Promise((resolve) => setTimeout(resolve, 450)); const users = getStoredUsers(); const user = users.find((candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase()); const hash = await hashPassword(password); if (!user || user.passwordHash !== hash) { setError('Incorrect email or password.'); setLoading(false); return; } onLogin(user, remember); }
  return <AuthShell mode="login" onNavigate={onNavigate}><div className="auth-form-wrap"><h2>Log in</h2><form className="auth-form" onSubmit={submit}><label className="auth-field"><span>Login, email or phone number</span><div className="auth-input"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@institution.edu" autoComplete="email" /></div></label><PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />{error && <div className="auth-error">{error}</div>}<div className="auth-options"><label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember me</label><button type="button" onClick={() => onNavigate('forgot-password')}>Forgot login or password?</button></div><button className="auth-submit" disabled={loading}>{loading ? 'Signing in...' : 'Log in'}</button></form><p className="auth-switch">Don't have an account? <button onClick={() => onNavigate('register')}>Sign Up</button></p></div></AuthShell>;
}

function passwordChecks(password) { return { length: password.length >= 8, number: /\d/.test(password), upper: /[A-Z]/.test(password), lower: /[a-z]/.test(password) }; }

function RegisterPage({ onRegister, onNavigate }) {
  const [fields, setFields] = useState({ name: '', email: '', password: '', confirm: '', role: '', otherRole: '', institution: '', department: '' }); const [terms, setTerms] = useState(false); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const checks = passwordChecks(fields.password); const validPassword = Object.values(checks).every(Boolean); const role = fields.role === 'Other' ? fields.otherRole.trim() : fields.role;
  function update(field, value) { setFields((current) => ({ ...current, [field]: value })); }
  async function submit(event) { event.preventDefault(); setError(''); if (!fields.name.trim() || !fields.email.trim() || !fields.password || !fields.confirm || !fields.role || !fields.institution.trim() || !fields.department.trim()) { setError('Please complete all required fields.'); return; } if (fields.role === 'Other' && !fields.otherRole.trim()) { setError('Please specify your role.'); return; } if (!validPassword) { setError('Choose a stronger password that meets all requirements.'); return; } if (fields.password !== fields.confirm) { setError('Passwords do not match.'); return; } if (!terms) { setError('Please agree to the Terms of Service and Privacy Policy.'); return; } const users = getStoredUsers(); if (users.some((user) => user.email.toLowerCase() === fields.email.trim().toLowerCase())) { setError('An account with this email already exists.'); return; } setLoading(true); const passwordHash = await hashPassword(fields.password); const user = { id: makeId('user'), name: fields.name.trim(), email: fields.email.trim(), role: role || 'Lecturer', institution: fields.institution.trim(), department: fields.department.trim(), phone: '', avatar: '', memberSince: new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), passwordHash }; localStorage.setItem('planwiseUsers', JSON.stringify([...users, user])); await new Promise((resolve) => setTimeout(resolve, 350)); onRegister(user); }
  return <AuthShell mode="register" onNavigate={onNavigate}><div className="auth-form-wrap register-wrap"><div className="mobile-auth-brand"><div className="brand-mark"><GraduationCap size={20} /></div><strong>PlanWise AI</strong></div><span className="section-kicker">NEW EDUCATOR ACCOUNT</span><h2>Create your PlanWise AI account</h2><p className="auth-subtitle">Set up your teaching workspace in a few simple steps.</p><form className="auth-form register-form" onSubmit={submit}><div className="auth-form-grid"><label className="auth-field"><span>Full Name</span><div className="auth-input"><UserRound size={16} /><input value={fields.name} onChange={(event) => update('name', event.target.value)} placeholder="Your full name" autoComplete="name" /></div></label><label className="auth-field"><span>Email Address</span><div className="auth-input"><Mail size={16} /><input type="email" value={fields.email} onChange={(event) => update('email', event.target.value)} placeholder="you@institution.edu" autoComplete="email" /></div></label></div><PasswordField label="Password" value={fields.password} onChange={(value) => update('password', value)} autoComplete="new-password" /><div className="password-requirements">{[['length','At least 8 characters'],['number','Contains a number'],['upper','Contains an uppercase letter'],['lower','Contains a lowercase letter']].map(([key, label]) => <span className={checks[key] ? 'valid' : ''} key={key}>{checks[key] ? <Check size={13} /> : <Circle size={13} />} {label}</span>)}</div><div className="strength-meter"><span>Password strength</span><strong className={Object.values(checks).filter(Boolean).length >= 4 ? 'strong' : Object.values(checks).filter(Boolean).length >= 2 ? 'medium' : 'weak'}>{Object.values(checks).filter(Boolean).length >= 4 ? 'Strong' : Object.values(checks).filter(Boolean).length >= 2 ? 'Medium' : 'Weak'}</strong></div><PasswordField label="Confirm Password" value={fields.confirm} onChange={(value) => update('confirm', value)} autoComplete="new-password" /><div className="role-section"><span className="role-label">Your Role</span><div className="role-grid">{roleOptions.map(({ value, icon: Icon, description }) => <button type="button" className={`role-option ${fields.role === value ? 'selected' : ''}`} key={value} onClick={() => update('role', value)}><Icon size={17} /><span><strong>{value}</strong><small>{description}</small></span></button>)}</div>{fields.role === 'Other' && <label className="auth-field"><span>Specify your role</span><div className="auth-input"><BriefcaseBusiness size={16} /><input value={fields.otherRole} onChange={(event) => update('otherRole', event.target.value)} placeholder="e.g. Curriculum Specialist" /></div></label>}</div><div className="auth-form-grid"><label className="auth-field"><span>Institution</span><div className="auth-input"><GraduationCap size={16} /><input value={fields.institution} onChange={(event) => update('institution', event.target.value)} placeholder="Enter your school, college or university" /></div></label><label className="auth-field"><span>Department</span><div className="auth-input"><BookOpen size={16} /><input value={fields.department} onChange={(event) => update('department', event.target.value)} placeholder="e.g. Information Technology" /></div></label></div>{error && <div className="auth-error">{error}</div>}<label className="terms-check"><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} /> <span>I agree to the <button type="button">Terms of Service</button> and <button type="button">Privacy Policy</button>.</span></label><button className="auth-submit" disabled={loading || !terms}>{loading ? 'Creating account...' : 'Create Account'} <ArrowRight size={16} /></button></form><p className="auth-switch">Already have an account? <button onClick={() => onNavigate('login')}>Sign In</button></p></div></AuthShell>;
}

function ForgotPasswordPage({ onNavigate }) {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [error, setError] = useState('');
  function submit(event) { event.preventDefault(); if (!/^\S+@\S+\.\S+$/.test(email)) { setError('Enter a valid email address.'); return; } setError(''); setSent(true); }
  return <AuthShell onNavigate={onNavigate}><div className="auth-form-wrap compact-auth"><div className="mobile-auth-brand"><div className="brand-mark"><GraduationCap size={20} /></div><strong>PlanWise AI</strong></div>{sent ? <><div className="success-auth-icon"><Check size={21} /></div><span className="section-kicker">CHECK YOUR INBOX</span><h2>Reset link sent</h2><p className="auth-subtitle">If an account exists for {email}, we've sent instructions to reset your password.</p><button className="auth-submit" onClick={() => onNavigate('login')}>Back to Sign In <ArrowRight size={16} /></button></> : <><span className="section-kicker">ACCOUNT RECOVERY</span><h2>Forgot your password?</h2><p className="auth-subtitle">Enter your email address and we'll help you reset your password.</p><form className="auth-form" onSubmit={submit}><label className="auth-field"><span>Email Address</span><div className="auth-input"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@institution.edu" /></div></label>{error && <div className="auth-error">{error}</div>}<button className="auth-submit">Send Reset Link <ArrowRight size={16} /></button></form><button className="auth-back" onClick={() => onNavigate('login')}><ArrowRight size={15} className="back-arrow" /> Back to Sign In</button></>}</div></AuthShell>;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
});

function Avatar({ user, large = false }) {
  const initials = user.name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'U';
  return user.avatar ? <img className={`user-avatar ${large ? 'large' : ''}`} src={user.avatar} alt={`${user.name} profile`} /> : <div className={`initial-avatar ${large ? 'large' : ''}`}>{initials}</div>;
}

function ProfilePage({ user, onSave, onNavigate, startEditing = false }) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(user);
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');

  useEffect(() => setDraft(user), [user]);
  useEffect(() => setEditing(startEditing), [startEditing]);

  function update(field, value) { setDraft((current) => ({ ...current, [field]: value })); }
  function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) { setPhotoError('Choose an image under 2 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { update('avatar', reader.result); setPhotoError(''); };
    reader.readAsDataURL(file);
  }
  function save(event) {
    event.preventDefault();
    if (!draft.name.trim()) { setError('Full name is required.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(draft.email)) { setError('Enter a valid email address.'); return; }
    setError(''); onSave({ ...draft, name: draft.name.trim(), email: draft.email.trim() }); setEditing(false);
  }

  return <section className="account-page">
    <div className="account-heading"><div><span className="section-kicker">ACCOUNT</span><h1>{editing ? 'Edit your profile' : 'Your profile'}</h1><p>Keep your teaching identity and contact details up to date.</p></div>{!editing && <button className="primary-button" onClick={() => setEditing(true)}><Pencil size={16} /> Edit Profile</button>}</div>
    {editing ? <form className="panel-card profile-form" onSubmit={save}>
      <div className="profile-form-top"><Avatar user={draft} large /><div><label className="upload-button"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhoto} />Change Photo</label>{draft.avatar && <button type="button" className="text-button" onClick={() => update('avatar', '')}>Remove Photo</button>}{photoError && <small className="field-error">{photoError}</small>}</div></div>
      <div className="account-form-grid"><label className="field"><span>Full Name</span><input value={draft.name} onChange={(event) => update('name', event.target.value)} /></label><label className="field"><span>Email</span><input type="email" value={draft.email} onChange={(event) => update('email', event.target.value)} /></label><label className="field"><span>Phone Number</span><input value={draft.phone} placeholder="Not provided" onChange={(event) => update('phone', event.target.value)} /></label><label className="field"><span>Institution</span><input value={draft.institution} placeholder="Not provided" onChange={(event) => update('institution', event.target.value)} /></label><label className="field"><span>Department</span><input value={draft.department} placeholder="Not provided" onChange={(event) => update('department', event.target.value)} /></label><label className="field"><span>Role</span><input value={draft.role} readOnly /></label></div>
      {error && <div className="error-box">{error}</div>}<div className="footer-actions-row"><button type="button" className="secondary-button" onClick={() => { setDraft(user); setEditing(false); }}>Cancel</button><button type="submit" className="primary-button"><Save size={16} /> Save Changes</button></div>
    </form> : <div className="profile-layout"><div className="panel-card identity-card"><Avatar user={user} large /><h2>{user.name}</h2><p>{user.role}</p><span className="account-status"><ShieldCheck size={14} /> Active</span></div><div className="panel-card details-card"><div className="panel-head"><h3>Personal information</h3><button className="pill-button" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</button></div><div className="detail-grid">{[['Email', user.email, Mail], ['Role', user.role, UserRound], ['Institution', user.institution, ShieldCheck], ['Department', user.department, ShieldCheck], ['Phone number', user.phone, Phone], ['Member since', user.memberSince, ShieldCheck]].map(([label, value, Icon]) => <div className="detail-item" key={label}><Icon size={16} /><span><small>{label}</small><strong>{value || 'Not provided'}</strong></span></div>)}</div></div></div>}
  </section>;
}

function SettingsPage({ user, onNavigate, onLogout, darkMode, setDarkMode }) {
  const [preferences, setPreferences] = useState(() => JSON.parse(localStorage.getItem('planwisePreferences') || '{"notifications":true,"lessons":true,"assessments":true,"ai":true}'));
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordMessage, setPasswordMessage] = useState('');
  function toggle(key) { setPreferences((current) => { const next = { ...current, [key]: !current[key] }; localStorage.setItem('planwisePreferences', JSON.stringify(next)); return next; }); }
  function changePassword(event) { event.preventDefault(); if (!passwords.current || !passwords.next || passwords.next.length < 8 || passwords.next !== passwords.confirm) { setPasswordMessage('Use an 8-character password and make sure both new passwords match.'); return; } setPasswords({ current: '', next: '', confirm: '' }); setPasswordMessage('Password changed successfully.'); }
  return <section className="account-page settings-page"><div className="account-heading"><div><span className="section-kicker">ACCOUNT SETTINGS</span><h1>Settings</h1><p>Manage your workspace preferences and account security.</p></div></div><div className="settings-layout"><div className="settings-main"><div className="panel-card settings-card"><div className="settings-title"><UserRound size={18} /><div><h3>Account</h3><span>Personal information and access</span></div></div><button className="settings-row" onClick={() => onNavigate('profile')}><span>Personal information<small>{user.email}</small></span><Pencil size={15} /></button><button className="settings-row" onClick={() => onNavigate('profile')}><span>Profile<small>{user.role} · {user.department || 'Department not provided'}</small></span><Pencil size={15} /></button><button className="settings-row"><span>Password<small>Change your password regularly</small></span><ShieldCheck size={15} /></button></div><div className="panel-card settings-card"><div className="settings-title"><Bell size={18} /><div><h3>Notifications</h3><span>Choose what reaches your inbox</span></div></div>{[['notifications','Email notifications'],['lessons','Lesson reminders'],['assessments','Assessment reminders'],['ai','AI activity notifications']].map(([key, label]) => <label className="toggle-row" key={key}><span>{label}</span><input type="checkbox" checked={preferences[key]} onChange={() => toggle(key)} /><i /></label>)}</div></div><aside className="settings-side"><div className="panel-card settings-card"><div className="settings-title"><Sparkles size={18} /><div><h3>Preferences</h3><span>Make PlanWise yours</span></div></div><label className="select-row">Theme<select value={darkMode ? 'Dark' : 'Light'} onChange={(event) => setDarkMode(event.target.value === 'Dark')}><option>Light</option><option>Dark</option></select></label><label className="select-row">Language<select defaultValue="English"><option>English</option></select></label><label className="select-row">Time format<select defaultValue="24-hour"><option>24-hour</option><option>12-hour</option></select></label></div><div className="panel-card settings-card"><div className="settings-title"><ShieldCheck size={18} /><div><h3>Security</h3><span>Your account protection</span></div></div><form className="password-form" onSubmit={changePassword}><label className="field"><span>Current Password</span><input type="password" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} /></label><label className="field"><span>New Password</span><input type="password" value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} /></label><label className="field"><span>Confirm New Password</span><input type="password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} /></label>{passwordMessage && <small className={passwordMessage.includes('successfully') ? 'success-message' : 'field-error'}>{passwordMessage}</small>}<button className="secondary-button" type="submit">Change Password</button></form><button className="logout-link" onClick={onLogout}><LogOut size={15} /> Log out</button></div></aside></div></section>;
}

function App() {
  const [activeSection, setActiveSection] = useState(() => window.location.pathname === '/profile' ? 'profile' : window.location.pathname === '/settings' ? 'settings' : window.location.pathname === '/courses' ? 'courses' : window.location.pathname === '/courses/upload' ? 'upload-course' : window.location.pathname === '/progress' ? 'progress' : window.location.pathname.startsWith('/courses/') ? 'course-detail' : 'dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState(() => (localStorage.getItem('planwiseSession') === 'active' || sessionStorage.getItem('planwiseSession') === 'active') && Boolean(localStorage.getItem('planwiseUser')));
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem('planwiseUser') || JSON.stringify(defaultUser)));
  const [courses, setCourses] = useState(() => JSON.parse(localStorage.getItem('planwiseCourses') || '[]'));
  const [selectedCourseId, setSelectedCourseId] = useState(() => window.location.pathname.match(/^\/courses\/([^/]+)/)?.[1] || '');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('planwiseDarkMode') === 'true');
  const [aiMaterial, setAiMaterial] = useState(null);
  const [aiArtifact, setAiArtifact] = useState(null);
  const [aiDifficulty, setAiDifficulty] = useState('Intermediate');
  const [calendarEvents, setCalendarEvents] = useState(() => JSON.parse(localStorage.getItem('planwiseCalendar') || '[]'));
  const [assessments, setAssessments] = useState(() => JSON.parse(localStorage.getItem('planwiseAssessments') || '[]'));
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [topics, setTopics] = useState(initialForm.topics);
  const [errors, setErrors] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [selectedLessonIndex, setSelectedLessonIndex] = useState(0);
  const [savedPlans, setSavedPlans] = useState([]);
  const [openWeeks, setOpenWeeks] = useState({ 1: true });
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const profileMenuRef = useRef(null);
  useEffect(() => { localStorage.setItem('planwiseUser', JSON.stringify(currentUser)); }, [currentUser]);
  useEffect(() => { localStorage.setItem('planwiseCourses', JSON.stringify(courses)); }, [courses]);
  useEffect(() => { localStorage.setItem('planwiseCalendar', JSON.stringify(calendarEvents)); }, [calendarEvents]);
  useEffect(() => { localStorage.setItem('planwiseAssessments', JSON.stringify(assessments)); }, [assessments]);
  useEffect(() => {
    localStorage.setItem('planwiseDarkMode', String(darkMode));
    const enabled = Boolean(isAuthenticated && darkMode);
    document.documentElement.classList.toggle('dark-mode', enabled);
    document.body.classList.toggle('dark-mode', enabled);
  }, [darkMode, isAuthenticated]);
  useEffect(() => {
    function closeProfile(event) { if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) setProfileOpen(false); }
    function closeOnEscape(event) { if (event.key === 'Escape') { setProfileOpen(false); setLogoutOpen(false); } }
    function onPopState() {
      const path = window.location.pathname;
      if (path === '/register') setActiveSection('register');
      else if (path === '/forgot-password') setActiveSection('forgot-password');
      else if (path === '/login') setActiveSection('login');
      else if (path === '/') setActiveSection(isAuthenticated ? 'dashboard' : 'landing');
    }
    document.addEventListener('mousedown', closeProfile); document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('mousedown', closeProfile);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('popstate', onPopState);
    };
  }, [isAuthenticated]);

  const currentStepLabel = useMemo(() => {
    const labels = ['Course', 'Topics', 'Schedule', 'Preferences', 'Generate'];
    return labels[step - 1] || 'Generate';
  }, [step]);

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function toggleSelection(listName, value) {
    const current = form[listName] || [];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    updateField(listName, next);
  }

  function addTopic() {
    setTopics((previous) => [...previous, '']);
  }

  function updateTopic(index, value) {
    setTopics((previous) => previous.map((topic, idx) => (idx === index ? value : topic)));
  }

  function removeTopic(index) {
    setTopics((previous) => previous.filter((_, idx) => idx !== index));
  }

  function moveTopic(index, direction) {
    setTopics((previous) => {
      const next = [...previous];
      const target = index + direction;
      if (target < 0 || target >= next.length) return previous;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function nextStep() {
    if (step === 1) {
      const nextErrors = {};
      if (!form.courseName) nextErrors.courseName = 'Please enter a course name.';
      if (!form.courseCode) nextErrors.courseCode = 'Please enter a course code.';
      if (!form.startDate) nextErrors.startDate = 'Please select a course start date.';
      if (!form.endDate) nextErrors.endDate = 'Please select a course end date.';
      if (new Date(form.endDate) < new Date(form.startDate)) nextErrors.endDate = 'End date cannot be earlier than the start date.';
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length) return;
    }

    if (step === 2) {
      const nextErrors = {};
      if (!topics.length || topics.some((topic) => !topic.trim())) nextErrors.topics = 'Please enter at least one course topic.';
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length) return;
      updateField('topics', topics.filter(Boolean).map((topic) => topic.trim()));
    }

    if (step === 3) {
      const nextErrors = {};
      if (!form.lessonsPerWeek) nextErrors.lessonsPerWeek = 'Please specify lessons per week.';
      if (!form.lessonDuration) nextErrors.lessonDuration = 'Please specify the lesson duration.';
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length) return;
    }

    setStep((value) => Math.min(value + 1, 5));
  }

  function prevStep() {
    setStep((value) => Math.max(value - 1, 1));
  }

  async function generateLessonPlan() {
    const payload = {
      ...form,
      topics: topics.filter(Boolean).map((topic) => topic.trim()),
      numberOfWeeks: Number(form.numberOfWeeks || Math.ceil((new Date(form.endDate) - new Date(form.startDate)) / (1000 * 60 * 60 * 24 * 7)) || 1),
      holidays: (form.holidays || []).map((holiday) => ({ date: holiday.date || holiday, name: holiday.name || 'Holiday' })),
    };

    setIsGenerating(true);
    setErrors({});
    setActiveSection('plans');

    try {
      const response = await api.post('/lesson-plans/generate', payload);
      setGenerated(response.data);
      setSelectedLessonIndex(0);
      setStep(5);
    } catch (error) {
      setErrors({ general: error.response?.data?.message || 'Unable to generate the lesson plan. Please try again.' });
    } finally {
      setIsGenerating(false);
    }
  }

  async function regenerateLesson(lesson, instruction) {
    const response = await api.post('/lesson-plans/regenerate', { lesson, instruction });
    const regenerated = response.data.lesson;
    setGenerated((previous) => ({
      ...previous,
      lessons: (previous?.lessons || []).map((item) => item.lessonDate === lesson.lessonDate && item.topic === lesson.topic ? regenerated : item),
    }));
  }

  function savePlan() {
    if (!generated) return;
    setSavedPlans((previous) => [{
      id: `saved-${Date.now()}`,
      courseName: generated.courseName,
      courseCode: generated.courseCode,
      dateCreated: new Date().toISOString().slice(0, 10),
      lessons: generated.lessons?.length || 0,
      status: 'Saved',
    }, ...previous]);
    const suggestions = suggestCalendarFromPlan(generated, form);
    if (suggestions.length) setCalendarEvents((current) => [...suggestions, ...current]);
  }

  function exportPlan(format) {
    if (!generated) return;
    if (format === 'pdf' || format === 'docx') {
      alert(`${format.toUpperCase()} export is ready for download in a real implementation. This demo generates the plan in-app.`);
      return;
    }
    window.print();
  }

  function saveAssessment(next) {
    setAssessments((current) => {
      const exists = current.some((item) => item.id === next.id);
      return exists ? current.map((item) => item.id === next.id ? next : item) : [next, ...current];
    });
    if (next.status === 'published' || next.status === 'approved') {
      setCourses((current) => current.map((course, index) => index === 0 ? { ...course, assessments: [{ id: next.id, title: next.title, status: next.status }, ...course.assessments.filter((item) => item.id !== next.id)] } : course));
    }
  }

  function mergeCalendarEvents(incoming) {
    const items = Array.isArray(incoming) ? incoming : [];
    setCalendarEvents((current) => {
      const next = [...current];
      items.forEach((event) => {
        const index = next.findIndex((item) => item.id === event.id);
        if (index >= 0) next[index] = event;
        else next.unshift(event);
      });
      return next;
    });
  }

  function navigateTo(section, options = {}) {
    setActiveSection(section);
    if (section === 'profile') setProfileEditing(Boolean(options.editing));
    setProfileOpen(false);
    window.history.pushState({}, '', section === 'profile' ? '/profile' : section === 'settings' ? '/settings' : section === 'courses' ? '/courses' : section === 'upload-course' ? '/courses/upload' : section === 'progress' ? '/progress' : section === 'forgot-password' ? '/forgot-password' : section === 'register' ? '/register' : section === 'login' ? '/login' : '/');
  }

  function startSession(user, remember = true) {
    const safeUser = { ...user }; delete safeUser.passwordHash;
    setCurrentUser(safeUser); localStorage.setItem('planwiseUser', JSON.stringify(safeUser));
    if (remember) localStorage.setItem('planwiseSession', 'active');
    else { localStorage.removeItem('planwiseSession'); sessionStorage.setItem('planwiseSession', 'active'); }
    setIsAuthenticated(true); navigateTo('dashboard');
  }

  function saveUser(nextUser) {
    setCurrentUser(nextUser);
    localStorage.setItem('planwiseUser', JSON.stringify(nextUser));
    setErrors({ general: 'Profile updated successfully.' });
    setTimeout(() => setErrors({}), 2600);
  }

  function confirmLogout() {
    setLogoutOpen(false);
    setProfileOpen(false);
    setIsAuthenticated(false);
    localStorage.setItem('planwiseSession', 'logged-out');
    localStorage.removeItem('planwiseUser');
    localStorage.removeItem('planwiseCourses');
    sessionStorage.removeItem('planwiseSession');
    window.history.pushState({}, '', '/');
    setActiveSection('landing');
  }

  function navigateCourse(courseId) { setSelectedCourseId(courseId); setActiveSection('course-detail'); setProfileOpen(false); window.history.pushState({}, '', `/courses/${courseId}`); }
  function createCourse(course) { setCourses((current) => [course, ...current]); setSelectedCourseId(course.id); setActiveSection('course-detail'); setProfileOpen(false); window.history.pushState({}, '', `/courses/${course.id}`); }
  function updateTopicStatus(courseId, moduleId, topicId) { setCourses((current) => current.map((course) => course.id !== courseId ? course : { ...course, modules: course.modules.map((module) => module.id !== moduleId ? module : { ...module, topics: module.topics.map((topic) => topic.id !== topicId ? topic : { ...topic, status: topic.status === 'not_started' ? 'in_progress' : topic.status === 'in_progress' ? 'completed' : 'not_started' }) }) })); }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  const currentDate = new Date();
  const greeting = currentDate.getHours() < 12 ? 'morning' : currentDate.getHours() < 17 ? 'afternoon' : 'evening';
  const dateLabel = currentDate.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const groupedLessons = useMemo(() => {
    if (!generated?.lessons) return [];
    return generated.lessons.reduce((acc, lesson) => {
      const key = lesson.weekNumber || 1;
      if (!acc[key]) acc[key] = [];
      acc[key].push(lesson);
      return acc;
    }, {});
  }, [generated]);
  const courseStats = useMemo(() => { const metrics = courses.map(courseMetrics); const totalTopics = metrics.reduce((sum, item) => sum + item.total, 0); const completedTopics = metrics.reduce((sum, item) => sum + item.completed, 0); return { plans: savedPlans.length, assessments: assessments.length || courses.reduce((sum, course) => sum + course.assessments.length, 0), progress: totalTopics ? Math.round((completedTopics / totalTopics) * 100) : 0 }; }, [courses, savedPlans, assessments]);

  if (!isAuthenticated) {
    if (window.location.pathname === '/register') return <RegisterPage onRegister={(user) => startSession(user, true)} onNavigate={navigateTo} />;
    if (window.location.pathname === '/forgot-password') return <ForgotPasswordPage onNavigate={navigateTo} />;
    if (window.location.pathname === '/login') return <LoginPage onLogin={startSession} onNavigate={navigateTo} />;
    return <LandingPage onNavigate={navigateTo} />;
  }

  const visibleNavItems = navItems.filter((item) => (roleNav[currentUser.role] || roleNav.Lecturer).includes(item.id));

  return (
    <div className={`edu-shell ${darkMode ? 'dark-mode' : ''}`}>
      <aside className="sidebar-panel">
        <div className="sidebar-header">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="brand-name">PlanWise AI</div>
            <div className="brand-tag">Academic operations</div>
          </div>
        </div>

        <nav className="side-nav">
          {visibleNavItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${activeSection === id ? 'active' : ''}`}
              onClick={() => {
                navigateTo(id);
                if (id === 'plans' || id === 'dashboard') setStep(5);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Avatar user={currentUser} />
          <div>
            <div className="profile-name">{currentUser.name}</div>
            <div className="profile-role">{currentUser.role}</div>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="searchbox">
            <Search size={16} />
            <input type="text" placeholder="Search courses, lessons, assessments, reports..." />
          </div>

          <div className="topbar-actions">
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><span className="notification-dot" /></button>
            <button className="icon-button" aria-label="Toggle dark mode" onClick={() => setDarkMode((value) => !value)}><MoonStar size={18} /></button>
            <button className="icon-button" aria-label="Toggle fullscreen" onClick={toggleFullscreen}><Maximize2 size={18} /></button>
            <div className="profile-anchor" ref={profileMenuRef}><button className="mini-profile" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}>
              <Avatar user={currentUser} />
              <div>
                <div className="mini-name">{currentUser.name}</div>
                <div className="mini-role">{currentUser.role}</div>
              </div>
              <ChevronDown size={15} />
            </button>{profileOpen && <div className="profile-menu"><div className="profile-menu-head"><Avatar user={currentUser} /><span><strong>{currentUser.name}</strong><small>{currentUser.role}</small></span></div><button onClick={() => navigateTo('profile')}><UserRound size={15} /> View Profile</button><button onClick={() => navigateTo('profile', { editing: true })}><Pencil size={15} /> Edit Profile</button><button onClick={() => navigateTo('settings')}><ShieldCheck size={15} /> Account Settings</button><button className="logout-link" onClick={() => { setProfileOpen(false); setLogoutOpen(true); }}><LogOut size={15} /> Logout</button></div>}</div>
          </div>
        </header>

        {activeSection === 'profile' && <ProfilePage user={currentUser} onSave={saveUser} onNavigate={navigateTo} startEditing={profileEditing} />}
        {activeSection === 'settings' && <SettingsPage user={currentUser} onNavigate={navigateTo} onLogout={() => setLogoutOpen(true)} darkMode={darkMode} setDarkMode={setDarkMode} />}
        {activeSection === 'courses' && <CoursesPage courses={courses} onOpen={navigateCourse} onUpload={() => navigateTo('upload-course')} />}
        {activeSection === 'upload-course' && <UploadCoursePage onCreate={createCourse} />}
        {activeSection === 'course-detail' && <CourseDetailPage course={courses.find((course) => course.id === selectedCourseId)} onBack={() => navigateTo('courses')} onStatusChange={updateTopicStatus} />}
        {activeSection === 'progress' && <ProgressPage courses={courses} onOpen={navigateCourse} onStatusChange={updateTopicStatus} />}
        {activeSection === 'dashboard' && (
          <>
            <section className="hero-panel">
              <div>
                <div className="eyebrow">{dateLabel}</div>
                <p className="greeting">Good {greeting}, {currentUser.name.split(' ')[0] || 'there'} <span className="wave">👋</span></p>
                <h1>Plan your lessons. Focus on your students.</h1>
                <p>Here's what's happening with your lesson plans today.</p>
                <div className="hero-actions">
                  <button className="primary-button" onClick={() => { setActiveSection('plans'); setStep(1); }}>
                    <Wand2 size={16} /> Generate Lesson Plan
                  </button>
                  <button className="secondary-button" onClick={() => setActiveSection('assistant')}>
                    <MessageSquareText size={16} /> Ask AI Assistant
                  </button>
                  <button className="secondary-button" onClick={() => navigateTo('upload-course')}><UploadCloud size={16} /> Upload Course</button>
                </div>
              </div>
              <div className="hero-preview">
                <div className="preview-card small">
                  <div className="preview-tag">Your teaching rhythm</div>
                  <div className="preview-metric">{courseStats.progress}%</div>
                  <div className="preview-label">Teaching progress</div>
                </div>
                <div className="preview-card large">
                  <div className="preview-kicker"><CheckCircle2 size={15} /> On track this semester</div>
                  <div className="preview-row">
                    <span>{courses[0]?.code || 'No active course'}</span>
                    <span>{courses[0]?.duration || 'Schedule pending'}</span>
                  </div>
                  <div className="preview-bar"><span style={{ width: '84%' }} /></div>
                  <div className="preview-row muted">
                    <span>{courses[0]?.name || 'Upload a course to begin'}</span>
                    <span>{courses[0] ? `${courseMetrics(courses[0]).completed}/${courseMetrics(courses[0]).total} topics` : 'No topics'}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="stats-grid">
              {[{ ...statCards[0], value: courses.length, detail: courses.length ? `${courses.length} tracked course${courses.length === 1 ? '' : 's'}` : 'Upload your first course' }, { ...statCards[1], value: courseStats.plans, detail: `${courseStats.plans} saved plan${courseStats.plans === 1 ? '' : 's'}` }, { ...statCards[2], value: courseStats.assessments, detail: `${courseStats.assessments} from your courses` }, { ...statCards[3], value: `${courseStats.progress}%`, detail: courses.length ? 'Based on completed topics' : 'No courses tracked yet' }].map(({ label, value, detail, accent, icon: Icon }) => (
                <article key={label} className={`stat-card ${accent}`}>
                  <div className="stat-icon"><Icon size={17} /></div>
                  <div className="stat-value">{value}</div>
                  <div className="stat-label">{label}</div>
                  <small className="stat-detail">{detail}</small>
                </article>
              ))}
            </section>

            <section className="ai-feature">
              <div className="ai-feature-copy"><div className="eyebrow"><Sparkles size={14} /> AI POWERED</div><h2>Plan your lessons.<br /><em>Focus on your students.</em></h2><p>Create structured lesson plans, assessments and teaching schedules with the help of your AI teaching assistant.</p><div className="hero-actions"><button className="primary-button" onClick={() => { setActiveSection('plans'); setStep(1); }}><Wand2 size={16} /> Generate Lesson Plan</button><button className="secondary-button" onClick={() => setActiveSection('assistant')}><MessageSquareText size={16} /> Ask AI Assistant</button></div></div>
              <div className="lesson-preview"><div className="preview-label-row"><span>LESSON PLAN</span><CheckCircle2 size={16} /></div><strong>{courses[0]?.name || 'Your next lesson plan'}</strong><span className="preview-topic">{courses[0]?.modules[0]?.topics[0]?.title || 'Upload a course to generate a plan'}</span><div className="preview-meta"><span><b>Duration</b>{courses[0]?.duration || 'Not provided'}</span><span><b>Course</b>{courses[0]?.code || 'Not provided'}</span></div><div className="preview-objectives"><b>Learning objectives</b><span>✓ Extracted from your course outline</span><span>✓ Ready to connect to a teaching schedule</span><span>✓ Trackable across your semester</span></div></div>
            </section>

            <section className="content-grid">
              <div className="panel-card large-panel">
                <div className="panel-head">
                  <h3>Recent activity</h3>
                  <button className="pill-button">View all</button>
                </div>
                <div className="activity-list">
                  {recentActivity.map((item) => (
                    <div key={item.title} className="activity-item">
                      <div className="activity-dot" />
                      <div className="activity-copy">
                        <strong>{item.title}</strong>
                        <span>{item.status}</span>
                      </div>
                      <small>{item.period}</small>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel-card">
                <div className="panel-head">
                  <h3>Upcoming lessons</h3>
                  <button className="pill-button" onClick={() => navigateTo('calendar')}>Calendar</button>
                </div>
                <div className="stack-list">
                  {courses.length ? courses.flatMap((course) => course.modules.flatMap((module) => module.topics.filter((topic) => topic.status !== 'completed').map((topic) => ({ ...topic, course: course.name })))).slice(0, 3).map((lesson) => (
                    <div key={lesson.title} className="stack-item">
                      <div className="stack-bullet lesson" />
                      <div>
                        <strong>{lesson.title}</strong>
                        <small>{lesson.course} · Teaching next</small>
                      </div>
                      <span className="type-tag">Upcoming</span>
                    </div>
                  )) : <p className="muted-text">No upcoming topics. Upload a course to create your teaching schedule.</p>}
                </div>
              </div>
            </section>

            <section className="content-grid lower-grid">
              <div className="panel-card">
                <div className="panel-head">
                  <h3>Course progress</h3>
                </div>
                <div className="progress-stack">
                  {courses.map((course) => (
                    <div key={course.code} className="progress-row">
                      <div className="progress-meta">
                        <strong>{course.code}</strong>
                        <span>{course.name || 'Course name not provided'}</span>
                      </div>
                      <div className="progress-bar"><span style={{ width: `${courseMetrics(course).percent}%` }} /></div>
                      <strong>{courseMetrics(course).percent}%</strong>
                    </div>
                  ))}
                  {!courses.length && <p className="muted-text">No courses yet. Upload your first outline to start tracking progress.</p>}
                </div>
              </div>

              <div className="panel-card">
                <div className="panel-head">
                  <h3>Quick actions</h3>
                </div>
                <div className="quick-actions">
                  <button className="action-button primary" onClick={() => { setActiveSection('plans'); setStep(1); }}><Wand2 size={16} /> Generate Lesson Plan</button>
                  <button className="action-button" onClick={() => navigateTo('upload-course')}><UploadCloud size={16} /> Upload Course</button>
                  <button className="action-button" onClick={() => navigateTo('assessments')}><ClipboardCheck size={16} /> Generate Assessment</button>
                  <button className="action-button" onClick={() => navigateTo('assistant')}><MessageSquareText size={16} /> Ask AI Assistant</button>
                  <button className="action-button" onClick={() => navigateTo('calendar')}><CalendarDays size={16} /> Manage Calendar</button>
                </div>
              </div>
            </section>
          </>
        )}

        {activeSection === 'plans' && (
          <section className="generator-shell">
            <div className="wizard-steps">
              {['Course', 'Topics', 'Schedule', 'Preferences', 'Generate'].map((label, index) => {
                const value = index + 1;
                return (
                <div key={value} className={`wizard-step ${step >= value ? 'active' : ''}`}>
                  <span className="wizard-number">{step > value ? '✓' : value}</span>
                  <span className="wizard-label">{label}</span>
                </div>
                );
              })}
            </div>

            <div className="generator-layout">
              <div className="panel-card main-form-panel">
                {step === 1 && (
                  <>
                    <div className="section-title-row"><h2>Create Your Lesson Plan</h2></div>
                    <div className="grid-2">
                      <label className="field"><span>Course Name</span><input value={form.courseName} onChange={(e) => updateField('courseName', e.target.value)} /></label>
                      <label className="field"><span>Course Code</span><input value={form.courseCode} onChange={(e) => updateField('courseCode', e.target.value)} /></label>
                      <label className="field"><span>Programme</span><input value={form.programme} onChange={(e) => updateField('programme', e.target.value)} /></label>
                      <label className="field"><span>Class/Level</span><input value={form.level} onChange={(e) => updateField('level', e.target.value)} /></label>
                      <label className="field"><span>Department</span><input value={form.department} onChange={(e) => updateField('department', e.target.value)} /></label>
                      <label className="field"><span>Lecturer/Teacher</span><input value={form.lecturer} onChange={(e) => updateField('lecturer', e.target.value)} /></label>
                      <label className="field"><span>Semester/Term</span><input value={form.semester} onChange={(e) => updateField('semester', e.target.value)} /></label>
                      <label className="field"><span>Academic Year</span><input value={form.academicYear} onChange={(e) => updateField('academicYear', e.target.value)} /></label>
                    </div>
                    {errors.courseName || errors.courseCode || errors.startDate || errors.endDate ? <div className="error-box">{errors.courseName || errors.courseCode || errors.startDate || errors.endDate}</div> : null}
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="section-title-row"><h2>Topics</h2></div>
                    <div className="topic-list">
                      {topics.map((topic, index) => (
                        <div key={`topic-${index}`} className="topic-card">
                          <div className="topic-card-head">
                            <span className="topic-index">Topic {index + 1}</span>
                            <div className="topic-card-actions">
                              <button type="button" className="icon-button small" onClick={() => moveTopic(index, -1)} aria-label="Move topic up"><ArrowRight size={14} className="rotate-up" /></button>
                              <button type="button" className="icon-button small" onClick={() => moveTopic(index, 1)} aria-label="Move topic down"><ArrowRight size={14} /></button>
                              <button type="button" className="secondary-button danger" onClick={() => removeTopic(index)}>Delete</button>
                            </div>
                          </div>
                          <input value={topic} onChange={(e) => updateTopic(index, e.target.value)} placeholder="Topic title" />
                        </div>
                      ))}
                    </div>
                    <div className="footer-actions-row topic-add-row"><button className="secondary-button" onClick={addTopic}>+ Add Topic</button></div>
                    {errors.topics ? <div className="error-box">{errors.topics}</div> : null}
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className="section-title-row"><h2>Teaching Schedule</h2></div>
                    <div className="grid-2">
                      <label className="field"><span>Course Start Date</span><input type="date" value={form.startDate} onChange={(e) => updateField('startDate', e.target.value)} /></label>
                      <label className="field"><span>Course End Date</span><input type="date" value={form.endDate} onChange={(e) => updateField('endDate', e.target.value)} /></label>
                      <label className="field"><span>Number of Weeks</span><input type="number" min="1" value={form.numberOfWeeks} onChange={(e) => updateField('numberOfWeeks', e.target.value)} /></label>
                      <label className="field"><span>Lessons per Week</span><input type="number" min="1" value={form.lessonsPerWeek} onChange={(e) => updateField('lessonsPerWeek', e.target.value)} /></label>
                      <label className="field full-span"><span>Lesson Duration</span><input value={form.lessonDuration} onChange={(e) => updateField('lessonDuration', e.target.value)} /></label>
                    </div>

                    <h3 className="mini-heading">School calendar / non-teaching dates</h3>
                    <div className="holiday-list">
                      {(form.holidays || []).map((holiday, index) => (
                        <div key={index} className="holiday-row">
                          <input type="date" value={holiday.date} onChange={(e) => {
                            const next = [...(form.holidays || [])];
                            next[index] = { ...next[index], date: e.target.value };
                            updateField('holidays', next);
                          }} />
                          <input value={holiday.name || ''} onChange={(e) => {
                            const next = [...(form.holidays || [])];
                            next[index] = { ...next[index], name: e.target.value };
                            updateField('holidays', next);
                          }} placeholder="Holiday name" />
                          <button className="secondary-button danger" onClick={() => updateField('holidays', (form.holidays || []).filter((_, idx) => idx !== index))}>Remove</button>
                        </div>
                      ))}
                    </div>
                    <div className="footer-actions-row"><button className="secondary-button" onClick={() => updateField('holidays', [...(form.holidays || []), { date: '', name: '' }])}>Add holiday</button></div>
                    {errors.lessonsPerWeek || errors.lessonDuration || errors.endDate ? <div className="error-box">{errors.lessonsPerWeek || errors.lessonDuration || errors.endDate}</div> : null}
                  </>
                )}

                {step === 4 && (
                  <>
                    <div className="section-title-row"><h2>Lesson Preferences</h2></div>
                    <div className="preferences-grid">
                      <div>
                        <h3>Teaching Method</h3>
                        <div className="choice-group">
                          {teachingMethodsList.map((item) => (
                            <button key={item} className={`choice-btn ${form.teachingMethods?.includes(item) ? 'active' : ''}`} onClick={() => toggleSelection('teachingMethods', item)}>{item}</button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h3>Learning Activities</h3>
                        <div className="choice-group">
                          {learningActivitiesList.map((item) => (
                            <button key={item} className={`choice-btn ${form.learningActivities?.includes(item) ? 'active' : ''}`} onClick={() => toggleSelection('learningActivities', item)}>{item}</button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="difficulty-section">
                      <h3>Lesson Difficulty</h3>
                      <div className="choice-group">
                        {['Beginner', 'Intermediate', 'Advanced'].map((level) => (
                          <button key={level} className={`choice-btn ${form.difficulty === level ? 'active' : ''}`} onClick={() => updateField('difficulty', level)}>{level}</button>
                        ))}
                      </div>
                    </div>

                    <label className="field full-span custom-box">
                      <span>Custom Instructions</span>
                      <textarea rows={5} value={form.customInstructions} onChange={(e) => updateField('customInstructions', e.target.value)} />
                    </label>
                  </>
                )}

                {step === 5 && (
                  <>
                    <div className="section-title-row"><h2>Generate</h2></div>
                    {isGenerating ? (
                      <div className="generation-screen">
                        <div className="loader-ring" />
                        <h3>Creating your lesson plan...</h3>
                        <div className="generation-list">
                          <span className="done">✓ Understanding course structure</span>
                          <span className="done">✓ Organizing topics</span>
                          <span className="done">✓ Calculating teaching sessions</span>
                          <span className="current">● Creating learning objectives</span>
                          <span className="pending">● Designing activities</span>
                          <span className="pending">● Building schedule</span>
                        </div>
                      </div>
                    ) : (
                      <div className="generate-summary">
                        {errors.general ? <div className="error-box">{errors.general}</div> : null}
                        {!generated ? (
                          <div className="summary-box">
                            <p>Review your inputs and click generate to produce a complete lesson plan.</p>
                            <button className="primary-button" onClick={generateLessonPlan}>Generate Lesson Plan</button>
                          </div>
                        ) : (
                          <div className="plan-result">
                            <div className="plan-header-row">
                              <div>
                                <div className="eyebrow">Course overview</div>
                                <h3>{generated.courseName}</h3>
                                <small>{generated.courseCode} · {form.semester}</small>
                              </div>
                              <div className="plan-actions">
                                <button className="primary-button" onClick={savePlan}>Save</button>
                                <button className="secondary-button" onClick={() => exportPlan('pdf')}>Export</button>
                                <button className="secondary-button" onClick={() => exportPlan('print')}>Print</button>
                              </div>
                            </div>

                            {generated.warnings?.length ? <div className="warning-box">{generated.warnings[0]}</div> : null}

                            <div className="week-accordion">
                              {Object.entries(groupedLessons).map(([weekKey, lessons]) => (
                                <div key={weekKey} className="week-card">
                                  <div className="week-header">
                                    <div>
                                      <span className="week-badge">WEEK {weekKey}</span>
                                      <div className="week-meta">{lessons[0]?.lessonDate || 'Schedule pending'} · {lessons.length} lessons</div>
                                    </div>
                                    <button className="pill-button" onClick={() => setOpenWeeks((current) => ({ ...current, [weekKey]: !current[weekKey] }))}>{openWeeks[weekKey] ? 'Collapse' : 'Expand'} <ChevronDown size={14} className={openWeeks[weekKey] ? 'chevron-up' : ''} /></button>
                                  </div>
                                  {openWeeks[weekKey] && <div className="week-body">
                                    {lessons.map((lesson, idx) => (
                                      <div key={`${lesson.lessonDate}-${idx}`} className="lesson-block">
                                        <div className="lesson-block-header">
                                          <div>
                                            <strong>{lesson.topic}</strong>
                                            <span>{lesson.subtopic}</span>
                                          </div>
                                          <div className="lesson-block-actions">
                                            <button className="small-link" onClick={() => regenerateLesson(lesson, 'Make this lesson more practical.')}>Regenerate</button>
                                            <button className="small-link" onClick={() => alert('Edit lesson in a full editor implementation.')}>Edit</button>
                                            <button className="small-link" onClick={() => alert('Duplicate lesson in a full editor implementation.')}>Duplicate</button>
                                          </div>
                                        </div>
                                        <div className="lesson-grid">
                                          <div><label>Objectives</label><ul>{(lesson.learningObjectives || []).map((o) => <li key={o}>{o}</li>)}</ul></div>
                                          <div><label>Outcomes</label><ul>{(lesson.learningOutcomes || []).map((o) => <li key={o}>{o}</li>)}</ul></div>
                                          <div><label>Teacher activities</label><ul>{(lesson.teacherActivities || []).map((a) => <li key={a}>{a}</li>)}</ul></div>
                                          <div><label>Student activities</label><ul>{(lesson.studentActivities || []).map((a) => <li key={a}>{a}</li>)}</ul></div>
                                          <div><label>Resources</label><ul>{(lesson.learningResources || []).map((r) => <li key={r}>{r}</li>)}</ul></div>
                                          <div><label>Assessment</label><p>{lesson.assessmentMethod}</p></div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <aside className="side-summary">
                <div className="panel-card summary-card">
                  <h3>Course overview</h3>
                  <ul>
                    <li><span>Course</span><strong>{form.courseName || 'Not entered'}</strong></li>
                    <li><span>Code</span><strong>{form.courseCode || 'Not entered'}</strong></li>
                    <li><span>Programme</span><strong>{form.programme || 'Not entered'}</strong></li>
                    <li><span>Duration</span><strong>{form.lessonDuration || 'Not entered'}</strong></li>
                  </ul>
                </div>

                <div className="panel-card summary-card">
                  <h3>Saved Plans</h3>
                  {savedPlans.length ? (
                    <div className="saved-list">
                      {savedPlans.map((plan) => (
                        <div key={plan.id} className="saved-item">
                          <strong>{plan.courseName}</strong>
                          <span>{plan.courseCode}</span>
                          <small>{plan.dateCreated} · {plan.lessons} lessons</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted-text">No saved lesson plans yet.</p>
                  )}
                </div>
              </aside>
            </div>

            <div className="footer-actions-row">
              {step > 1 && <button className="secondary-button" onClick={prevStep}>Previous</button>}
              {step < 5 && <button className="primary-button" onClick={nextStep}>Next</button>}
              {step === 5 && !isGenerating && !generated && (
                <button className="primary-button" onClick={generateLessonPlan}>Generate Lesson Plan</button>
              )}
            </div>
          </section>
        )}

        {activeSection === 'calendar' && (
          <CalendarPage events={calendarEvents} onChange={setCalendarEvents} />
        )}

        {activeSection === 'assessments' && (
          <AssessmentsPage
            assessments={assessments}
            material={aiMaterial}
            difficulty={aiDifficulty}
            onSave={saveAssessment}
            onDelete={(id) => setAssessments((current) => current.filter((item) => item.id !== id))}
            onSchedule={mergeCalendarEvents}
            onOpenAssistant={() => navigateTo('assistant')}
          />
        )}

        {activeSection === 'assistant' && (
          <AssistantPage
            user={currentUser}
            material={aiMaterial}
            setMaterial={setAiMaterial}
            artifact={aiArtifact}
            setArtifact={setAiArtifact}
            assessments={assessments}
            onSaveAssessment={saveAssessment}
            onScheduleEvents={mergeCalendarEvents}
            difficulty={aiDifficulty}
            setDifficulty={setAiDifficulty}
          />
        )}

        {activeSection === 'resources' && (
          <section className="account-page">
            <div className="account-heading"><div><span className="section-kicker">TEACHING LIBRARY</span><h1>Resources</h1><p>Keep uploaded files, generated notes, and revision materials alongside your courses.</p></div></div>
            <div className="panel-card empty-course"><h2>{aiMaterial?.status === 'ready' ? aiMaterial.name : 'No resource file yet'}</h2><p>{aiMaterial?.status === 'ready' ? 'This file is available to the AI assistant as source material.' : 'Upload a PDF, Word, or PowerPoint file in the AI Assistant to start a resource library.'}</p><button className="primary-button" onClick={() => navigateTo('assistant')}>Open AI Assistant</button></div>
          </section>
        )}

        {activeSection === 'notifications' && (
          <section className="account-page">
            <div className="account-heading"><div><span className="section-kicker">UPDATES</span><h1>Notifications</h1><p>Lesson, assessment, and AI activity reminders appear here.</p></div></div>
            <div className="panel-card">
              <div className="activity-list">
                {assessments.slice(0, 3).map((item) => (
                  <div className="activity-item" key={item.id}><div className="activity-dot" /><div className="activity-copy"><strong>{item.title}</strong><span>{item.status}</span></div><small>Assessment</small></div>
                ))}
                {calendarEvents.filter((item) => item.status === 'suggested').slice(0, 3).map((item) => (
                  <div className="activity-item" key={item.id}><div className="activity-dot" /><div className="activity-copy"><strong>{item.title}</strong><span>Suggested calendar entry waiting for review</span></div><small>{item.date}</small></div>
                ))}
                {!assessments.length && !calendarEvents.length && <p className="muted-text">No notifications yet. Generate a lesson or assessment to see activity here.</p>}
              </div>
            </div>
          </section>
        )}
        {errors.general === 'Profile updated successfully.' && <div className="success-toast"><CheckCircle2 size={16} /> Profile updated successfully.</div>}
        {logoutOpen && <div className="dialog-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title"><div className="dialog-icon"><LogOut size={19} /></div><h2 id="logout-title">Are you sure you want to log out?</h2><p>Your session will end and you will return to the sign-in screen.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setLogoutOpen(false)}>Cancel</button><button className="logout-confirm" onClick={confirmLogout}>Log Out</button></div></div></div>}
      </main>
    </div>
  );
}

export default App;
