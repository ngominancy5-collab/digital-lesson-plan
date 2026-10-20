import { useEffect, useMemo, useRef, useState } from 'react';
import {
  adminApi,
  attendanceApi,
  authApi,
  assessmentApi,
  calendarApi,
  clearSession,
  courseApi,
  downloadLessonPlanPdf,
  getToken,
  institutionApi,
  lessonPlanApi,
  markingApi,
  notificationApi,
  quizApi,
  reportApi,
  resourceApi,
  searchApi,
  setToken,
  settingsApi,
} from './services/api.js';
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
  Clock3,
  FileText,
  Folder,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
  Users,
  UploadCloud,
  Circle,
  CircleDashed,
  Check,
  X,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  MoonStar,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Sun,
  TrendingUp,
  UserCircle2,
  Wand2,
  X,
  BriefcaseBusiness,
  Building2,
  School,
  BarChart3,
  ScanText,
  Settings2,
} from 'lucide-react';
import AssistantPage from './components/AssistantPage.jsx';
import CalendarPage from './components/CalendarPage.jsx';
import AssessmentsPage from './components/AssessmentsPage.jsx';
import FloatingAssistant from './components/FloatingAssistant.jsx';
import LandingPage from './components/LandingPage.jsx';
import DashboardHome from './components/DashboardHome.jsx';
import AdminPanel, { AssignRoleDialog } from './components/AdminPanel.jsx';
import PaperMarkingPage from './components/PaperMarkingPage.jsx';
import { EDUCATOR_ROLES } from './data/institutions.js';
import TypedText from './components/TypedText.jsx';
import Notice from './components/Notice.jsx';
import './auth.css';
import './components/dashboard-glass.css';
import './components/dashboard-reference.css';
import { suggestCalendarFromPlan } from '../shared/learningEngine.js';

const teachingMethodsList = ['Lecture', 'Discussion', 'Demonstration', 'Group work', 'Practical', 'Problem solving', 'Case study', 'Project-based learning'];
const learningActivitiesList = ['Individual exercises', 'Group activities', 'Practical exercises', 'Discussions', 'Presentations', 'Research', 'Demonstrations'];

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'courses', label: 'Courses / Subjects', icon: GraduationCap },
  { id: 'plans', label: 'Lesson Plans', icon: FileText },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'assessments', label: 'Assessments', icon: ClipboardCheck },
  { id: 'paper-marking', label: 'Paper Marking', icon: ScanText },
  { id: 'resources', label: 'Resources', icon: Folder },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'assistant', label: 'AI Assistant', icon: Sparkles },
  { id: 'accounts', label: 'Accounts', icon: ShieldCheck },
  { id: 'admin-overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'admin-users', label: 'Users', icon: Users },
  { id: 'admin-activity', label: 'System Activity', icon: Activity },
  { id: 'admin-plans', label: 'Lesson Plans', icon: FileText },
  { id: 'admin-assessments', label: 'Assessments & Quizzes', icon: ClipboardCheck },
  { id: 'admin-attendance', label: 'Attendance', icon: Clock3 },
  { id: 'admin-ai', label: 'AI Usage', icon: Sparkles },
  { id: 'admin-analytics', label: 'Analytics & Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

const roleNav = {
  Lecturer: ['dashboard', 'courses', 'plans', 'create-plan', 'calendar', 'assessments', 'paper-marking', 'resources', 'reports', 'assistant', 'settings', 'progress', 'notifications', 'profile', 'upload-course'],
  Teacher: ['dashboard', 'courses', 'plans', 'create-plan', 'calendar', 'assessments', 'paper-marking', 'resources', 'reports', 'assistant', 'settings', 'progress', 'notifications', 'profile', 'upload-course'],
  'School Teacher': ['dashboard', 'courses', 'plans', 'create-plan', 'calendar', 'assessments', 'paper-marking', 'resources', 'reports', 'assistant', 'settings', 'progress', 'notifications', 'profile', 'upload-course'],
  Student: ['dashboard', 'courses', 'calendar', 'assistant', 'resources', 'progress', 'notifications', 'settings', 'profile'],
  'Academic Coordinator': ['dashboard', 'courses', 'progress', 'calendar', 'assessments', 'reports', 'notifications', 'settings', 'profile'],
  Administrator: ['admin-overview', 'admin-users', 'admin-activity', 'admin-plans', 'admin-assessments', 'admin-attendance', 'admin-ai', 'admin-analytics', 'settings', 'profile'],
};

const emptyForm = {
  courseName: '',
  courseCode: '',
  programme: '',
  level: '',
  department: '',
  lecturer: '',
  semester: '',
  academicYear: '',
  topics: [],
  startDate: '',
  endDate: '',
  numberOfWeeks: '',
  lessonsPerWeek: '',
  lessonDuration: '',
  holidays: [],
  teachingMethods: [],
  learningActivities: [],
  difficulty: 'Intermediate',
  customInstructions: '',
  lessonNotes: '',
  sourceDocumentId: '',
  sourceDocumentIds: [],
  sourceFileName: '',
  courseId: '',
};

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

function UploadCoursePage({ onCreate, onUploaded }) {
  const [status, setStatus] = useState('idle');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [manual, setManual] = useState(false);
  const [detected, setDetected] = useState({ name: false, code: false, description: false, topics: false });
  const [fields, setFields] = useState({ name: '', code: '', description: '', topics: '' });
  const inputRef = useRef(null);
  const retryFiles = useRef([]);
  const supported = ['.pdf', '.doc', '.docx', '.txt'];
  async function analyze(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const unsupported = files.find((file) => !supported.includes(`.${file.name.split('.').pop().toLowerCase()}`));
    if (unsupported) { setError('That file type is not supported.'); setErrorDetail('Upload a PDF, DOC, DOCX, or TXT file.'); return; }
    setError('');
    setErrorDetail('');
    retryFiles.current = files;
    setFileName(files.map((file) => file.name).join(', '));
    setStatus('processing');
    try {
      let resource = null;
      for (const file of files) {
        resource = await resourceApi.upload(file);
        onUploaded?.(resource);
      }
      const next = {
        name: resource.courseName || '',
        code: resource.courseCode || '',
        description: resource.description || '',
        topics: (resource.topics || []).join('\n'),
      };
      setFields(next);
      setDetected({
        name: Boolean(resource.courseName),
        code: Boolean(resource.courseCode),
        description: Boolean(resource.description),
        topics: Boolean(resource.topics?.length),
      });
      setStatus('success');
      if (resource.extractionNote) {
        setError('Some pages could not be read.');
        setErrorDetail(resource.extractionNote);
      }
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not read this file.');
      setErrorDetail(err.detail || '');
    }
  }
  function submit(event) { event.preventDefault(); const topics = fields.topics.split(/\r?\n|,|;/).map((topic) => topic.trim()).filter(Boolean); onCreate(buildCourse({ ...fields, topics, fileName })); }
  return <section className="course-upload-page"><div className="account-heading"><div><span className="section-kicker">COURSE WORKSPACE</span><h1>Upload your course outline</h1><p>Let PlanWise turn your source document into a trackable teaching structure.</p></div></div>{status === 'processing' && <p className="pw-stage">Extracting text from {fileName}</p>}{status !== 'processing' && <><div className="upload-layout"><button className="panel-card upload-dropzone" onClick={() => inputRef.current?.click()}><UploadCloud size={34} /><strong>Drop your file here or browse</strong><span>PDF, DOC, DOCX, or TXT. Select more than one file if you need to.</span><input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.txt" multiple onChange={(event) => { analyze(event.target.files); event.target.value = ''; }} /></button><div className="panel-card manual-card"><div className="settings-title"><Pencil size={18} /><div><h3>Enter course manually</h3><span>For outlines you would rather type in</span></div></div><button className="secondary-button" onClick={() => setManual(true)}>Start manually</button></div></div>{error && <Notice tone={status === 'success' ? 'warning' : 'error'} message={error} detail={errorDetail} onRetry={status === 'error' && retryFiles.current.length ? () => analyze(retryFiles.current) : undefined} />}{(manual || status === 'success') && <form className="panel-card extracted-form" onSubmit={submit}><div className="panel-head"><div><span className="section-kicker">{status === 'success' ? 'REVIEW EXTRACTED INFORMATION' : 'MANUAL COURSE'}</span><h2>{status === 'success' ? 'File read. Review what was detected.' : 'Create your course'}</h2></div></div><div className="grid-2"><label className="field"><span>Course Name</span><input value={fields.name} onChange={(event) => setFields({ ...fields, name: event.target.value })} placeholder="Not detected" /></label>{status === 'success' && !detected.name && <small className="field-error">Not detected</small>}<label className="field"><span>Course Code</span><input value={fields.code} onChange={(event) => setFields({ ...fields, code: event.target.value })} placeholder="Not detected" /></label>{status === 'success' && !detected.code && <small className="field-error">Not detected</small>}<label className="field full-span"><span>Course Description</span><textarea rows={3} value={fields.description} onChange={(event) => setFields({ ...fields, description: event.target.value })} placeholder="Not detected" /></label>{status === 'success' && !detected.description && <small className="field-error">Not detected</small>}<label className="field full-span"><span>Topics, one per line</span><textarea rows={7} value={fields.topics} onChange={(event) => setFields({ ...fields, topics: event.target.value })} placeholder="Not detected" /></label>{status === 'success' && !detected.topics && <small className="field-error">Not detected</small>}</div><div className="footer-actions-row"><button type="submit" className="primary-button">Create Progress Tracker</button></div></form>}</>}{status === 'success' && <div className="success-toast"><CheckCircle2 size={16} /> The file was read and saved to Resources.</div>}</section>;
}

function CourseCard({ course, onOpen }) {
  const metrics = courseMetrics(course); const next = metrics.topics.find((topic) => topic.status !== 'completed');
  return <article className="course-card panel-card"><div className="course-card-top"><span className="course-code">{course.code || 'CODE NOT PROVIDED'}</span><BookOpen size={18} /></div><h3>{course.name || 'Course name not provided'}</h3><p>{course.description || 'No course description provided.'}</p><div className="course-card-meta"><span>{course.duration || 'Duration not provided'}</span><span>{metrics.total} topics</span></div><div className="course-progress-head"><span>Progress</span><strong>{metrics.percent}%</strong></div><div className="progress-bar"><span style={{ width: `${metrics.percent}%` }} /></div><small>{metrics.completed} / {metrics.total} topics completed</small><div className="course-next">Next: <strong>{next?.title || 'All topics complete'}</strong></div><button className="secondary-button" onClick={() => onOpen(course.id)}>Open Course <ArrowRight size={14} /></button></article>;
}

function CoursesPage({ courses, onOpen, onUpload }) {
  return <section className="account-page courses-page"><div className="account-heading"><div><span className="section-kicker">COURSE LIBRARY</span><h1>Your courses</h1><p>Each course is its own source of truth for teaching progress.</p></div><button className="primary-button" onClick={onUpload}><UploadCloud size={16} /> Upload Course</button></div>{courses.length ? <div className="courses-grid">{courses.map((course) => <CourseCard key={course.id} course={course} onOpen={onOpen} />)}</div> : <div className="panel-card empty-course"><div className="empty-course-icon"><BookOpen size={26} /></div><h2>No courses yet</h2><p>Upload your first course outline and let PlanWise AI organize your teaching journey.</p><button className="primary-button" onClick={onUpload}><UploadCloud size={16} /> Upload Course</button></div>}</section>;
}

function CourseDetailPage({ course, onBack, onStatusChange, resources = [] }) {
  if (!course) return <section className="account-page empty-course panel-card"><h2>Course not found</h2><p>This course is no longer available in your workspace.</p><button className="primary-button" onClick={onBack}>Back to Courses</button></section>;
  const metrics = courseMetrics(course); const [tab, setTab] = useState('Overview');
  return <section className="account-page course-detail-page"><button className="back-link" onClick={onBack}><ArrowRight size={15} className="back-arrow" /> Courses</button><div className="course-detail-heading"><div><span className="section-kicker">{course.code || 'COURSE'}</span><h1>{course.name || 'Course name not provided'}</h1><p>{course.description || 'Course description not provided.'}</p></div><div className="detail-progress"><strong>{metrics.percent}%</strong><span>Overall progress</span><div className="progress-bar"><span style={{ width: `${metrics.percent}%` }} /></div></div></div><div className="course-tabs">{['Overview', 'Topics', 'Lesson Plans', 'Assessments', 'Calendar', 'Progress', 'Resources'].map((item) => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>{tab === 'Progress' || tab === 'Topics' || tab === 'Overview' ? <div className="course-detail-grid"><div className="panel-card module-card"><div className="panel-head"><div><span className="section-kicker">COURSE STRUCTURE</span><h3>Modules and topics</h3></div><span className="course-count">{metrics.completed}/{metrics.total} complete</span></div>{course.modules.map((module) => <div className="module-block" key={module.id}><div className="module-heading"><strong>{module.title}</strong><span>{courseMetrics({ modules: [module] }).percent}%</span></div>{module.topics.map((topic) => { const StatusIcon = topicStatuses[topic.status].icon; return <div className="topic-status-row" key={topic.id}><button className={`status-control ${topic.status}`} onClick={() => onStatusChange(course.id, module.id, topic.id)} title="Cycle topic status"><StatusIcon size={18} /><span>{topic.title}</span></button><small>{topicStatuses[topic.status].label}</small></div>; })}</div>)}</div><div className="panel-card insight-card"><div className="settings-title"><Sparkles size={18} /><div><h3>Your Teaching Insights</h3><span>Based on this course's actual progress</span></div></div><p>{metrics.completed === metrics.total ? 'All tracked topics are complete. Your course structure is ready for final review.' : metrics.inProgress ? `You have completed ${metrics.completed} of ${metrics.total} planned topics. Continue the ${metrics.inProgress} topic${metrics.inProgress > 1 ? 's' : ''} in progress.` : `You have completed ${metrics.completed} of ${metrics.total} planned topics. Mark a topic in progress when teaching begins.`}</p><div className="insight-stat"><strong>{metrics.inProgress}</strong><span>in progress</span></div><div className="insight-stat"><strong>{metrics.total - metrics.completed - metrics.inProgress}</strong><span>not started</span></div></div></div> : tab === 'Resources' ? <div className="panel-card"><div className="panel-head"><h3>Subject materials</h3></div>{resources.filter((item) => course.name && item.courseName && item.courseName.toLowerCase() === course.name.toLowerCase()).length ? resources.filter((item) => item.courseName && item.courseName.toLowerCase() === course.name.toLowerCase()).map((item) => <p key={item.id}><strong>{item.fileName}</strong></p>) : <p className="muted-text">No files are saved for this subject yet. Upload a course outline and these materials can be reused in lesson plans and assessments.</p>}</div> : <div className="panel-card empty-tab"><h2>{tab}</h2><p>No {tab.toLowerCase()} have been created for this course yet.</p></div>}</section>;
}

function ProgressPage({ courses, onOpen, onStatusChange }) {
  const totals = courses.reduce((sum, course) => { const metrics = courseMetrics(course); return { total: sum.total + metrics.total, completed: sum.completed + metrics.completed, modules: sum.modules + course.modules.length, modulesCompleted: sum.modulesCompleted + metrics.modulesCompleted }; }, { total: 0, completed: 0, modules: 0, modulesCompleted: 0 });
  const percent = totals.total ? Math.round((totals.completed / totals.total) * 100) : 0;
  return <section className="account-page progress-page"><div className="account-heading"><div><span className="section-kicker">TEACHING OVERVIEW</span><h1>Course Progress</h1><p>A clear view of where your teaching stands across every course.</p></div></div>{courses.length ? <><div className="progress-summary-grid"><div className="panel-card progress-summary-main"><span className="section-kicker">OVERALL COURSE PROGRESS</span><strong>{percent}%</strong><div className="progress-bar"><span style={{ width: `${percent}%` }} /></div><p>{totals.completed} of {totals.total} topics completed</p></div><div className="panel-card progress-number"><strong>{totals.completed}/{totals.total}</strong><span>Topics Completed</span></div><div className="panel-card progress-number"><strong>{totals.modulesCompleted}/{totals.modules}</strong><span>Modules Completed</span></div></div><div className="progress-course-list">{courses.map((course) => <div className="panel-card progress-course-row" key={course.id}><div><span className="course-code">{course.code || 'CODE NOT PROVIDED'}</span><h3>{course.name || 'Course name not provided'}</h3></div><div className="progress-row-bar"><div className="progress-bar"><span style={{ width: `${courseMetrics(course).percent}%` }} /></div><strong>{courseMetrics(course).percent}%</strong></div><button className="pill-button" onClick={() => onOpen(course.id)}>View <ArrowRight size={13} /></button></div>)}</div></> : <div className="panel-card empty-course"><div className="empty-course-icon"><TrendingUp size={26} /></div><h2>No progress to show</h2><p>Upload a course outline to begin tracking your teaching journey.</p></div>}</section>;
}

const defaultUser = {
  id: '',
  name: '',
  email: '',
  role: '',
  institution: '',
  department: '',
  phone: '',
  avatar: '',
  memberSince: '',
};

function normalizeCourse(course) {
  if (!course) return course;
  return {
    ...course,
    assessments: course.assessments || course.meta?.assessments || [],
  };
}

function PlanWiseMark() {
  return (
    <svg className="pw-mark" viewBox="0 0 40 40" aria-hidden="true">
      <path fill="#d4b06a" d="M20 4.8 33.4 10.2 20 15.6 6.6 10.2 20 4.8Z" />
      <path fill="#d4b06a" d="M30.2 12.1v5.6c0 .55-.62.9-1.12.6L20 14.4l-9.08 3.9c-.5.3-1.12-.05-1.12-.6v-5.6L20 16.2l10.2-4.1Z" />
      <path fill="#1f4d3a" d="M6.5 17.4c4.4 2.1 8.6 2.1 13.5 0v15.4c-4.9 2.1-9.1 2.1-13.5 0V17.4Z" />
      <path fill="#2c6b54" d="M33.5 17.4c-4.4 2.1-8.6 2.1-13.5 0v15.4c4.9 2.1 9.1 2.1 13.5 0V17.4Z" />
      <path fill="#e7d3a1" d="M19.15 17.6h1.7v14.8h-1.7z" />
    </svg>
  );
}

function AuthShell({ children, mode = 'login', onNavigate }) {
  if (mode === 'login' || mode === 'register') {
    return (
      <div className={`pw-signup is-${mode}`}>
        <div className="pw-signup-shell">
        <aside className="pw-signup-visual">
          <div className="pw-signup-visual-top">
            <div className="pw-signup-brand pw-signup-brand-light">
              <PlanWiseMark />
              <span>PlanWise <em>AI</em></span>
            </div>
            <p>PLAN · TEACH · ASSESS · GROW</p>
          </div>
          <div className="pw-signup-visual-copy">
            <h1>
              <TypedText text="Welcome to" keepCaret={false} />
              <TypedText text="PlanWise AI" accent="AI" startDelay={"Welcome to".length * 46 + 180} />
            </h1>
            <p>Your intelligent teaching workspace.</p>
            <ul>
              <li><span><CalendarDays size={18} /></span>Plan Lessons</li>
              <li><span><ClipboardCheck size={18} /></span>Create Assessments</li>
              <li><span><CheckCircle2 size={18} /></span>Mark with Ease</li>
              <li><span><BarChart3 size={18} /></span>Track Progress</li>
            </ul>
          </div>
        </aside>
        <main className="pw-signup-panel">{children}</main>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <section className="auth-visual">
        <div className="auth-brand">
          <div className="brand-mark"><GraduationCap size={21} /></div>
          <strong>PlanWise AI</strong>
        </div>
        <div className="auth-visual-copy">
          <span className="section-kicker">PLAN · TEACH · EMPOWER</span>
          <h1>Plan smarter.<br /><em>Teach better.</em></h1>
          <p>Your intelligent teaching companion for planning lessons, managing courses and tracking academic progress.</p>
        </div>
        <div className="workspace-scene" aria-hidden="true">
          <div className="scene-glow" />
          <div className="scene-books"><BookOpen size={64} /></div>
          <div className="scene-laptop">
            <div className="scene-screen">
              <div className="scene-screen-top"><span /><span /><span /></div>
              <strong>Lesson plan</strong><i /><i /><i /><b>✓ Objectives ready</b>
            </div>
            <div className="scene-base" />
          </div>
          <div className="scene-calendar"><CalendarDays size={18} /><strong>Week 04</strong><span>Teaching rhythm</span></div>
        </div>
        <div className="auth-visual-footer">Built for the people who make learning happen.</div>
      </section>
      <main className="auth-panel">
        <div className="auth-panel-inner">{children}</div>
        <div className="auth-panel-footer">{mode === 'register' ? 'PlanWise AI educator workspace' : 'Secure workspace access'} <span>•</span> {new Date().getFullYear()}</div>
      </main>
    </div>
  );
}

function PasswordField({ label, value, onChange, placeholder = 'Enter your password', autoComplete }) {
  const [visible, setVisible] = useState(false);
  return <label className="auth-field"><span>{label}</span><div className="password-input"><LockKeyhole size={16} /><input type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>;
}

function LoginPage({ onLogin, onNavigate, notice = '' }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState(notice);
  const [loading, setLoading] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!identifier.trim()) { setError('Enter your username or email.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setLoading(true);
    try {
      const result = await authApi.login({ identifier: identifier.trim(), email: identifier.trim(), password });
      onLogin(result.user, remember, result.token);
    } catch (err) {
      const offline = !err.status && /network|failed to fetch|timeout|ECONNABORTED/i.test(err.message || '');
      setError(offline ? 'Could not reach PlanWise. Check your connection and try again.' : (err.message || 'Incorrect username or password.'));
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthShell mode="login" onNavigate={onNavigate}>
      <div className="pw-signup-card">
        <div className="pw-signup-brand">
          <PlanWiseMark />
          <span>PlanWise <em>AI</em></span>
        </div>
        <h2>Sign in</h2>
        <form className="auth-form pw-signup-form" onSubmit={submit}>
          <label className="auth-field"><span>Username or email</span><div className="auth-input"><UserRound size={16} /><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="username or you@example.com" autoComplete="username" /></div></label>
          <PasswordField label="Password" value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="current-password" />
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="auth-options pw-login-options"><label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember me</label><button type="button" onClick={() => onNavigate('forgot-password')}>Forgot Password?</button></div>
          <button className="pw-signup-submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>
        <p className="pw-signup-switch">Need an account? <button type="button" onClick={() => onNavigate('create-account')}>Sign Up</button></p>
      </div>
    </AuthShell>
  );
}

const ACCOUNT_NOTICES = new Set([
  'Please enter your full name.',
  'Please enter a valid email address.',
  'This email address is invalid.',
  'An account with this email already exists.',
  "We couldn't create your account. Please try again.",
  "We couldn't send your login email. Please try again later.",
  'Account created successfully! Please check your email for your login credentials.',
  'Your account is waiting for administrator approval.',
]);

function createAccountNotice(result, error) {
  if (result?.inboxVerified) return { tone: 'ok', text: 'Your login credentials have been sent to your email.' };
  if (result?.message) return { tone: 'ok', text: result.message };
  const message = String(error?.message || '');
  if (ACCOUNT_NOTICES.has(message)) return { tone: 'error', text: message };
  if (error?.status === 409) return { tone: 'error', text: 'An account with this email already exists.' };
  if (error?.status === 400 && /name/i.test(message)) return { tone: 'error', text: 'Please enter your full name.' };
  if (error?.status === 400 && /email/i.test(message)) return { tone: 'error', text: 'Please enter a valid email address.' };
  if (error?.status === 502 || error?.status === 503) return { tone: 'error', text: "We couldn't send your login email. Please try again later." };
  return { tone: 'error', text: "We couldn't create your account. Please try again." };
}

function CreateAccountPage({ onNavigate }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    const name = fullName.trim();
    const address = email.trim();
    if (!name) {
      setNotice({ tone: 'error', text: 'Please enter your full name.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setNotice({ tone: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    setNotice(null);
    setLoading(true);
    try {
      const result = await authApi.createTestAccount({ fullName: name, name, email: address });
      setNotice(createAccountNotice(result));
    } catch (err) {
      setNotice(createAccountNotice(null, err));
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthShell mode="login" onNavigate={onNavigate}>
      <div className="pw-signup-card">
        <div className="pw-signup-brand">
          <PlanWiseMark />
          <span>PlanWise <em>AI</em></span>
        </div>
        <h2>Create account</h2>
        <p className="pw-signup-lead">An administrator assigns your role before you can sign in.</p>
        <form className="auth-form pw-signup-form" onSubmit={submit}>
          <label className="auth-field"><span>Full name</span><div className="auth-input"><UserRound size={16} /><input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Enter your name" autoComplete="name" /></div></label>
          <label className="auth-field"><span>Email address</span><div className="auth-input"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" /></div></label>
          <button className="pw-signup-submit" disabled={loading}>{loading ? 'Creating account...' : 'Create Account'}</button>
        </form>
        <p className="pw-signup-switch">Already have an account? <button type="button" onClick={() => onNavigate('login')}>Sign In</button></p>
      </div>
      {notice && (
        <div className={`pw-auth-toast is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.tone === 'ok' ? <CheckCircle2 size={16} /> : null}
          <span>{notice.text}</span>
        </div>
      )}
    </AuthShell>
  );
}

function passwordChecks(password) { return { length: password.length >= 8, number: /\d/.test(password), upper: /[A-Z]/.test(password), lower: /[a-z]/.test(password) }; }

function passwordFeedback(password) {
  if (!password) return '';
  const missing = [];
  if (password.length < 8) missing.push('at least 8 characters');
  if (!/\d/.test(password)) missing.push('a number');
  if (!/[A-Z]/.test(password)) missing.push('an uppercase letter');
  if (!/[a-z]/.test(password)) missing.push('a lowercase letter');
  if (!missing.length) return 'Password looks good.';
  if (missing.length === 1) return `Still needs ${missing[0]}.`;
  if (missing.length === 2) return `Still needs ${missing[0]} and ${missing[1]}.`;
  return `Still needs ${missing.slice(0, -1).join(', ')}, and ${missing[missing.length - 1]}.`;
}

function InstitutionField({ label, placeholder, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef(null);
  useEffect(() => {
    function close(event) {
      if (!fieldRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="auth-field pw-institution" ref={fieldRef}>
      <span>{label}</span>
      <button type="button" className={`auth-input pw-select${open ? ' is-open' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <Building2 size={16} />
        <strong className={value ? '' : 'is-placeholder'}>{value || placeholder}</strong>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="pw-menu" role="listbox">
          {options.map((item) => (
            <button type="button" role="option" aria-selected={value === item} key={item} onClick={() => { onChange(item); setOpen(false); }}>{item}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function RegisterPage({ onRegister, onNavigate }) {
  const [fields, setFields] = useState({ name: '', email: '', password: '', confirm: '', role: 'Lecturer', institution: '', institutionOther: '', department: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const checks = passwordChecks(fields.password);
  const validPassword = Object.values(checks).every(Boolean);
  const passwordHint = passwordFeedback(fields.password);
  const isSchoolTeacher = fields.role === 'Teacher';
  const [institutions, setInstitutions] = useState([]);
  useEffect(() => {
    institutionApi.list({ role: isSchoolTeacher ? 'teacher' : 'lecturer' })
      .then((data) => setInstitutions(data.institutions || []))
      .catch((err) => setError(err.message || 'Could not load institutions.'));
  }, [isSchoolTeacher]);
  const institutionLabel = isSchoolTeacher ? 'School' : 'Institution';
  const departmentLabel = isSchoolTeacher ? 'Subject or Department' : 'Department';
  const departmentPlaceholder = isSchoolTeacher ? 'Enter your subject or department' : 'Enter your department';
  function update(field, value) { setFields((current) => ({ ...current, [field]: value })); }
  function selectRole(role) {
    setFields((current) => ({ ...current, role, institution: '' }));
  }
  async function submit(event) {
    event.preventDefault();
    setError('');
    const institution = fields.institution.trim();
    if (!fields.name.trim() || !fields.email.trim() || !fields.password || !fields.confirm || !fields.role || !institution || !fields.department.trim()) {
      const message = 'Please complete all required fields, including role and institution.';
      setError(message);
      window.alert(message);
      return;
    }
    if (!validPassword) {
      const message = 'Choose a stronger password that meets all requirements.';
      setError(message);
      window.alert(message);
      return;
    }
    if (fields.password !== fields.confirm) {
      const message = 'Passwords do not match.';
      setError(message);
      window.alert(message);
      return;
    }
    setLoading(true);
    try {
      const result = await authApi.register({
        fullName: fields.name.trim(),
        name: fields.name.trim(),
        email: fields.email.trim(),
        password: fields.password,
        role: fields.role,
        institution,
        department: fields.department.trim(),
      });
      onRegister({ ...result.user, welcomePending: true }, result.token);
    } catch (err) {
      const message = err.message || 'Unable to create your account.';
      const network = !err.status && /network|failed to fetch|timeout|ECONNABORTED/i.test(message);
      setError(network ? 'Could not reach PlanWise. Check your connection and try again.' : message);
      if (!network) window.alert(message);
      setLoading(false);
    }
  }
  return (
    <AuthShell mode="register" onNavigate={onNavigate}>
      <div className="pw-signup-card">
        <button type="button" className="pw-signup-brand" onClick={() => onNavigate('landing')}>
          <PlanWiseMark />
          <span>PlanWise <em>AI</em></span>
        </button>
        <h2>Create your educator account</h2>
        <form className="auth-form register-form pw-signup-form" autoComplete="off" onSubmit={submit}>
          <div className="pw-role-toggle" role="group" aria-label="What are you?">
            <button type="button" className={fields.role === 'Lecturer' ? 'is-active' : ''} aria-pressed={fields.role === 'Lecturer'} onClick={() => selectRole('Lecturer')}>Lecturer</button>
            <button type="button" className={isSchoolTeacher ? 'is-active' : ''} aria-pressed={isSchoolTeacher} onClick={() => selectRole('Teacher')}>Teacher</button>
          </div>
          <div className="pw-signup-grid">
            <label className="auth-field"><span>Full Name</span><div className="auth-input"><UserRound size={16} /><input value={fields.name} onChange={(event) => update('name', event.target.value)} placeholder="Enter your full name" autoComplete="off" name="planwise-full-name" /></div></label>
            <label className="auth-field"><span>Email Address</span><div className="auth-input"><Mail size={16} /><input type="email" value={fields.email} onChange={(event) => update('email', event.target.value)} placeholder="you@example.com" autoComplete="off" name="planwise-email" /></div></label>
            <PasswordField label="Password" value={fields.password} onChange={(value) => update('password', value)} placeholder="Create a password" autoComplete="off" />
            <PasswordField label="Confirm Password" value={fields.confirm} onChange={(value) => update('confirm', value)} placeholder="Confirm your password" autoComplete="off" />
          </div>
          {passwordHint && <p className={`password-hint ${validPassword ? 'valid' : ''}`}>{passwordHint}</p>}
          <div className="pw-signup-grid">
            <InstitutionField
              label={institutionLabel}
              placeholder={isSchoolTeacher ? 'Select your school' : 'Select your university'}
              options={institutions}
              value={fields.institution}
              onChange={(value) => update('institution', value)}
            />
            <label className="auth-field"><span>{departmentLabel}</span><div className="auth-input"><BookOpen size={16} /><input value={fields.department} onChange={(event) => update('department', event.target.value)} placeholder={departmentPlaceholder} autoComplete="off" name="planwise-department" /></div></label>
          </div>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="pw-signup-submit" disabled={loading}>{loading ? 'Creating account...' : <>Create Account <ArrowRight size={18} /></>}</button>
        </form>
        <p className="pw-signup-switch">Already have an account? <button type="button" onClick={() => onNavigate('login')}>Sign In</button></p>
      </div>
    </AuthShell>
  );
}

function ForgotPasswordPage({ onNavigate }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('Enter a valid email address.'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await authApi.forgotPassword(email.trim());
      setSent(result.message || 'If an account exists for that email, a temporary password was sent.');
    } catch (err) {
      setError(err.message || 'Unable to start password reset.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthShell mode="login" onNavigate={onNavigate}>
      <div className="pw-signup-card">
        <div className="pw-signup-brand">
          <PlanWiseMark />
          <span>PlanWise <em>AI</em></span>
        </div>
        {sent ? (
          <>
            <h2>Check your email</h2>
            <p className="pw-signup-lead">{typeof sent === 'string' ? sent : 'If an account exists for that email, a temporary password was sent.'}</p>
            <button className="pw-signup-submit" type="button" onClick={() => onNavigate('login')}>Back to Sign In</button>
          </>
        ) : (
          <>
            <h2>Forgot your password?</h2>
            <p className="pw-signup-lead">Enter your email address and we will help you reset your password.</p>
            <form className="auth-form pw-signup-form" onSubmit={submit}>
              <label className="auth-field"><span>Email Address</span><div className="auth-input"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@institution.edu" /></div></label>
              {error && <div className="auth-error" role="alert">{error}</div>}
              <button className="pw-signup-submit" disabled={loading}>{loading ? 'Sending...' : 'Send Reset Link'}</button>
            </form>
            <p className="pw-signup-switch"><button type="button" onClick={() => onNavigate('login')}>Back to Sign In</button></p>
          </>
        )}
      </div>
    </AuthShell>
  );
}

function Avatar({ user, large = false }) {
  const initials = user.name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'U';
  return user.avatar ? <img className={`user-avatar ${large ? 'large' : ''}`} src={user.avatar} alt={`${user.name} profile`} /> : <div className={`initial-avatar ${large ? 'large' : ''}`}>{initials}</div>;
}

function ResetPasswordPage({ onNavigate }) {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(token ? '' : 'This reset link is invalid.');
  const [loading, setLoading] = useState(false);
  const checks = passwordChecks(password);
  const validPassword = Object.values(checks).every(Boolean);
  async function submit(event) {
    event.preventDefault();
    if (!token) { setError('This reset link is invalid.'); return; }
    if (!validPassword) { setError('Choose a stronger password that meets all requirements.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    try {
      await authApi.resetPassword({ token, password });
      window.history.pushState({}, '', '/login');
      onNavigate('login');
    } catch (err) {
      setError(err.message || 'Could not reset the password.');
      setLoading(false);
    }
  }
  return (
    <AuthShell mode="login" onNavigate={onNavigate}>
      <div className="pw-signup-card">
        <h2>Set your password</h2>
        <p className="pw-signup-lead">This link works once and expires in one hour.</p>
        <form className="auth-form" onSubmit={submit}>
          <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
          <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          {password ? <p className={`password-hint ${validPassword ? 'valid' : ''}`}>{passwordFeedback(password)}</p> : null}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="pw-signup-submit" disabled={loading}>{loading ? 'Saving...' : 'Save Password'}</button>
        </form>
      </div>
    </AuthShell>
  );
}

const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters' },
  { key: 'upper', label: 'One uppercase letter' },
  { key: 'lower', label: 'One lowercase letter' },
  { key: 'number', label: 'One number' },
];

function ChangePasswordField({ label, value, onChange, placeholder, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field">
      <span>{label}</span>
      <div className="password-input">
        <input type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} />
        <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>
          {visible ? <Eye size={17} /> : <EyeOff size={17} />}
        </button>
      </div>
    </label>
  );
}

function ChangePasswordPage({ onChanged }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const checks = passwordChecks(password);
  const validPassword = Object.values(checks).every(Boolean);
  const nextRule = PASSWORD_RULES.find((rule) => !checks[rule.key]);
  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    if (!validPassword) return;
    if (!confirm || password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await authApi.changePassword({ password });
      onChanged(result.user);
    } catch (err) {
      const message = String(err.message || '');
      if (/8 characters|uppercase|lowercase|number/i.test(message)) setError('Please meet all password requirements.');
      else if (/different from the temporary/i.test(message)) setError('Choose a different password.');
      else setError('Unable to update password. Please try again.');
      setLoading(false);
    }
  }
  return (
    <section className="pw-password-card" role="dialog" aria-modal="true" aria-labelledby="pw-password-setup-title">
      <h2 id="pw-password-setup-title">Change Password</h2>
      <p className="pw-password-lead">Create a new password to continue.</p>
      <form className="auth-form" onSubmit={submit} aria-busy={loading}>
        <ChangePasswordField label="New Password" value={password} onChange={(value) => { setPassword(value); setError(''); }} placeholder="Enter new password" autoComplete="new-password" />
        {password && nextRule && (
          <p className="pw-password-rule is-missing" role="status" aria-live="polite">
            <X size={13} />
            <span>{nextRule.label}</span>
          </p>
        )}
        <ChangePasswordField label="Confirm New Password" value={confirm} onChange={(value) => { setConfirm(value); setError(''); }} placeholder="Confirm new password" autoComplete="new-password" />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="pw-signup-submit" disabled={loading}>{loading ? 'Updating...' : 'Update Password'}</button>
      </form>
    </section>
  );
}

function ProfilePage({ user, onSave, onNavigate, startEditing = false }) {
  const [universities, setUniversities] = useState([]);
  const [schools, setSchools] = useState([]);
  useEffect(() => {
    institutionApi.list()
      .then((data) => {
        setUniversities(data.universities || []);
        setSchools(data.schools || []);
      })
      .catch(() => {});
  }, []);
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
      <div className="account-form-grid"><label className="field"><span>Full Name</span><input value={draft.name} onChange={(event) => update('name', event.target.value)} /></label><label className="field"><span>Email</span><input type="email" value={draft.email} onChange={(event) => update('email', event.target.value)} /></label><label className="field"><span>Phone Number</span><input value={draft.phone} placeholder="Not provided" onChange={(event) => update('phone', event.target.value)} /></label><InstitutionField label="Institution" placeholder={draft.role === 'Teacher' ? 'Select your school' : 'Select your university'} options={draft.role === 'Teacher' ? schools : universities} value={draft.institution} onChange={(value) => update('institution', value)} /><label className="field"><span>Department</span><input value={draft.department} placeholder="Not provided" onChange={(event) => update('department', event.target.value)} /></label><label className="field"><span>Role</span><select value={draft.role === 'School Teacher' ? 'Teacher' : draft.role} onChange={(event) => { update('role', event.target.value); update('institution', ''); }}>{EDUCATOR_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label></div>
      {error && <Notice message={error} />}<div className="footer-actions-row"><button type="button" className="secondary-button" onClick={() => { setDraft(user); setEditing(false); }}>Cancel</button><button type="submit" className="primary-button"><Save size={16} /> Save Changes</button></div>
    </form> : <div className="profile-layout"><div className="panel-card identity-card"><Avatar user={user} large /><h2>{user.name}</h2><p>{user.role}</p><span className="account-status"><ShieldCheck size={14} /> Active</span></div><div className="panel-card details-card"><div className="panel-head"><h3>Personal information</h3><button className="pill-button" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</button></div><div className="detail-grid">{[['Email', user.email, Mail], ['Role', user.role, UserRound], ['Institution', user.institution, ShieldCheck], ['Department', user.department, ShieldCheck], ['Phone number', user.phone, Phone], ['Member since', user.memberSince, ShieldCheck]].map(([label, value, Icon]) => <div className="detail-item" key={label}><Icon size={16} /><span><small>{label}</small><strong>{value || 'Not provided'}</strong></span></div>)}</div></div></div>}
  </section>;
}

function SettingsPage({ user, onNavigate, onLogout, darkMode, setDarkMode }) {
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    lessonPlanNotifications: true,
    assessmentNotifications: true,
    calendarNotifications: true,
    systemNotifications: true,
  });
  const [settingsError, setSettingsError] = useState('');
  useEffect(() => {
    settingsApi.notifications()
      .then((saved) => setPreferences((current) => ({ ...current, ...saved })))
      .catch((err) => setSettingsError(err.message || 'Could not load notification settings.'));
  }, []);
  async function toggle(key) {
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    try {
      const saved = await settingsApi.updateNotifications(next);
      setPreferences((current) => ({ ...current, ...saved }));
      setSettingsError('');
    } catch (err) {
      setPreferences(preferences);
      setSettingsError(err.message || 'Could not save notification settings.');
    }
  }
  return (
    <section className="account-page settings-page">
      <div className="account-heading">
        <div>
          <span className="section-kicker">ACCOUNT SETTINGS</span>
          <h1>Settings</h1>
          <p>Manage your workspace preferences and account.</p>
        </div>
      </div>
      <div className="settings-layout settings-layout-with-photo">
        <div className="settings-main">
          <div className="panel-card settings-card">
            <div className="settings-title"><UserRound size={18} /><div><h3>Account</h3><span>Personal information and access</span></div></div>
            <button className="settings-row" onClick={() => onNavigate('profile')}><span>Personal information<small>{user.email}</small></span><Pencil size={15} /></button>
            <button className="settings-row" onClick={() => onNavigate('profile')}><span>Profile<small>{user.role} · {user.department || 'Department not provided'}</small></span><Pencil size={15} /></button>
            <button className="logout-link" onClick={onLogout}><LogOut size={15} /> Log out</button>
          </div>
          <div className="panel-card settings-card settings-theme-card">
            <div className="theme-mode-row" role="group" aria-label="Color theme">
              <button type="button" className={`theme-mode-btn ${!darkMode ? 'active' : ''}`} onClick={() => setDarkMode(false)}>
                <Sun size={16} /> Light
              </button>
              <button type="button" className={`theme-mode-btn ${darkMode ? 'active' : ''}`} onClick={() => setDarkMode(true)}>
                <MoonStar size={16} /> Dark
              </button>
            </div>
          </div>
          <div className="panel-card settings-card">
            <div className="settings-title"><Bell size={18} /><div><h3>Notifications</h3><span>Choose what reaches your inbox</span></div></div>
            {settingsError ? <Notice message={settingsError} /> : null}
            {[['emailNotifications', 'Email notifications'], ['lessonPlanNotifications', 'Lesson plan notifications'], ['assessmentNotifications', 'Assessment notifications'], ['calendarNotifications', 'Calendar notifications'], ['systemNotifications', 'System notifications']].map(([key, label]) => (
              <label className="toggle-row" key={key}><span>{label}</span><input type="checkbox" checked={preferences[key]} onChange={() => toggle(key)} /><i /></label>
            ))}
          </div>
        </div>
        <aside className="settings-photo-panel" aria-hidden="true">
          <img src="/dashboard/settings-photo.jpg" alt="" />
        </aside>
      </div>
    </section>
  );
}

function AccountsPage() {
  const [users, setUsers] = useState([]);
  const [institutions, setInstitutions] = useState({ universities: [], schools: [] });
  const [form, setForm] = useState({ name: '', email: '', role: 'Lecturer', institution: '', department: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(null);
  const isTeacher = form.role === 'Teacher';

  async function refresh() {
    const rows = await adminApi.list();
    setUsers(rows);
  }

  useEffect(() => {
    Promise.all([
      adminApi.list(),
      institutionApi.list(),
    ]).then(([rows, places]) => {
      setUsers(rows);
      setInstitutions({ universities: places.universities || [], schools: places.schools || [] });
    }).catch((err) => setError(err.message || 'Could not load accounts.'))
      .finally(() => setLoading(false));
  }, []);

  async function createAccount(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!form.name.trim() || !form.email.trim() || (form.role !== 'Administrator' && (!form.institution || !form.department.trim()))) {
      setError('Name, email, role, and institution are required.');
      return;
    }
    try {
      const result = await adminApi.create({
        fullName: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        institution: form.institution,
        department: form.department.trim(),
      });
      setUsers((current) => [result.user, ...current.filter((item) => item.id !== result.user.id)]);
      setForm({ name: '', email: '', role: 'Lecturer', institution: '', department: '' });
      setNotice('Account created. Approve it to get a temporary password.');
    } catch (err) {
      setError(err.message || 'Could not create the account.');
    }
  }

  async function run(action, id) {
    setError('');
    setNotice('');
    setTempPassword('');
    try {
      const result = await action(id);
      setUsers((current) => current.map((item) => item.id === result.user.id ? result.user : item));
      setNotice(result.message || 'Updated.');
      setTempPassword(result.temporaryPassword || '');
    } catch (err) {
      setError(err.message || 'Could not update the account.');
    }
  }

  return (
    <section className="account-page">
      <div className="account-heading">
        <div>
          <span className="section-kicker">ADMINISTRATION</span>
          <h1>Accounts</h1>
          <p>Create educator accounts, then approve them before they can log in.</p>
        </div>
      </div>
      {error ? <Notice message={error} /> : null}
      {notice && <div className="auth-error" role="status">{notice}</div>}
      {tempPassword && (
        <div className="auth-note" role="status">
          Temporary password: <strong>{tempPassword}</strong> — share it with the user; they must change it on first sign-in.
        </div>
      )}
      <form className="panel-card account-form-grid" onSubmit={createAccount}>
        <label className="field"><span>Full name</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="field"><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
        <label className="field"><span>Role</span>
          <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value, institution: '' }))}>
            <option>Lecturer</option>
            <option>Teacher</option>
            <option>Administrator</option>
          </select>
        </label>
        {form.role === 'Administrator' ? <label className="field"><span>Institution</span><input value="Not required" disabled /></label> : (
          <InstitutionField
            label={isTeacher ? 'School' : 'Institution'}
            placeholder={isTeacher ? 'Select a school' : 'Select a university'}
            options={isTeacher ? institutions.schools : institutions.universities}
            value={form.institution}
            onChange={(value) => setForm((current) => ({ ...current, institution: value }))}
          />
        )}
        <label className="field"><span>Department</span><input value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} /></label>
        <button className="pw-signup-submit" type="submit">Create account</button>
      </form>
      <div className="panel-card accounts-table">
        {loading ? <p>Loading accounts...</p> : users.length === 0 ? <p>No accounts yet.</p> : (
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td data-label="Name">{user.fullName || user.name}</td>
                  <td data-label="Email">{user.email}</td>
                  <td data-label="Role">{user.role}</td>
                  <td data-label="Status">{user.accountStatus}</td>
                  <td data-label="Actions" className="account-actions">
                    {user.accountStatus !== 'approved' && user.role !== 'Administrator' && <button type="button" onClick={() => setAssigning(user)}>Approve and Assign Role</button>}
                    {user.accountStatus !== 'approved' && user.role === 'Administrator' && <button type="button" onClick={() => run(adminApi.approve, user.id)}>Approve</button>}
                    {user.accountStatus === 'pending' && <button type="button" onClick={() => run(adminApi.reject, user.id)}>Reject</button>}
                    {user.accountStatus === 'approved' && user.role !== 'Administrator' && <button type="button" onClick={() => run(adminApi.suspend, user.id)}>Suspend</button>}
                    {user.accountStatus === 'approved' && user.role !== 'Administrator' && <button type="button" onClick={() => run(adminApi.deactivate, user.id)}>Deactivate</button>}
                    {(user.accountStatus === 'suspended' || user.accountStatus === 'inactive') && <button type="button" onClick={() => run(adminApi.restore, user.id)}>Restore</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <AssignRoleDialog user={assigning} onClose={() => setAssigning(null)} onApproved={() => { setAssigning(null); setNotice('Role assigned and login email queued.'); refresh().catch((err) => setError(err.message || 'Could not load accounts.')); }} />
    </section>
  );
}

function homeSection(user) {
  return user?.role === 'Administrator' ? 'admin-overview' : 'dashboard';
}

function awaitingRoleConfirmation(user) {
  return Boolean(user) && user.roleConfirmed === false && (user.role === 'Teacher' || user.role === 'Lecturer');
}

function App() {
  const [activeSection, setActiveSection] = useState(() => {
    const path = window.location.pathname;
    if (path === '/profile') return 'profile';
    if (path === '/settings') return 'settings';
    if (path === '/accounts') return 'accounts';
    if (path === '/courses') return 'courses';
    if (path === '/courses/upload') return 'upload-course';
    if (path === '/progress') return 'progress';
    if (path.startsWith('/courses/')) return 'course-detail';
    return 'dashboard';
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getToken()));
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [roleSnoozed, setRoleSnoozed] = useState(false);
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false);
  const [roleConfirmError, setRoleConfirmError] = useState('');
  const [roleConfirming, setRoleConfirming] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(() => !getToken());
  const [passwordToast, setPasswordToast] = useState(false);
  const [loginNotice, setLoginNotice] = useState('');
  const [currentUser, setCurrentUser] = useState(() => defaultUser);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(() => window.location.pathname.match(/^\/courses\/([^/]+)/)?.[1] || '');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('planwiseDarkMode') === 'true');
  const [uiZoom, setUiZoom] = useState(() => {
    const saved = Number(localStorage.getItem('planwiseZoom'));
    return Number.isFinite(saved) && saved >= 0.8 && saved <= 1.3 ? saved : 1;
  });
  const [aiMaterial, setAiMaterial] = useState(null);
  const [aiArtifact, setAiArtifact] = useState(null);
  const [aiDifficulty, setAiDifficulty] = useState('Intermediate');
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [topics, setTopics] = useState(['']);
  const [errors, setErrors] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [selectedLessonIndex, setSelectedLessonIndex] = useState(0);
  const [savedPlans, setSavedPlans] = useState([]);
  const [openWeeks, setOpenWeeks] = useState({ 1: true });
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminCollapsed, setAdminCollapsed] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiQuickPrompt, setAiQuickPrompt] = useState('');
  const [markingHistory, setMarkingHistory] = useState([]);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [activeClock, setActiveClock] = useState(null);
  const [report, setReport] = useState(null);
  const [resources, setResources] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [planQuery, setPlanQuery] = useState('');
  const [resourceQuery, setResourceQuery] = useState('');
  const [resourceType, setResourceType] = useState('all');
  const profileMenuRef = useRef(null);
  const lessonRetryFiles = useRef([]);
  useEffect(() => {
    localStorage.setItem('planwiseDarkMode', String(darkMode));
    const enabled = Boolean(isAuthenticated && darkMode);
    document.documentElement.classList.toggle('dark-mode', enabled);
    document.body.classList.toggle('dark-mode', enabled);
  }, [darkMode, isAuthenticated]);
  useEffect(() => {
    localStorage.setItem('planwiseZoom', String(uiZoom));
  }, [uiZoom]);
  useEffect(() => {
    if (!passwordToast) return undefined;
    const timer = window.setTimeout(() => setPasswordToast(false), 5000);
    return () => window.clearTimeout(timer);
  }, [passwordToast]);

  async function loadWorkspace() {
    if (!getToken()) return;
    setDataLoading(true);
    setDataError('');
    try {
      const user = await authApi.me();
      setCurrentUser(user);
      setIsAuthenticated(true);
      if (user.mustChangePassword) {
        setMustChangePassword(true);
        setActiveSection('dashboard');
        if (window.location.pathname !== '/') window.history.replaceState({}, '', '/');
        return;
      }
      setMustChangePassword(false);
      if (awaitingRoleConfirmation(user)) {
        const notes = await notificationApi.list();
        setNotifications(notes.notifications || []);
        setUnreadCount(notes.unread || 0);
        return;
      }
      if (user.role === 'Administrator' && (window.location.pathname === '/' || window.location.pathname === '/login')) {
        setActiveSection('admin-overview');
      }
      const [plans, events, assessmentList, courseList, attendance, reportData, resourceList, quizList, papers, notes] = await Promise.all([
        lessonPlanApi.list(),
        calendarApi.list(),
        assessmentApi.list(),
        courseApi.list(),
        attendanceApi.get(),
        reportApi.get(),
        resourceApi.list(),
        quizApi.list(),
        markingApi.list(),
        notificationApi.list(),
      ]);
      setSavedPlans(plans);
      setCalendarEvents(events);
      setAssessments(assessmentList);
      setCourses(courseList.map(normalizeCourse));
      setActiveClock(attendance.active || null);
      setAttendanceHistory(attendance.history || []);
      setReport(reportData);
      setResources(resourceList);
      setQuizzes(quizList);
      setMarkingHistory(papers);
      setNotifications(notes.notifications || []);
      setUnreadCount(notes.unread || 0);
      setIsAuthenticated(true);
    } catch (err) {
      const message = err.message || '';
      const blockedAccount = err.status === 403 && /waiting for administrator|not approved|suspended|inactive/i.test(message);
      if (err.status === 401 || blockedAccount) {
        clearSession();
        setIsAuthenticated(false);
        setMustChangePassword(false);
        setLoginNotice(err.status === 403 ? err.message : '');
        setActiveSection('login');
        window.history.replaceState({}, '', '/login');
      } else {
        setDataError(err.message || 'Unable to load your workspace.');
      }
    } finally {
      setDataLoading(false);
      setSessionChecked(true);
    }
  }

  async function confirmAssignedRole() {
    if (roleConfirming) return;
    setRoleConfirming(true);
    setRoleConfirmError('');
    try {
      const result = await authApi.confirmRole();
      setCurrentUser(result.user);
      setRoleConfirmOpen(false);
      setRoleSnoozed(false);
      await loadWorkspace();
    } catch (err) {
      setRoleConfirmError(err.message || 'Unable to confirm your role. Please try again.');
    } finally {
      setRoleConfirming(false);
    }
  }

  useEffect(() => {
    if (getToken()) loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mustChangePassword || awaitingRoleConfirmation(currentUser)) {
      setSearchResults(null);
      return undefined;
    }
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      searchApi.query(query).then(setSearchResults).catch((err) => setDataError(err.message || 'Search failed.'));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, mustChangePassword, currentUser]);

  function adjustZoom(delta) {
    setUiZoom((current) => {
      const next = Math.round((current + delta) * 100) / 100;
      return Math.min(1.3, Math.max(0.8, next));
    });
  }

  function resetZoom() {
    setUiZoom(1);
  }
  useEffect(() => {
    function closeProfile(event) { if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) setProfileOpen(false); }
    function closeOnEscape(event) { if (event.key === 'Escape') { setProfileOpen(false); setLogoutOpen(false); setSidebarOpen(false); } }
    function onPopState() {
      if (mustChangePassword) {
        setActiveSection('dashboard');
        if (window.location.pathname !== '/') window.history.replaceState({}, '', '/');
        return;
      }
      const path = window.location.pathname;
      if (path === '/forgot-password') setActiveSection('forgot-password');
      else if (path === '/create-account' || path === '/register') setActiveSection(isAuthenticated ? homeSection(currentUser) : 'create-account');
      else if (path === '/login') setActiveSection(isAuthenticated ? homeSection(currentUser) : 'login');
      else if (path === '/') setActiveSection(isAuthenticated ? homeSection(currentUser) : 'landing');
    }
    document.addEventListener('mousedown', closeProfile); document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('mousedown', closeProfile);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('popstate', onPopState);
    };
  }, [isAuthenticated, currentUser, mustChangePassword]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [sidebarOpen]);

  const currentStepLabel = useMemo(() => {
    const labels = ['Course', 'Topics', 'Schedule', 'Preferences', 'Generate'];
    return labels[step - 1] || 'Generate';
  }, [step]);

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function attachLessonSource(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const rejected = files.find((file) => !/\.(pdf|docx?|txt)$/i.test(file.name) || file.size > 15 * 1024 * 1024);
    if (rejected && !/\.(pdf|docx?|txt)$/i.test(rejected.name)) {
      lessonRetryFiles.current = [];
      setErrors({ source: 'That file type is not supported.', sourceDetail: 'Upload a PDF, DOC, DOCX, or TXT file.' });
      return;
    }
    if (rejected) {
      lessonRetryFiles.current = [];
      setErrors({ source: `${rejected.name} is too large.`, sourceDetail: 'The limit is 15 MB.' });
      return;
    }
    setErrors({});
    const added = [];
    const failures = [];
    const failedFiles = [];
    for (const file of files) {
      try {
        const resource = await resourceApi.upload(file, {
          courseName: form.courseName,
          courseCode: form.courseCode,
        });
        added.push(resource);
      } catch (error) {
        failedFiles.push(file);
        failures.push({
          name: file.name,
          message: error.message || `Could not read ${file.name}.`,
          detail: error.detail || '',
        });
      }
    }
    if (added.length) {
      setResources((current) => [...added, ...current.filter((item) => !added.some((resource) => resource.id === item.id))]);
      setForm((previous) => {
        const ids = [...new Set([...(previous.sourceDocumentIds || []), ...added.map((resource) => resource.id)])];
        const names = added.map((resource) => resource.fileName).filter(Boolean);
        const first = added[0];
        return {
          ...previous,
          sourceDocumentIds: ids,
          sourceDocumentId: ids[0] || '',
          sourceFileName: [...new Set([...(previous.sourceFileName ? previous.sourceFileName.split(', ') : []), ...names])].join(', '),
          courseName: previous.courseName || first.courseName || '',
          courseCode: previous.courseCode || first.courseCode || '',
        };
      });
      const withTopics = added.find((resource) => Array.isArray(resource.topics) && resource.topics.length);
      if (withTopics) setTopics((current) => (current.filter(Boolean).length ? current : withTopics.topics));
    }
    lessonRetryFiles.current = failedFiles;
    if (failures.length) {
      setErrors({
        source: failures.length === 1 ? failures[0].message : `Could not read ${failures.length} files.`,
        sourceDetail: failures.map((item) => item.detail || item.message).filter(Boolean).join(' '),
      });
    } else {
      const notes = added.map((resource) => resource.extractionNote).filter(Boolean);
      if (notes.length) {
        setErrors({
          source: 'Some pages could not be read.',
          sourceDetail: notes.join(' '),
          sourceTone: 'warning',
        });
      }
    }
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
      lessonNotes: form.lessonNotes,
      materialText: form.lessonNotes,
      documentId: form.sourceDocumentId || undefined,
      documentIds: form.sourceDocumentIds || [],
    };
    if (!payload.topics.length && !String(form.lessonNotes || '').trim() && !(form.sourceDocumentIds || []).length && !form.sourceDocumentId) {
      setErrors({ general: 'Add topics, lesson notes, or an uploaded file before generating.' });
      setStep(2);
      return;
    }

    setIsGenerating(true);
    setErrors({});
    setActiveSection('plans');

    try {
      const plan = await lessonPlanApi.generate(payload);
      setGenerated(plan);
      setSavedPlans((previous) => [plan, ...previous.filter((item) => item.id !== plan.id)]);
      setSelectedLessonIndex(0);
      setStep(5);
    } catch (error) {
      setErrors({ general: error.message || 'Unable to generate the lesson plan. Please try again.' });
    } finally {
      setIsGenerating(false);
    }
  }

  async function regenerateLesson(lesson, instruction) {
    const regenerated = await lessonPlanApi.regenerate({ lesson, instruction });
    const nextLesson = regenerated.lesson || regenerated;
    setGenerated((previous) => ({
      ...previous,
      lessons: (previous?.lessons || []).map((item) => item.lessonDate === lesson.lessonDate && item.topic === lesson.topic ? nextLesson : item),
    }));
  }

  async function savePlan(status = 'Saved') {
    if (!generated) return;
    try {
      const plan = generated.id
        ? await lessonPlanApi.update(generated.id, { ...generated, status })
        : await lessonPlanApi.create({ ...generated, status, aiGenerated: true });
      setSavedPlans((previous) => {
        const exists = previous.some((item) => item.id === plan.id);
        return exists ? previous.map((item) => item.id === plan.id ? plan : item) : [plan, ...previous];
      });
      setGenerated(plan);
      const alreadyScheduled = calendarEvents.some((event) => event.lessonPlanId === plan.id && event.source === 'lesson-plan');
      if (!alreadyScheduled) {
        const suggestions = suggestCalendarFromPlan(plan, form);
        const created = [];
        for (const suggestion of suggestions) {
          created.push(await calendarApi.create({ ...suggestion, source: 'lesson-plan', lessonPlanId: plan.id, status: 'suggested' }));
        }
        if (created.length) setCalendarEvents((current) => [...created, ...current]);
      }
    } catch (error) {
      setErrors({ general: error.message || 'Unable to save the lesson plan.' });
    }
  }

  function exportPlan(format) {
    if (!generated) return;
    if (format === 'pdf' || format === 'docx') {
      alert(`${format.toUpperCase()} export is ready for download in a real implementation. This demo generates the plan in-app.`);
      return;
    }
    window.print();
  }

  async function saveAssessment(next) {
    try {
      if (next.recordKind === 'quiz') {
        const saved = await quizApi.update(next.id, {
          title: next.title,
          difficulty: next.difficulty,
          questions: (next.questions || []).map((question) => ({
            question: question.prompt || question.question,
            questionType: question.type || question.questionType,
            marks: question.marks,
            correctAnswer: question.answer || question.correctAnswer,
            options: question.options || [],
          })),
        });
        setQuizzes((current) => current.map((item) => item.id === saved.id ? saved : item));
        return;
      }
      const saved = next.id && assessments.some((item) => item.id === next.id)
        ? await assessmentApi.update(next.id, next)
        : await assessmentApi.create(next);
      setAssessments((current) => {
        const exists = current.some((item) => item.id === saved.id);
        return exists ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current];
      });
    } catch (error) {
      setErrors({ general: error.message || 'Unable to save assessment.' });
    }
  }

  async function handleCalendarChange(updater) {
    const previous = calendarEvents;
    const next = typeof updater === 'function' ? updater(previous) : updater;
    setCalendarEvents(next);
    try {
      const prevIds = new Set(previous.map((item) => item.id));
      const nextIds = new Set(next.map((item) => item.id));
      for (const event of next) {
        if (!event.id || String(event.id).startsWith('evt-') || !prevIds.has(event.id)) {
          const created = await calendarApi.create(event);
          setCalendarEvents((current) => current.map((item) => item === event || item.id === event.id ? created : item));
        } else {
          const before = previous.find((item) => item.id === event.id);
          if (before && JSON.stringify(before) !== JSON.stringify(event)) {
            await calendarApi.update(event.id, event);
          }
        }
      }
      for (const event of previous) {
        if (event.id && !nextIds.has(event.id)) {
          await calendarApi.remove(event.id);
        }
      }
    } catch (error) {
      setDataError(error.message || 'Unable to sync calendar.');
      setCalendarEvents(previous);
    }
  }

  async function persistCalendarSuggestions(incoming, source) {
    const items = Array.isArray(incoming) ? incoming : [];
    if (!items.length) return;
    try {
      const created = [];
      for (const item of items) {
        created.push(await calendarApi.create({ ...item, source, status: item.status || 'suggested' }));
      }
      setCalendarEvents((current) => [...created, ...current]);
    } catch (error) {
      setDataError(error.message || 'Unable to save the suggested date.');
    }
  }

  function navigateTo(section, options = {}) {
    setSidebarOpen(false);
    if (mustChangePassword) return;
    if (section === 'dashboard') setRoleSnoozed(false);
    if (section === 'assistant') {
      setAiDrawerOpen(true);
      setProfileOpen(false);
      return;
    }
    if (section === 'create-plan') {
      setForm(emptyForm);
      setTopics(['']);
      setGenerated(null);
      setErrors({});
      setStep(1);
      setActiveSection('plans');
      setProfileOpen(false);
      window.history.pushState({}, '', '/');
      return;
    }
    setActiveSection(section);
    if (section === 'profile') setProfileEditing(Boolean(options.editing));
    setProfileOpen(false);
    const paths = { profile: '/profile', settings: '/settings', courses: '/courses', 'upload-course': '/courses/upload', progress: '/progress', 'forgot-password': '/forgot-password', login: '/login', landing: '/', accounts: '/accounts', 'create-account': '/create-account' };
    window.history.pushState({}, '', paths[section] || '/');
  }

  function askAiFromDashboard(prompt) {
    if (prompt) setAiQuickPrompt(String(prompt));
    setAiDrawerOpen(true);
  }

  function startSession(user, _remember = true, token) {
    if (token) setToken(token, _remember);
    const safeUser = { ...user };
    delete safeUser.welcomePending;
    const needsPassword = Boolean(safeUser.mustChangePassword);
    setCurrentUser(safeUser);
    setIsAuthenticated(true);
    setSessionChecked(true);
    setMustChangePassword(needsPassword);
    setRoleSnoozed(false);
    setRoleConfirmOpen(false);
    setActiveSection(needsPassword ? 'dashboard' : homeSection(safeUser));
    setProfileOpen(false);
    if (needsPassword) {
      if (window.location.pathname !== '/') window.history.replaceState({}, '', '/');
    } else {
      const section = homeSection(safeUser);
      const paths = { accounts: '/accounts', dashboard: '/', 'admin-overview': '/' };
      window.history.pushState({}, '', paths[section] || '/');
    }
    loadWorkspace();
  }

  async function clockIn() {
    try {
      const result = await attendanceApi.clockIn();
      setActiveClock(result.active || null);
      const attendance = await attendanceApi.get();
      setAttendanceHistory(attendance.history || []);
      setReport(await reportApi.get());
      setDataError('');
    } catch (error) {
      setDataError(error.message || 'Could not clock in.');
    }
  }

  async function clockOut() {
    try {
      await attendanceApi.clockOut();
      setActiveClock(null);
      const attendance = await attendanceApi.get();
      setAttendanceHistory(attendance.history || []);
      setReport(await reportApi.get());
      setDataError('');
    } catch (error) {
      setDataError(error.message || 'Could not clock out.');
    }
  }

  async function generateCheckedWork(payload) {
    const saved = payload.kind === 'quiz'
      ? await quizApi.generate(payload)
      : await assessmentApi.generate(payload);
    if (payload.kind === 'quiz') setQuizzes((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    else setAssessments((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setReport(await reportApi.get());
    const notes = await notificationApi.list();
    setNotifications(notes.notifications || []);
    setUnreadCount(notes.unread || 0);
    return saved;
  }

  async function saveUser(nextUser) {
    try {
      const saved = await authApi.updateMe(nextUser);
      setCurrentUser(saved);
      setErrors({ general: 'Profile updated successfully.' });
      setTimeout(() => setErrors({}), 2600);
    } catch (error) {
      setErrors({ general: error.message || 'Unable to update profile.' });
    }
  }

  function confirmLogout() {
    setLogoutOpen(false);
    setProfileOpen(false);
    setIsAuthenticated(false);
    clearSession();
    setCourses([]);
    setCalendarEvents([]);
    setAssessments([]);
    setSavedPlans([]);
    setCurrentUser(defaultUser);
    setMustChangePassword(false);
    setSessionChecked(true);
    window.history.pushState({}, '', '/login');
    setActiveSection('login');
  }

  function navigateCourse(courseId) { setSelectedCourseId(courseId); setActiveSection('course-detail'); setProfileOpen(false); window.history.pushState({}, '', `/courses/${courseId}`); }
  async function createCourse(course) {
    try {
      const saved = await courseApi.create(course);
      const normalized = normalizeCourse(saved);
      setCourses((current) => [normalized, ...current]);
      setSelectedCourseId(normalized.id);
      setActiveSection('course-detail');
      setProfileOpen(false);
      window.history.pushState({}, '', `/courses/${normalized.id}`);
    } catch (error) {
      setErrors({ general: error.message || 'Unable to save course.' });
    }
  }
  async function updateTopicStatus(courseId, moduleId, topicId) {
    const nextCourses = courses.map((course) => course.id !== courseId ? course : {
      ...course,
      modules: course.modules.map((module) => module.id !== moduleId ? module : {
        ...module,
        topics: module.topics.map((topic) => topic.id !== topicId ? topic : {
          ...topic,
          status: topic.status === 'not_started' ? 'in_progress' : topic.status === 'in_progress' ? 'completed' : 'not_started',
        }),
      }),
    });
    setCourses(nextCourses);
    const updated = nextCourses.find((course) => course.id === courseId);
    if (updated) {
      try {
        await courseApi.update(courseId, updated);
      } catch (error) {
        setDataError(error.message || 'Unable to update course progress.');
      }
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  const currentDate = new Date();
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

  const floatingAssistant = (
    <FloatingAssistant
      isAuthenticated={isAuthenticated}
      user={currentUser}
      activeSection={isAuthenticated ? activeSection : (window.location.pathname === '/forgot-password' ? 'forgot-password' : 'login')}
      onNavigate={navigateTo}
      open={isAuthenticated ? aiDrawerOpen : undefined}
      onOpenChange={(value) => {
        setAiDrawerOpen(value);
        if (!value) setAiQuickPrompt('');
      }}
      initialPrompt={isAuthenticated ? aiQuickPrompt : ''}
      material={aiMaterial}
      onMaterialChange={setAiMaterial}
      calendarEvents={calendarEvents}
      onCalendarCreated={(event) => setCalendarEvents((current) => [...current, event])}
      corner="right"
    />
  );

  function formatClock(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(ms) {
    const totalMinutes = Math.max(0, Math.round(Number(ms || 0) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours && minutes) return `${hours}h ${minutes}m`;
    if (hours) return `${hours}h`;
    return `${minutes}m`;
  }

  if (!isAuthenticated) {
    const path = window.location.pathname;
    if (path.startsWith('/reset-password')) {
      return <><ResetPasswordPage onNavigate={navigateTo} />{floatingAssistant}</>;
    }
    if (path === '/create-account' || path === '/register' || activeSection === 'create-account') {
      return <><CreateAccountPage onNavigate={navigateTo} />{floatingAssistant}</>;
    }
    if (path === '/forgot-password' || activeSection === 'forgot-password') {
      return <><ForgotPasswordPage onNavigate={navigateTo} />{floatingAssistant}</>;
    }
    if (path === '/login' || activeSection === 'login') {
      return <><LoginPage onLogin={startSession} onNavigate={navigateTo} notice={loginNotice} />{floatingAssistant}</>;
    }
    return <><LandingPage onNavigate={navigateTo} />{floatingAssistant}</>;
  }

  const visibleNavItems = navItems.filter((item) => (roleNav[currentUser.role] || roleNav.Lecturer).includes(item.id));
  const myAttendance = attendanceHistory;
  const roleLabel = currentUser.role || '';
  const navActive = (id) => activeSection === id
    || (id === 'courses' && (activeSection === 'course-detail' || activeSection === 'upload-course'))
    || (id === 'assistant' && aiDrawerOpen);

  return (
    <div
      className={`edu-shell glass-shell left-rail-shell dlp-shell ${darkMode ? 'dark-mode' : ''} ${mustChangePassword ? 'is-password-locked' : ''} ${isAuthenticated && !sessionChecked ? 'is-session-checking' : ''} ${currentUser.role === 'Administrator' && adminCollapsed ? 'is-admin-collapsed' : ''}`}
      style={{ '--ui-zoom': uiZoom }}
    >
      {passwordToast && (
        <div className="success-toast" role="status">
          <CheckCircle2 size={16} />
          <span>Password changed successfully.</span>
          <button type="button" onClick={() => setPasswordToast(false)} aria-label="Close">×</button>
        </div>
      )}
      <button
        type="button"
        className={`sidebar-scrim ${sidebarOpen ? 'is-open' : ''}`}
        aria-label="Close navigation"
        tabIndex={sidebarOpen ? 0 : -1}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`glass-sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Workspace navigation" inert={mustChangePassword || (isAuthenticated && !sessionChecked) ? true : undefined}>
        <div className="sidebar-brand">
          <div className="brand-mark"><BookOpen size={18} /></div>
          <div>
            <strong>Digital Lesson Plan</strong>
            <small>Plan • Teach • Inspire</small>
            {currentUser.role === 'Administrator' && (
              <button type="button" className="text-button" onClick={() => setAdminCollapsed((value) => !value)} aria-expanded={!adminCollapsed}>
                {adminCollapsed ? 'Show menu' : 'Hide menu'}
              </button>
            )}
          </div>
          <button type="button" className="sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>
        <nav className="sidebar-nav">
          {visibleNavItems.map(({ id, label, icon: Icon }) => {
            const active = navActive(id);
            return (
              <button
                key={id}
                type="button"
                className={active ? 'active' : ''}
                onClick={() => {
                  if (mustChangePassword) return;
                  if (id === 'assistant') {
                    setAiDrawerOpen(true);
                    return;
                  }
                  navigateTo(id);
                  if (id === 'plans') setStep(5);
                  if (id === 'dashboard') setStep(5);
                }}
                disabled={mustChangePassword}
              >
                <Icon size={17} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer sidebar-inspiration" data-ref-image="sidebar-inspiration" role="img" aria-label="Better Lesson Plans. Brighter Futures.">
          <em>Better Lesson Plans. Brighter Futures.</em>
        </div>
      </aside>

      <div className="glass-stage" inert={mustChangePassword || (isAuthenticated && !sessionChecked) ? true : undefined}>
        <header className="glass-topbar compact-topbar">
          <button
            type="button"
            className="mobile-nav-toggle"
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="glass-search">
            <Search size={16} />
            <input type="text" value={searchQuery} placeholder="Search lessons, resources, assessments, quizzes, calendar" onChange={(event) => setSearchQuery(event.target.value)} />
            {searchResults && (
              <div className="profile-menu" style={{ left: 0, right: 'auto', width: 'min(420px, 70vw)' }}>
                {[
                  ['lessonPlans', 'Lesson plans', 'plans'],
                  ['resources', 'Resources', 'resources'],
                  ['courses', 'Courses', 'courses'],
                  ['assessments', 'Assessments', 'assessments'],
                  ['quizzes', 'Quizzes', 'assessments'],
                  ['calendar', 'Calendar', 'calendar'],
                ].map(([key, label, section]) => (
                  <div key={key}>
                    <small>{label}</small>
                    {(searchResults[key] || []).length ? searchResults[key].map((item) => (
                      <button key={item.id} type="button" onClick={() => { setSearchQuery(''); setSearchResults(null); navigateTo(section); }}>{item.title}<small>{item.subtitle}</small></button>
                    )) : <p className="muted-text">No {label.toLowerCase()}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-top-actions">
            <button className="glass-icon-btn notification-button" aria-label="Notifications" onClick={async () => { navigateTo('notifications'); const notes = await notificationApi.readAll(); setNotifications(notes.notifications || []); setUnreadCount(notes.unread || 0); }}><Bell size={18} />{unreadCount > 0 && <span className="notification-dot" />}</button>
            <button className="glass-icon-btn" aria-label="Toggle theme" onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sun size={18} /> : <MoonStar size={18} />}</button>
            <div className="profile-anchor" ref={profileMenuRef}>
              <button className="mini-profile" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}>
                <Avatar user={currentUser} />
                <span className="profile-chip-copy">
                  <strong>{currentUser.name || 'User'}</strong>
                  <small>{[roleLabel, currentUser.institution].filter(Boolean).join(' | ') || 'Profile'}</small>
                </span>
                <ChevronDown size={15} />
              </button>
              {profileOpen && (
                <div className="profile-menu">
                  <div className="profile-menu-head"><Avatar user={currentUser} /><span><strong>{currentUser.name}</strong><small>{[currentUser.role, currentUser.institution].filter(Boolean).join(' · ') || 'Account'}</small></span></div>
                  <button onClick={() => navigateTo('profile')}><UserRound size={15} /> View Profile</button>
                  <button onClick={() => navigateTo('profile', { editing: true })}><Pencil size={15} /> Edit Profile</button>
                  <button onClick={() => navigateTo('settings')}><ShieldCheck size={15} /> Account Settings</button>
                  <button className="logout-link" onClick={() => { setProfileOpen(false); setLogoutOpen(true); }}><LogOut size={15} /> Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="glass-workspace main-panel">
        {currentUser.role === 'Administrator' && (activeSection === 'accounts' || activeSection === 'admin-users') && <AccountsPage />}
        {currentUser.role === 'Administrator' && String(activeSection).startsWith('admin-') && <AdminPanel section={activeSection} />}
        {activeSection === 'profile' && <ProfilePage user={currentUser} onSave={saveUser} onNavigate={navigateTo} startEditing={profileEditing} />}
        {activeSection === 'settings' && <SettingsPage user={currentUser} onNavigate={navigateTo} onLogout={() => setLogoutOpen(true)} darkMode={darkMode} setDarkMode={setDarkMode} />}
        {activeSection === 'courses' && <CoursesPage courses={courses} onOpen={navigateCourse} onUpload={() => navigateTo('upload-course')} />}
        {activeSection === 'upload-course' && <UploadCoursePage onCreate={createCourse} onUploaded={(resource) => setResources((current) => [resource, ...current.filter((item) => item.id !== resource.id)])} />}
        {activeSection === 'course-detail' && <CourseDetailPage course={courses.find((course) => course.id === selectedCourseId)} resources={resources} onBack={() => navigateTo('courses')} onStatusChange={updateTopicStatus} />}
        {activeSection === 'progress' && <ProgressPage courses={courses} onOpen={navigateCourse} onStatusChange={updateTopicStatus} />}
        {activeSection === 'dashboard' && (
          <DashboardHome
            user={currentUser}
            savedPlans={savedPlans}
            assessments={assessments}
            calendarEvents={calendarEvents}
            markingCount={report?.papersMarked ?? markingHistory.length}
            dateLabel={dateLabel}
            activeClock={activeClock}
            onClockIn={clockIn}
            onClockOut={clockOut}
            onNavigate={navigateTo}
            onCreatePlan={() => navigateTo('create-plan')}
          />
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
                    {courses.length ? (
                      <label className="field">
                        <span>Saved subject</span>
                        <select value={form.courseId || ''} onChange={(event) => {
                          const course = courses.find((item) => item.id === event.target.value);
                          setForm((previous) => ({
                            ...previous,
                            courseId: event.target.value,
                            courseName: course?.name || previous.courseName,
                            courseCode: course?.code || previous.courseCode,
                            sourceDocumentId: '',
                            sourceDocumentIds: [],
                            sourceFileName: '',
                          }));
                        }}>
                          <option value="">Choose a subject, or type one below</option>
                          {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                        </select>
                      </label>
                    ) : null}
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
                    <label className="field full-span">
                      <span>Lesson notes</span>
                      <textarea rows={5} value={form.lessonNotes} onChange={(event) => updateField('lessonNotes', event.target.value)} placeholder="Paste the notes, objectives, or instructions this lesson must follow" />
                    </label>
                    <div className="field">
                      <span>Subject materials</span>
                      <div className="choice-group wrap">
                        {resources
                          .filter((item) => !form.courseName || !item.courseName || String(item.courseName).toLowerCase() === form.courseName.trim().toLowerCase())
                          .map((item) => {
                            const selected = (form.sourceDocumentIds || []).includes(item.id);
                            return (
                              <button
                                type="button"
                                key={item.id}
                                className={`choice-btn ${selected ? 'active' : ''}`}
                                onClick={() => setForm((previous) => {
                                  const ids = new Set(previous.sourceDocumentIds || []);
                                  if (ids.has(item.id)) ids.delete(item.id);
                                  else ids.add(item.id);
                                  const nextIds = [...ids];
                                  const names = resources.filter((resource) => nextIds.includes(resource.id)).map((resource) => resource.fileName);
                                  return { ...previous, sourceDocumentIds: nextIds, sourceDocumentId: nextIds[0] || '', sourceFileName: names.join(', ') };
                                })}
                              >
                                {item.fileName}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                    <label className="field">
                      <span>Upload notes</span>
                      <input type="file" multiple accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={(event) => { attachLessonSource(event.target.files); event.target.value = ''; }} />
                    </label>
                    {form.sourceFileName ? <p className="muted-text">Using {form.sourceFileName}</p> : null}
                    {errors.source ? <Notice tone={errors.sourceTone || 'error'} message={errors.source} detail={errors.sourceDetail} onRetry={!errors.sourceTone && lessonRetryFiles.current.length ? () => attachLessonSource(lessonRetryFiles.current) : undefined} /> : null}
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
                        {errors.general ? <Notice tone={/success/i.test(errors.general) ? 'success' : 'error'} message={errors.general} /> : null}
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
                                <button className="secondary-button" onClick={() => (generated?.id ? downloadLessonPlanPdf(generated.id) : Promise.reject(new Error('Save the lesson plan before exporting.'))).catch((error) => setErrors({ general: error.message }))}>Export PDF</button>
                                <button className="secondary-button" onClick={() => savePlan('draft')}>Save draft</button>
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
                  <input value={planQuery} onChange={(event) => setPlanQuery(event.target.value)} placeholder="Search saved plans" />
                  {savedPlans.filter((plan) => `${plan.courseName || ''} ${plan.title || ''} ${plan.courseCode || ''}`.toLowerCase().includes(planQuery.trim().toLowerCase())).length ? (
                    <div className="saved-list">
                      {savedPlans.filter((plan) => `${plan.courseName || ''} ${plan.title || ''} ${plan.courseCode || ''}`.toLowerCase().includes(planQuery.trim().toLowerCase())).map((plan) => (
                        <div key={plan.id} className="saved-item">
                          <button type="button" className="text-button" onClick={() => { setGenerated(plan); setStep(5); }}><strong>{plan.courseName || plan.title}</strong></button>
                          <span>{plan.courseCode}</span>
                          <small>{plan.status} · {(plan.lessons || []).length} lessons</small>
                          <button type="button" className="secondary-button" onClick={() => downloadLessonPlanPdf(plan.id).catch((error) => setDataError(error.message))}>PDF</button>
                          <button type="button" className="secondary-button" onClick={async () => {
                            const copy = await lessonPlanApi.create({ ...plan, title: `${plan.title || plan.courseName} copy`, status: 'draft' });
                            setSavedPlans((current) => [copy, ...current]);
                          }}>Duplicate</button>
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
          <CalendarPage events={calendarEvents} onChange={handleCalendarChange} user={currentUser} />
        )}

        {activeSection === 'assessments' && (
          <AssessmentsPage
            assessments={assessments}
            quizzes={quizzes}
            resources={resources}
            courses={courses}
            difficulty={aiDifficulty}
            onGenerate={generateCheckedWork}
            onSave={saveAssessment}
            onDelete={async (item) => {
              try {
                if (item.recordKind === 'quiz') {
                  await quizApi.remove(item.id);
                  setQuizzes((current) => current.filter((entry) => entry.id !== item.id));
                } else {
                  await assessmentApi.remove(item.id);
                  setAssessments((current) => current.filter((entry) => entry.id !== item.id));
                }
              } catch (error) {
                setDataError(error.message || 'Unable to delete assessment.');
              }
            }}
            onSchedule={(items) => persistCalendarSuggestions(items, 'assessment')}
          />
        )}

        {activeSection === 'paper-marking' && (
          <PaperMarkingPage
            user={currentUser}
            history={markingHistory}
            onSaveResult={async () => {
              const papers = await markingApi.list();
              setMarkingHistory(papers);
              setReport(await reportApi.get());
            }}
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
            onScheduleEvents={(items) => persistCalendarSuggestions(items, 'assistant')}
            difficulty={aiDifficulty}
            setDifficulty={setAiDifficulty}
          />
        )}

        {activeSection === 'resources' && (
          <section className="account-page">
            <div className="account-heading"><div><span className="section-kicker">TEACHING LIBRARY</span><h1>My Resources</h1><p>Files you upload stay in your account after refresh and the next login.</p></div><button className="primary-button" onClick={() => navigateTo('upload-course')}>Upload</button></div>
            <div className="panel-card" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <input value={resourceQuery} onChange={(event) => setResourceQuery(event.target.value)} placeholder="Search resources" />
              <select value={resourceType} onChange={(event) => setResourceType(event.target.value)}>
                <option value="all">All types</option>
                <option value=".pdf">PDF</option>
                <option value=".doc">DOC</option>
                <option value=".docx">DOCX</option>
                <option value=".txt">TXT</option>
              </select>
            </div>
            {resources.filter((item) => {
              const hay = `${item.courseName || ''} ${item.fileName || ''} ${item.courseCode || ''}`.toLowerCase();
              const typeOk = resourceType === 'all' || String(item.fileType || '').toLowerCase() === resourceType;
              return typeOk && hay.includes(resourceQuery.trim().toLowerCase());
            }).length ? resources.filter((item) => {
              const hay = `${item.courseName || ''} ${item.fileName || ''} ${item.courseCode || ''}`.toLowerCase();
              const typeOk = resourceType === 'all' || String(item.fileType || '').toLowerCase() === resourceType;
              return typeOk && hay.includes(resourceQuery.trim().toLowerCase());
            }).map((item) => (
              <article className="panel-card" key={item.id}>
                <strong>{item.courseName || item.fileName}</strong>
                <p>{item.courseCode || 'Course code not detected'} · {String(item.fileType || '').replace('.', '').toUpperCase()} · {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</p>
                <p>{item.description || 'Description not detected'}</p>
                <div className="footer-actions-row">
                  <button className="secondary-button" onClick={() => navigateTo('assessments')}>Generate assessment</button>
                  <button className="secondary-button" onClick={() => navigateTo('create-plan')}>Generate plan</button>
                  <button className="secondary-button danger" onClick={async () => { await resourceApi.remove(item.id); setResources((current) => current.filter((entry) => entry.id !== item.id)); }}>Delete</button>
                </div>
              </article>
            )) : <div className="panel-card empty-course"><h2>No resources yet</h2><p>Upload a TXT, PDF, DOC, or DOCX outline.</p></div>}
          </section>
        )}

        {activeSection === 'reports' && (
          <section className="account-page reports-page">
            <div className="account-heading"><div><span className="section-kicker">TEACHING INSIGHTS</span><h1>Reports</h1><p>A snapshot of your lesson plans, assessments, paper marking, and attendance.</p></div></div>
            <div className="reports-grid">
              <article className="panel-card"><span className="glass-kicker">Lesson plans</span><strong>{report?.lessonPlans ?? savedPlans.length}</strong><p>Saved plans in your workspace</p></article>
              <article className="panel-card"><span className="glass-kicker">Assessments</span><strong>{report?.assessments ?? assessments.length}</strong><p>Assessments created</p></article>
              <article className="panel-card"><span className="glass-kicker">Quizzes</span><strong>{report?.quizzes ?? quizzes.length}</strong><p>Quizzes generated</p></article>
              <article className="panel-card"><span className="glass-kicker">Resources</span><strong>{report?.resources ?? resources.length}</strong><p>Uploaded files</p></article>
              <article className="panel-card"><span className="glass-kicker">Papers marked</span><strong>{report?.papersMarked ?? markingHistory.length}</strong><p>Saved marking sessions</p></article>
              <article className="panel-card"><span className="glass-kicker">Days present</span><strong>{report?.daysPresent ?? 0}</strong><p>{report?.totalHours ?? 0} hours worked</p></article>
              <article className="panel-card"><span className="glass-kicker">Clock in / out</span><strong>{report?.clockInCount ?? 0} / {report?.clockOutCount ?? 0}</strong><p>Completed sessions stay after refresh</p></article>
            </div>
            <div className="panel-card">
              <div className="panel-head"><h3>Recent attendance</h3></div>
              {myAttendance.length ? (
                <div className="attendance-table">
                  {myAttendance.slice(0, 8).map((row) => (
                    <div className="attendance-row" key={row.id}>
                      <strong>{row.date}</strong>
                      <span>{formatClock(row.clockIn)} – {row.clockOut ? formatClock(row.clockOut) : 'Still clocked in'}</span>
                      <span>{row.workedMinutes != null ? formatDuration(row.workedMinutes * 60000) : '—'}</span>
                      <small>{row.institution || currentUser.institution || 'Institution'}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted-text">No attendance records yet. Use Clock In on the dashboard.</p>
              )}
            </div>
          </section>
        )}

        {activeSection === 'notifications' && (
          <section className="account-page">
            <div className="account-heading"><div><span className="section-kicker">UPDATES</span><h1>Notifications</h1><p>Lesson, assessment, and AI activity reminders appear here.</p></div></div>
            <div className="panel-card">
              <div className="activity-list">
                {notifications.length ? notifications.map((item) => (
                  <div className="activity-item" key={item.id}>
                    <div className="activity-dot" />
                    <div className="activity-copy">
                      <strong>{item.title}</strong>
                      <span>{item.message}</span>
                      {item.type === 'role-confirmation' && awaitingRoleConfirmation(currentUser) && (
                        <>
                          <button type="button" className="primary-button" onClick={() => { setRoleConfirmError(''); setRoleConfirmOpen(true); }}>Confirm Role</button>
                          <small>If this role is incorrect, contact an administrator to request a correction.</small>
                        </>
                      )}
                    </div>
                    <small>{item.type === 'role-confirmation' && awaitingRoleConfirmation(currentUser) ? 'Action needed' : (item.isRead ? 'Read' : 'New')}</small>
                  </div>
                )) : <p className="muted-text">No notifications yet.</p>}
              </div>
            </div>
          </section>
        )}
        {errors.general === 'Profile updated successfully.' && <div className="success-toast"><CheckCircle2 size={16} /> Profile updated successfully.</div>}
        {logoutOpen && <div className="dialog-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title"><div className="dialog-icon"><LogOut size={19} /></div><h2 id="logout-title">Are you sure you want to log out?</h2><p>Your session will end and you will return to the sign-in screen.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setLogoutOpen(false)}>Cancel</button><button className="logout-confirm" onClick={confirmLogout}>Log Out</button></div></div></div>}
        {welcomeOpen && !mustChangePassword && (
          <div className="dialog-backdrop welcome-backdrop" role="presentation">
            <div className="confirm-dialog welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
              <div className="dialog-icon"><Sparkles size={19} /></div>
              <h2 id="welcome-title">Welcome to your Digital Lesson Plan System</h2>
              <p>I&apos;m your AI teaching assistant. I can help you create lesson plans, organise your calendar, build assessments, mark papers, and navigate the system.</p>
              <p className="welcome-role"><strong>{currentUser.role}</strong>{currentUser.institution ? ` · ${currentUser.institution}` : ''}</p>
              <p>What would you like to do first?</p>
              <div className="welcome-actions">
                <button type="button" className="primary-button" onClick={() => { setWelcomeOpen(false); navigateTo('create-plan'); }}>Create a lesson plan</button>
                <button type="button" className="secondary-button" onClick={() => { setWelcomeOpen(false); navigateTo('paper-marking'); }}>Mark a paper</button>
                <button type="button" className="secondary-button" onClick={() => { setWelcomeOpen(false); navigateTo('assistant'); }}>Talk to AI</button>
                <button type="button" className="secondary-button" onClick={() => setWelcomeOpen(false)}>Explore dashboard</button>
              </div>
            </div>
          </div>
        )}
        </main>
      </div>

      {mustChangePassword && (
        <div className="pw-password-lock">
          <ChangePasswordPage
            onChanged={(user) => {
              setCurrentUser(user);
              setMustChangePassword(false);
              setPasswordToast(true);
              setRoleSnoozed(false);
              loadWorkspace();
            }}
          />
        </div>
      )}
      {sessionChecked && !mustChangePassword && !roleSnoozed && awaitingRoleConfirmation(currentUser) && (
        <div className="dialog-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="role-assign-title">
            <h2 id="role-assign-title">Confirm Your Assigned Role</h2>
            <p>The administrator has assigned you the role of <strong>{currentUser.role}</strong>.</p>
            <p>Please confirm your assigned role to continue.</p>
            <p>If this role is incorrect, contact an administrator to request a correction.</p>
            <div className="dialog-actions">
              <button type="button" className="primary-button" onClick={() => { setRoleConfirmError(''); setRoleConfirmOpen(true); }}>Confirm Role</button>
              <button type="button" className="secondary-button" onClick={() => setRoleSnoozed(true)}>Review Later</button>
            </div>
          </div>
        </div>
      )}
      {roleConfirmOpen && (
        <div className="dialog-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="role-confirm-title">
            <h2 id="role-confirm-title">Confirm this role?</h2>
            <p>This saves <strong>{currentUser.role}</strong> as your role. You cannot change it yourself.</p>
            <p>If it is incorrect, contact an administrator to request a correction.</p>
            {roleConfirmError && <p className="auth-error" role="alert">{roleConfirmError}</p>}
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setRoleConfirmOpen(false)} disabled={roleConfirming}>Cancel</button>
              <button type="button" className="primary-button" disabled={roleConfirming} onClick={confirmAssignedRole}>{roleConfirming ? 'Confirming...' : 'Confirm Role'}</button>
            </div>
          </div>
        </div>
      )}
      {sessionChecked && !mustChangePassword && !awaitingRoleConfirmation(currentUser) && floatingAssistant}
    </div>
  );
}

export default App;
