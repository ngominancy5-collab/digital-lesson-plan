import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  LoaderCircle,
  Paperclip,
  SendHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { ACCEPT_ATTR, ACCEPTED_EXTENSIONS, extractLocalDocument, fileExtension, fileToBase64 } from '../lib/documentExtractor';
import { api, calendarApi, streamAiChat } from '../services/api.js';
import Notice from './Notice.jsx';
import './floating-assistant.css';

const HELP_STARTERS = [
  'What is this system?',
  'How does it work?',
  'How do I create a lesson plan?',
  'What can the AI generate?',
  'How do assessments and quizzes work?',
  'How does the calendar work?',
  'Who is the system designed for?',
];

const HELP_KB = [
  {
    keys: ['what is', 'about', 'planwise', 'this system', 'digital lesson'],
    answer:
      'Planwise AI is a teaching workspace for educators. It helps you turn course material into structured lesson plans, assessments, quizzes, and a teaching calendar — with an interactive AI tutor once you sign in.',
  },
  {
    keys: ['how does it work', 'how it works', 'overview', 'get started', 'start'],
    answer:
      'Log in with the credentials from your administrator. After you sign in you can upload materials, generate lesson plans, run quizzes, schedule teaching dates, and chat with the full AI assistant from any page.',
  },
  {
    keys: ['create a lesson', 'lesson plan', 'make a plan', 'generate lesson'],
    answer:
      'After logging in, open Lesson Plans or the AI Assistant. Upload or describe your course content, set your level, and ask the AI to draft a structured plan with objectives, topics, and activities. You can edit and save plans in your workspace.',
  },
  {
    keys: ['ai generate', 'what can', 'generate', 'capabilities', 'assistant'],
    answer:
      'Once you are logged in, the AI can draft lesson plans, improve existing plans, generate quizzes and assessments, explain uploaded teaching materials, answer content questions, and suggest calendar events. Sign in for the full interactive assistant.',
  },
  {
    keys: ['assessment', 'quiz', 'test', 'exam'],
    answer:
      'Logged-in users can generate quizzes and assessments from course materials or lesson content, review answers, and save them under Assessments. Difficulty can follow the level you choose in the assistant.',
  },
  {
    keys: ['calendar', 'schedule', 'date', 'timetable'],
    answer:
      'The teaching calendar maps lessons, assessments, and suggested dates into one schedule. After you generate a plan, PlanWise can suggest calendar entries you can review and keep.',
  },
  {
    keys: ['who', 'for', 'designed', 'lecturer', 'teacher', 'student', 'role'],
    answer:
      'PlanWise is designed for lecturers, teachers, tutors, and academic teams who plan courses digitally. Role options at sign-up tailor the workspace to how you teach.',
  },
  {
    keys: ['login', 'log in', 'sign up', 'register', 'account', 'sign in'],
    answer:
      'Use Log In with the email and password from your administrator. After you authenticate, the floating assistant becomes a full interactive lesson-planning AI across your dashboard.',
  },
];

const INTERACTIVE_STARTERS = [
  { label: 'Go to my lesson plans', section: 'plans' },
  { label: 'Show my calendar', section: 'calendar' },
  { label: 'Create an assessment', section: 'assessments' },
  { label: 'Help me mark a paper', section: 'paper-marking' },
  { label: 'How do I upload a marking key?', prompt: 'How do I upload a marking key for paper marking?' },
];

function matchHelpAnswer(message) {
  const text = String(message || '').toLowerCase();
  const hit = HELP_KB.find((entry) => entry.keys.some((key) => text.includes(key)));
  if (hit) return hit.answer;
  return 'I can explain how PlanWise AI works — lesson plans, assessments, quizzes, the calendar, and who it is for. Ask one of the suggested questions, or log in to use the full interactive AI for creating plans.';
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const FOCUS_TITLES = {
  plans: 'Lesson Plan Assistant',
  'create-plan': 'Lesson Plan Assistant',
  calendar: 'Calendar Assistant',
  assessments: 'Assessment Assistant',
  'paper-marking': 'Paper Marking Assistant',
  courses: 'Courses Assistant',
  'course-detail': 'Courses Assistant',
  'upload-course': 'Courses Assistant',
  resources: 'Courses Assistant',
};

function focusTitle(section) {
  return FOCUS_TITLES[section] || 'PlanWise Assistant';
}

function takeCalendarSuggestion(text) {
  const source = String(text || '');
  const match = source.match(/CALENDAR_SUGGESTION:\s*(\{[\s\S]*?\})/);
  if (!match) return { text: source.trim(), suggestion: null };
  let suggestion = null;
  try {
    suggestion = JSON.parse(match[1]);
  } catch {
    suggestion = null;
  }
  if (!suggestion?.title || !suggestion?.date) suggestion = null;
  return { text: source.replace(match[0], '').trim(), suggestion };
}

export default function FloatingAssistant({
  isAuthenticated = false,
  user = null,
  activeSection = 'dashboard',
  onNavigate,
  hidden = false,
  open: openProp,
  onOpenChange,
  initialPrompt = '',
  material = null,
  onMaterialChange,
  calendarEvents = [],
  onCalendarCreated,
  corner = 'right',
}) {
  const mode = isAuthenticated ? 'interactive' : 'help';
  const controlled = typeof openProp === 'boolean';
  const [openInternal, setOpenInternal] = useState(false);
  const open = controlled ? openProp : openInternal;
  function setOpen(next) {
    const value = typeof next === 'function' ? next(open) : next;
    if (!controlled) setOpenInternal(value);
    onOpenChange?.(value);
  }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState('');
  const [uploading, setUploading] = useState(false);
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const fileMemory = useRef(new Map());
  const abortRef = useRef(null);
  const handledPrompt = useRef('');

  const contextLabel = ({
    dashboard: 'Dashboard',
    plans: 'Lesson Plans',
    calendar: 'Calendar',
    assessments: 'Assessments',
    'paper-marking': 'Paper Marking',
    courses: 'Courses',
    resources: 'Resources',
    reports: 'Reports',
    assistant: 'AI Assistant',
    settings: 'Settings',
    landing: 'Landing',
    login: 'Sign In',
    register: 'Registration',
  })[activeSection] || activeSection;

  useEffect(() => {
    if (!controlled) setOpenInternal(false);
    setInput('');
    setBusy(false);
    setConversationId('');
    handledPrompt.current = '';
    abortRef.current?.abort();
    if (mode === 'help') {
      setMessages([
        {
          id: 'welcome-help',
          role: 'assistant',
          text: 'Hi — I am the Planwise help guide. Ask how the system works. For creating personalized lesson plans, log in first.',
          time: nowTime(),
        },
      ]);
    } else {
      const name = String(user?.name || '').trim();
      setMessages([
        {
          id: 'welcome-ai',
          role: 'assistant',
          text: name
            ? `Hello, ${name}! 👋 How can I help you today?`
            : 'Hello! 👋 How can I help you today?',
          time: nowTime(),
          showQuick: true,
        },
      ]);
    }
  }, [mode, user?.id, user?.name, controlled]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (hidden) return null;

  function resolveNavigation(prompt) {
    const text = String(prompt || '').toLowerCase();
    const routes = [
      { keys: ['lesson plan', 'create a lesson', 'create lesson', 'plans', 'my lesson'], section: 'plans', reply: 'Opening Lesson Plans so you can create or review plans.' },
      { keys: ['create-plan', 'new lesson plan', 'help me create a lesson'], section: 'create-plan', reply: 'Taking you to create a new lesson plan.' },
      { keys: ['calendar', 'schedule', 'timetable', 'what do i have'], section: 'calendar', reply: 'Opening your teaching calendar.' },
      { keys: ['assessment', 'quiz', 'test', 'exam'], section: 'assessments', reply: 'Opening Assessments so you can create or manage quizzes and tests.' },
      { keys: ['mark a paper', 'paper marking', 'marking key', 'scan paper', 'mark paper'], section: 'paper-marking', reply: 'Opening Paper Marking. Upload a marking key, then upload or scan the student paper.' },
      { keys: ['course', 'subject'], section: 'courses', reply: 'Opening Courses / Subjects.' },
      { keys: ['resource'], section: 'resources', reply: 'Opening Resources.' },
      { keys: ['report'], section: 'reports', reply: 'Opening Reports.' },
      { keys: ['assistant', 'talk to ai', 'full ai'], section: 'assistant', reply: 'Opening the full AI Assistant.' },
      { keys: ['setting', 'profile'], section: 'settings', reply: 'Opening Settings.' },
      { keys: ['dashboard', 'home'], section: 'dashboard', reply: 'Taking you to the dashboard.' },
      { keys: ['clock in', 'attendance', 'clock out'], section: 'dashboard', reply: 'Attendance controls are on the dashboard. Opening the dashboard now.' },
    ];
    const hit = routes.find((route) => route.keys.some((key) => text.includes(key)));
    if (!hit) return null;
    const wantsNav = /take me|open|where can|go to|navigate|show me|i want to|help me create|how do i upload/i.test(text);
    if (wantsNav) return hit;
    return null;
  }

  async function sendInteractive(prompt) {
    const nav = resolveNavigation(prompt);
    if (nav && onNavigate) {
      setMessages((current) => [
        ...current,
        { id: `user-${Date.now()}`, role: 'user', text: prompt, time: nowTime() },
        { id: `bot-${Date.now()}`, role: 'assistant', text: nav.reply, time: nowTime(), navTarget: nav.section },
      ]);
      onNavigate(nav.section);
      return;
    }

    const botId = `bot-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', text: prompt, time: nowTime() },
      { id: botId, role: 'assistant', text: '', time: nowTime(), streaming: true },
    ]);
    setBusy(true);

    const history = messages
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .slice(-10)
      .map((item) => ({ role: item.role, content: item.text }));

    const contextHints = {
      calendar: 'Calendar Assistant. Prioritise events, schedules, deadlines, and timetables. Use the saved events and any uploaded schedule. Never claim an event was created.',
      assessments: 'Assessment Assistant. Prioritise assessment creation and questions based on the supplied teaching materials. Do not invent questions when no source material is available.',
      plans: 'Lesson Plan Assistant. Prioritise generating, summarising, editing, and explaining lesson plans from the notes and documents the user supplied.',
      'create-plan': 'Lesson Plan Assistant. Prioritise generating, summarising, editing, and explaining lesson plans from the notes and documents the user supplied.',
      'paper-marking': 'Paper Marking Assistant. Prioritise marking, marking schemes, and comparing student answers with the supplied criteria. Do not guess marks without those materials.',
      courses: 'Courses Assistant. Help manage subjects and the materials saved for each subject.',
      dashboard: 'PlanWise Assistant. Help the educator decide what to do next across the workspace.',
    };

    const payload = {
      message: prompt,
      history,
      userId: user?.id,
      conversationId: conversationId || undefined,
      profile: { id: user?.id, name: user?.name, role: user?.role, institution: user?.institution },
      materialText: material?.status === 'ready' ? material.text : '',
      materialName: material?.status === 'ready' ? material.name : '',
      session: {
        mode: 'tutor',
        difficulty: 'Intermediate',
        topics: [],
        activeSection,
        sectionHint: contextHints[activeSection] || `User is currently in ${contextLabel}.`,
        materialName: material?.status === 'ready' ? material.name : '',
        calendarEvents: (calendarEvents || []).slice(0, 30).map((event) => ({
          title: event.title,
          date: event.date,
          startTime: event.startTime,
          endTime: event.endTime,
          type: event.type,
        })),
      },
      difficulty: 'Intermediate',
    };

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await streamAiChat(payload, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('stream unavailable');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        frames.forEach((frame) => {
          const event = (frame.match(/^event: (.+)$/m) || [])[1];
          const dataLine = frame
            .split('\n')
            .filter((line) => line.startsWith('data: '))
            .map((line) => line.slice(6))
            .join('');
          if (!event || !dataLine) return;
          const data = JSON.parse(dataLine);
          if (event === 'delta') {
            setMessages((current) => current.map((item) => (
              item.id === botId
                ? { ...item, text: `${item.text || ''}${typeof data === 'string' ? data : ''}`, streaming: true }
                : item
            )));
          }
          if (event === 'meta' || event === 'done' || event === 'saved') {
            finalResult = { ...(finalResult || {}), ...(typeof data === 'object' ? data : {}) };
          }
        });
      }

      if (finalResult?.conversationId) setConversationId(finalResult.conversationId);
      const parsed = takeCalendarSuggestion(finalResult?.reply || '');
      setMessages((current) => current.map((item) => (
        item.id === botId
          ? {
            ...item,
            streaming: false,
            text: parsed.text || item.text.replace(/CALENDAR_SUGGESTION:[\s\S]*$/, '').trim() || 'I could not complete that reply. Try again.',
            calendarSuggestion: parsed.suggestion,
          }
          : item
      )));
    } catch (error) {
      if (error.name === 'AbortError') {
        setMessages((current) => current.map((item) => (
          item.id === botId ? { ...item, streaming: false, text: item.text || 'Stopped.' } : item
        )));
      } else {
        setMessages((current) => current.map((item) => (
          item.id === botId
            ? {
              ...item,
              streaming: false,
              text: 'I could not reach the live AI right now. Open the full AI Assistant page, or try again in a moment.',
            }
            : item
        )));
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function sendHelp(prompt) {
    const answer = matchHelpAnswer(prompt);
    const needsAuthCta = /sign in|log in|sign up|full interactive|personalized/i.test(answer)
      || /lesson plan|generate|quiz|assessment/i.test(prompt);
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', text: prompt, time: nowTime() },
      {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        text: answer,
        time: nowTime(),
        showAuthCta: needsAuthCta,
      },
    ]);
  }

  function materialFiles(current = material) {
    if (!current) return [];
    if (Array.isArray(current.files) && current.files.length) return current.files;
    return [current];
  }

  function publishFiles(files) {
    const ready = files.filter((file) => file.status === 'ready' && file.text);
    const processing = files.some((file) => file.status === 'processing');
    const failed = files.find((file) => file.status === 'error');
    onMaterialChange?.({
      id: 'batch',
      name: files.map((file) => file.name).join(', '),
      status: processing ? 'processing' : ready.length ? 'ready' : 'error',
      text: ready.map((file) => `File: ${file.name}\n${file.text}`).join('\n\n'),
      error: failed?.error || '',
      files,
    });
  }

  function removeMaterialFile(id) {
    const files = materialFiles().filter((file) => file.id !== id);
    if (!files.length) {
      onMaterialChange?.(null);
      return;
    }
    publishFiles(files);
  }

  async function processFiles(fileList) {
    const incoming = [...(fileList || [])];
    if (!incoming.length || !isAuthenticated || uploading || busy) return;
    setUploading(true);
    let files = materialFiles().filter((item) => item.status !== 'error');
    try {
      for (const file of incoming) {
        files = files.filter((item) => item.name !== file.name);
        const ext = fileExtension(file.name);
        const entry = {
          id: `file-${Date.now()}-${file.name}`,
          name: file.name,
          type: ext.replace('.', '').toUpperCase() || 'FILE',
          size: file.size,
          status: 'processing',
          stage: 'Extracting text',
          text: '',
          error: '',
          detail: '',
        };
        fileMemory.current.set(entry.id, file);
        files = [...files, entry];
        publishFiles(files);
        const slow = setTimeout(() => {
          files = files.map((item) => (item.id === entry.id && item.status === 'processing' ? { ...item, stage: 'Reading scanned pages' } : item));
          publishFiles(files);
        }, 2500);
        try {
          if (file.size > 15 * 1024 * 1024) throw new Error('That file is larger than 15 MB.');
          if (!ACCEPTED_EXTENSIONS.includes(ext)) throw new Error('Use a PDF, Word, PowerPoint, or TXT file.');
          let text = await extractLocalDocument(file);
          if (!String(text || '').trim()) {
            const contentBase64 = await fileToBase64(file);
            const data = await api.post('/ai/extract', {
              fileName: file.name,
              mimeType: file.type,
              contentBase64,
            }).then((response) => response.data);
            text = data.text;
          }
          if (!String(text || '').trim()) throw new Error(`Could not read “${file.name}”.`);
          files = files.map((item) => (item.id === entry.id ? { ...item, status: 'ready', stage: 'Ready', text, error: '', detail: '' } : item));
        } catch (error) {
          files = files.map((item) => (item.id === entry.id ? {
            ...item,
            status: 'error',
            stage: '',
            error: error.message || `Could not read “${file.name}”.`,
            detail: error.detail || '',
          } : item));
        } finally {
          clearTimeout(slow);
        }
        publishFiles(files);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function retryFile(id) {
    const file = fileMemory.current.get(id);
    if (!file || uploading || busy) return;
    const remaining = materialFiles().filter((item) => item.id !== id);
    if (remaining.length) publishFiles(remaining);
    else onMaterialChange?.(null);
    await processFiles([file]);
  }

  async function confirmCalendarEvent(item) {
    const suggestion = item.calendarSuggestion;
    if (!suggestion?.title || !suggestion?.date) return;
    setBusy(true);
    try {
      const created = await calendarApi.create({
        title: suggestion.title,
        date: suggestion.date,
        startTime: suggestion.startTime || '09:00',
        endTime: suggestion.endTime || '10:00',
        type: suggestion.type || 'event',
        description: suggestion.description || '',
        status: 'confirmed',
        source: 'assistant',
      });
      onCalendarCreated?.(created);
      setMessages((current) => current.map((entry) => (
        entry.id === item.id
          ? { ...entry, calendarSuggestion: null, text: `${entry.text}\n\n${created.title} was added to the calendar.` }
          : entry
      )));
    } catch (error) {
      setMessages((current) => current.map((entry) => (
        entry.id === item.id
          ? { ...entry, text: `${entry.text}\n\nThe event was not added. ${error.message || 'Please try again from the calendar.'}` }
          : entry
      )));
    } finally {
      setBusy(false);
    }
  }

  function handleSend(event) {
    event?.preventDefault?.();
    const prompt = input.trim();
    if (!prompt || busy || uploading) return;
    setInput('');
    if (mode === 'help') sendHelp(prompt);
    else sendInteractive(prompt);
  }

  function handleStarter(prompt) {
    if (busy) return;
    setInput('');
    if (mode === 'help') sendHelp(prompt);
    else sendInteractive(prompt);
  }

  function handleQuick(action) {
    if (busy) return;
    if (action.section) {
      onNavigate?.(action.section);
      setOpen(false);
      return;
    }
    if (action.prompt) sendInteractive(action.prompt);
  }

  useEffect(() => {
    const prompt = String(initialPrompt || '').trim();
    if (!prompt || !open || !isAuthenticated || mode !== 'interactive') return;
    if (handledPrompt.current === prompt) return;
    handledPrompt.current = prompt;
    sendInteractive(prompt);
  }, [initialPrompt, open, isAuthenticated, mode]);

  const cornerClass = corner === 'left' ? 'fa-corner-left' : 'fa-corner-right';
  const starters = mode === 'help' ? HELP_STARTERS : INTERACTIVE_STARTERS;

  return (
    <div className={`floating-assistant ${cornerClass} ${open ? 'is-open' : ''} ${mode === 'interactive' ? 'fa-drawer' : ''}`}>
      {open && (
        <section
          className="fa-panel"
          role="dialog"
          aria-modal="false"
          aria-label={mode === 'help' ? 'PlanWise help assistant' : 'AI Assistant'}
        >
          <header className="fa-header">
            <div className="fa-header-copy">
              <strong>
                <Sparkles size={15} /> {mode === 'help' ? 'How PlanWise works' : focusTitle(activeSection)}
              </strong>
              {mode === 'interactive' ? (
                <span className="fa-online"><i /> Online</span>
              ) : (
                <p>System explanations only — no lesson generation until you sign in.</p>
              )}
            </div>
            <button type="button" className="fa-icon-btn" aria-label="Close assistant" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>

          <div className="fa-messages" ref={listRef}>
            {messages.map((item) => (
              <div key={item.id} className={`fa-bubble fa-${item.role}`}>
                <p>{item.text || (item.streaming ? '…' : '')}</p>
                {item.showQuick && mode === 'interactive' && (
                  <div className="fa-quick-stack">
                    {INTERACTIVE_STARTERS.map((action) => (
                      <button key={action.label} type="button" onClick={() => handleQuick(action)} disabled={busy}>
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
                {item.showAuthCta && (
                  <div className="fa-cta-row">
                    <button type="button" className="fa-cta primary" onClick={() => onNavigate?.('login')}>
                      Log In
                    </button>
                  </div>
                )}
                {item.calendarSuggestion && (
                  <div className="fa-cta-row">
                    <button type="button" className="fa-cta primary" disabled={busy} onClick={() => confirmCalendarEvent(item)}>
                      Add this event
                    </button>
                  </div>
                )}
                {item.navTarget && (
                  <div className="fa-cta-row">
                    <button type="button" className="fa-cta primary" onClick={() => { onNavigate?.(item.navTarget); setOpen(false); }}>
                      Open section
                    </button>
                  </div>
                )}
                <time>{item.time}</time>
              </div>
            ))}
          </div>

          {mode === 'help' && (
            <>
              <div className="fa-starters">
                {starters.slice(0, 4).map((prompt) => (
                  <button key={prompt} type="button" onClick={() => handleStarter(prompt)} disabled={busy}>
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="fa-cta-row fa-cta-bar">
                <button type="button" className="fa-cta primary" onClick={() => onNavigate?.('login')}>
                  Log In
                </button>
              </div>
            </>
          )}

          {mode === 'interactive' && materialFiles().length > 0 && (
            <div className="fa-file-list">
              {materialFiles().map((file) => (
                <div className="fa-file-chip" key={file.id || file.name}>
                  <Paperclip size={13} />
                  <strong>{file.name}</strong>
                  <span>{file.status === 'processing' ? (file.stage || 'Extracting text') : file.status === 'ready' ? 'Ready' : 'Needs attention'}</span>
                  <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeMaterialFile(file.id)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {mode === 'interactive' && materialFiles().filter((file) => file.status === 'error').map((file) => (
            <Notice
              key={`notice-${file.id}`}
              message={file.error || `Could not read ${file.name}.`}
              detail={file.detail}
              onRetry={() => retryFile(file.id)}
            />
          ))}

          <form className="fa-composer" onSubmit={handleSend}>
            {mode === 'interactive' && (
              <>
                <input
                  ref={fileRef}
                  className="fa-attach-input"
                  type="file"
                  multiple
                  accept={ACCEPT_ATTR}
                  onChange={(event) => processFiles(event.target.files)}
                />
                <button
                  type="button"
                  className="fa-attach"
                  aria-label="Upload a file"
                  disabled={busy || uploading}
                  onClick={() => fileRef.current?.click()}
                  title="Upload PDF, Word, PowerPoint, or TXT"
                >
                  {uploading ? <LoaderCircle size={16} className="fa-spin" /> : <Paperclip size={16} />}
                </button>
              </>
            )}
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={mode === 'help' ? 'Ask how PlanWise works…' : 'Type your message...'}
              aria-label="Assistant message"
              disabled={busy || uploading}
            />
            <button type="submit" className="fa-send" disabled={busy || uploading || !input.trim()} aria-label="Send message">
              {busy ? <LoaderCircle size={16} className="fa-spin" /> : <SendHorizontal size={16} />}
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className={`fa-fab ${open ? 'is-active' : ''}`}
        aria-expanded={open}
        aria-label={open ? 'Close assistant' : mode === 'help' ? 'Open help assistant' : 'Open AI assistant'}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X size={20} /> : <Bot size={20} />}
      </button>
    </div>
  );
}
