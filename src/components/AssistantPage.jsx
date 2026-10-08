import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  MessageSquareText,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Square,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { ACCEPT_ATTR, ACCEPTED_EXTENSIONS, extractLocalDocument, fileExtension, fileToBase64 } from '../lib/documentExtractor.js';
import { api, streamAiChat } from '../services/api.js';
import {
  DIFFICULTY_LEVELS,
  fallbackAnalyze,
  makeId,
  nowTime,
  QUESTION_TYPES,
  readableWordCount,
  suggestCalendarFromAssessment,
  isReadableEducationalText,
  looksLikeReadablePhrase,
} from '../../shared/learningEngine.js';
import { converse, LEARNING_MODES } from '../../shared/tutorEngine.js';

function RichText({ text }) {
  const source = String(text || '');
  const chunks = source.split(/```/);
  return (
    <div className="rich-text">
      {chunks.map((chunk, index) => {
        if (index % 2 === 1) {
          const body = chunk.replace(/^[a-z]+\n/i, '');
          return <pre key={index}><code>{body}</code></pre>;
        }
        return chunk.split(/\n{2,}/).map((block, blockIndex) => {
          const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
          if (!lines.length) return null;
          if (lines.every((line) => /^[-*•]/.test(line))) {
            return <ul key={`${index}-${blockIndex}`}>{lines.map((line) => <li key={line}>{line.replace(/^[-*•]\s*/, '')}</li>)}</ul>;
          }
          if (lines.every((line) => /^\d+\.\s/.test(line))) {
            return <ol key={`${index}-${blockIndex}`}>{lines.map((line) => <li key={line}>{line.replace(/^\d+\.\s*/, '')}</li>)}</ol>;
          }
          if (/^#{1,3}\s/.test(lines[0])) {
            return <h4 key={`${index}-${blockIndex}`}>{lines[0].replace(/^#{1,3}\s/, '')}</h4>;
          }
          return <p key={`${index}-${blockIndex}`}>{lines.join(' ')}</p>;
        });
      })}
    </div>
  );
}

function fileTypeLabel(name = '') {
  return fileExtension(name).replace('.', '').toUpperCase() || 'FILE';
}

function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isStaff(role = '') {
  return /lecturer|teacher|coordinator|administrator/i.test(role);
}

function ArtifactEditor({ artifact, onChange, onApprove, onRegenerate, onSchedule, onPublish }) {
  if (!artifact) return null;
  const assessment = artifact.assessment;
  const content = artifact.content;
  const analysis = artifact.analysis;
  if (!assessment && !content && !analysis) return null;

  return (
    <div className="artifact-panel panel-card">
      <div className="panel-head">
        <div>
          <span className="section-kicker">REVIEW BEFORE PUBLISHING</span>
          <h3>{assessment?.title || content?.title || analysis?.topic || 'Generated content'}</h3>
        </div>
        <span className="status-chip">{artifact.difficulty || 'Intermediate'}</span>
      </div>
      {analysis && !analysis.error && looksLikeReadablePhrase(analysis.topic) && (
        <div className="review-block">
          <p><strong>Topic:</strong> {analysis.topic}</p>
          <ul>{(analysis.learningObjectives || []).filter((item) => looksLikeReadablePhrase(item)).map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}
      {assessment?.questions?.map((question, index) => (
        <div className="question-card" key={question.id}>
          <div className="question-card-head"><strong>Q{index + 1}. {question.type}</strong>
            <input className="marks-input" type="number" min="1" value={question.marks} onChange={(event) => {
              const questions = assessment.questions.map((item) => item.id === question.id ? { ...item, marks: Number(event.target.value) } : item);
              onChange({ ...artifact, assessment: { ...assessment, questions, totalMarks: questions.reduce((sum, item) => sum + Number(item.marks || 0), 0) } });
            }} />
          </div>
          <textarea rows={3} value={question.prompt} onChange={(event) => onChange({ ...artifact, assessment: { ...assessment, questions: assessment.questions.map((item) => item.id === question.id ? { ...item, prompt: event.target.value } : item) } })} />
        </div>
      ))}
      {content?.days && <div className="review-block">{content.days.map((day) => <p key={day.day}><strong>{day.day}:</strong> {day.focus} ({day.minutes} min)</p>)}</div>}
      <div className="artifact-actions">
        <button className="secondary-button" onClick={onRegenerate}><RefreshCw size={14} /> Regenerate</button>
        {assessment ? <button className="secondary-button" onClick={onApprove}><Check size={14} /> Approve</button> : null}
        {assessment ? <button className="primary-button" onClick={onPublish}><ClipboardCheck size={14} /> Publish</button> : <button className="primary-button" onClick={onApprove}><Check size={14} /> Approve</button>}
        <button className="secondary-button" onClick={onSchedule}><CalendarDays size={14} /> Suggest date</button>
      </div>
    </div>
  );
}

export default function AssistantPage({
  user,
  material,
  setMaterial,
  artifact,
  setArtifact,
  onSaveAssessment,
  onScheduleEvents,
  difficulty,
  setDifficulty,
}) {
  const staff = isStaff(user?.role);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState('');
  const [session, setSession] = useState({ mode: 'tutor', difficulty, topics: [] });
  const [messages, setMessages] = useState([
    { sender: 'bot', text: `Hello ${user?.name?.split(' ')[0] || 'there'}. I am your learning assistant. Tell me what you are studying, ask a question, or upload notes and we can work through them together.`, time: nowTime() },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState({ quizzes: [], weakTopics: [] });
  const [llmStatus, setLlmStatus] = useState({ configured: false, label: 'Local fallback', hint: '' });
  const [spec, setSpec] = useState({
    count: 10,
    questionTypes: ['multiple-choice', 'true-false', 'short-answer'],
    marksPerQuestion: 2,
    totalMarks: 20,
    timeAllowed: '30 minutes',
    topicsInclude: '',
    topicsExclude: '',
  });
  const inputRef = useRef(null);
  const threadRef = useRef(null);
  const replaceRef = useRef(null);
  const abortRef = useRef(null);
  const bootPromptRef = useRef(false);

  useEffect(() => {
    api.get('/ai/status')
      .then((response) => setLlmStatus(response.data || { configured: false, label: 'Local fallback' }))
      .catch(() => setLlmStatus({ configured: false, label: 'Local fallback', hint: 'The AI server is not connected yet. Add an API key to generate ChatGPT or Gemini lesson content.' }));
  }, []);

  useEffect(() => {
    if (bootPromptRef.current) return;
    const prompt = sessionStorage.getItem('planwiseQuickPrompt');
    if (!prompt) return;
    bootPromptRef.current = true;
    sessionStorage.removeItem('planwiseQuickPrompt');
    setDraft(prompt);
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (!user?.id) return;
    api.get('/ai/conversations')
      .then((response) => {
        setConversations(response.data.conversations || []);
        setProgress(response.data.progress || { quizzes: [], weakTopics: [] });
      })
      .catch(() => {
        setConversations([]);
      });
  }, [user?.id]);

  function persistLocal(nextMessages, nextSession, id, title) {
    if (!user?.id) return;
    const record = { id: id || conversationId || makeId('convo'), title: title || nextSession.subject || 'Conversation', messages: nextMessages, session: nextSession, updatedAt: new Date().toISOString() };
    setConversations((current) => [record, ...current.filter((item) => item.id !== record.id)].slice(0, 20));
    setConversationId(record.id);
  }

  async function processFile(file) {
    if (!file) return;
    const ext = fileExtension(file.name);
    const placeholder = { id: makeId('file'), name: file.name, type: fileTypeLabel(file.name), size: file.size, status: 'uploading', progress: 8, text: '', error: '', analysis: null };
    setMaterial(placeholder);
    const bump = (value) => setMaterial((current) => current ? { ...current, progress: value, status: value < 100 ? 'processing' : current.status } : current);
    try {
      if (!ACCEPTED_EXTENSIONS.includes(ext)) throw new Error(`I couldn't process this document. Please upload a supported PDF, DOCX, PPTX or TXT file.`);
      bump(24);
      let text = await extractLocalDocument(file, bump);
      if (!text || !isReadableEducationalText(text)) {
        const contentBase64 = await fileToBase64(file);
        bump(60);
        const response = await api.post('/ai/extract', { fileName: file.name, mimeType: file.type, contentBase64 });
        text = response.data.text;
      }
      if (!isReadableEducationalText(text)) throw new Error(`I couldn't process this document. Please upload a supported PDF, DOCX, PPTX or TXT file with selectable text.`);
      bump(84);
      let analysis = fallbackAnalyze(text, file.name);
      try {
        const response = await api.post('/ai/analyze', { text, fileName: file.name });
        analysis = response.data;
      } catch (error) {
        if (error.response?.data?.error) analysis = { error: error.response.data.error };
      }
      if (analysis.error || !looksLikeReadablePhrase(analysis.topic)) {
        const message = analysis.error || `I opened ${file.name} but could not turn it into a readable lesson. Please upload a text-based file.`;
        setMaterial({ ...placeholder, status: 'error', progress: 100, error: message, text: '' });
        setMessages((current) => [...current, { sender: 'bot', text: message, time: nowTime() }]);
        return;
      }
      setMaterial({ ...placeholder, status: 'ready', progress: 100, text, error: '', analysis, wordCount: readableWordCount(text) });
      setSession((current) => ({ ...current, subject: analysis.topic, topics: analysis.keyConcepts || current.topics, materialName: file.name }));
      setArtifact({ kind: 'analysis', difficulty, analysis, usedSource: true });
      setMessages((current) => [...current, {
        sender: 'bot',
        text: `I've received your ${file.name}. I've processed the material and I'm ready to help you study it. You can ask me to explain topics, create revision notes, generate quizzes, create assignments, or build a study plan from the material.`,
        time: nowTime(),
      }]);
    } catch (error) {
      const message = error.response?.data?.error || error.message || `I couldn't process this document. Please upload a supported PDF, DOCX, PPTX or TXT file.`;
      setMaterial({ ...placeholder, status: 'error', progress: 100, error: message, text: '' });
      setMessages((current) => [...current, { sender: 'bot', text: `${message} I did not analyse this file.`, time: nowTime() }]);
    }
  }

  async function sendMessage(raw) {
    const prompt = String(raw || draft).trim();
    if (!prompt || busy) return;
    setDraft('');
    const history = messages.filter((item) => item.text).map((item) => ({ role: item.sender === 'user' ? 'user' : 'assistant', content: item.text }));
    const botId = makeId('bot');
    setMessages((current) => [...current, { sender: 'user', text: prompt, time: nowTime() }, { sender: 'bot', id: botId, text: '', time: nowTime(), streaming: true }]);
    setBusy(true);
    const sourceReady = material?.status === 'ready' && material.text;
    const payload = {
      message: prompt,
      history,
      materialText: sourceReady ? material.text : '',
      materialName: sourceReady ? material.name : '',
      difficulty,
      session,
      conversationId,
      profile: { id: user?.id, name: user?.name, role: user?.role },
      spec,
    };

    function applyResult(result) {
      if (!result) return;
      if (result.difficulty) setDifficulty(result.difficulty);
      if (result.session) setSession(result.session);
      if (result.conversationId) setConversationId(result.conversationId);
      if (result.progress) setProgress(result.progress);
      if (result.progressUpdate) {
        setProgress((current) => ({
          quizzes: [result.progressUpdate, ...(current.quizzes || [])],
          weakTopics: [...new Set([...(result.progressUpdate.weakTopics || []), ...(current.weakTopics || [])])],
        }));
      }
      if (result.assessment || result.content || result.analysis) {
        setArtifact({
          kind: result.kind,
          difficulty: result.difficulty || difficulty,
          assessment: result.assessment || null,
          content: result.content || null,
          analysis: result.analysis || material?.analysis || null,
          usedSource: result.usedSource,
        });
      }
      if (result.calendarSuggestions?.length) onScheduleEvents(result.calendarSuggestions);
      setMessages((current) => {
        const next = current.map((item) => item.id === botId ? {
          ...item,
          text: result.reply || item.text,
          streaming: false,
          quizPrompt: result.quizPrompt || null,
          quizSummary: result.quizSummary || null,
        } : item);
        persistLocal(next, result.session || session, result.conversationId, result.conversationTitle);
        return next;
      });
    }

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
          const dataLine = frame.split('\n').filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('');
          if (!event || !dataLine) return;
          const data = JSON.parse(dataLine);
          if (event === 'delta') {
            setMessages((current) => current.map((item) => item.id === botId ? { ...item, text: `${item.text || ''}${typeof data === 'string' ? data : ''}`, streaming: true } : item));
          }
          if (event === 'meta' && typeof data === 'object') finalResult = { ...(finalResult || {}), ...data };
          if (event === 'done') finalResult = { ...(finalResult || {}), ...data };
          if (event === 'saved') finalResult = { ...(finalResult || {}), ...data };
        });
      }
      applyResult(finalResult || { reply: '', session });
    } catch (error) {
      if (error.name === 'AbortError') {
        setMessages((current) => current.map((item) => item.id === botId ? { ...item, streaming: false, text: item.text || 'Generation stopped.' } : item));
      } else {
        const result = converse({
          message: prompt,
          history,
          profile: user,
          session,
          materialText: sourceReady ? material.text : '',
          materialName: sourceReady ? material.name : '',
          difficulty,
          spec,
          progress,
        });
        applyResult(result);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  function startNewConversation() {
    setConversationId('');
    setSession({ mode: 'tutor', difficulty, topics: [] });
    setArtifact(null);
    setMessages([{ sender: 'bot', text: `New conversation started. What would you like to work on, ${user?.name?.split(' ')[0] || 'there'}?`, time: nowTime() }]);
  }

  async function loadConversation(item) {
    try {
      const response = await api.get(`/ai/conversations/${item.id}`);
      const convo = response.data.conversation || item;
      setConversationId(convo.id);
      setSession(convo.session || { mode: 'tutor', difficulty, topics: [] });
      setMessages((convo.messages || []).map((entry) => ({
        sender: entry.role === 'user' ? 'user' : 'bot',
        text: entry.content || entry.text,
        time: entry.time ? new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : nowTime(),
      })));
    } catch {
      setConversationId(item.id);
      setSession(item.session || { mode: 'tutor', difficulty, topics: [] });
      setMessages((item.messages || []).map((entry) => ({
        sender: entry.role === 'user' ? 'user' : 'bot',
        text: entry.content || entry.text,
        time: nowTime(),
      })));
    }
  }

  const prompts = staff
    ? ['Create a lesson plan from this.', 'Create an assignment.', 'Create a quiz.', 'Schedule this for Friday.']
    : ['I have an exam coming up.', 'Explain this topic.', 'Quiz me on this.', 'Create a study plan.', 'Summarise my notes.'];

  return (
    <section className="assistant-page tutor-page">
      <div className="assistant-hero">
        <div>
          <span className="section-kicker">PERSONAL LEARNING ASSISTANT</span>
          <h1>Talk with PlanWise AI</h1>
          <p>Ask naturally, upload notes, change difficulty, take a live quiz, and keep the same conversation going.</p>
          <span className={llmStatus.configured ? 'ready-chip' : 'muted-chip'}>{llmStatus.configured ? `Connected: ${llmStatus.label}` : 'Add a ChatGPT, Gemini, or GitHub token in .env to generate real lesson content'}</span>
        </div>
        <button className="secondary-button" onClick={startNewConversation}><Plus size={15} /> New conversation</button>
      </div>

      <div className="assistant-shell tutor-shell">
        <aside className="assistant-sidebar panel-card">
          <div className="panel-head"><h3>Conversations</h3></div>
          <div className="conversation-list">
            {conversations.length ? conversations.map((item) => (
              <button type="button" key={item.id} className={`conversation-item ${conversationId === item.id ? 'active' : ''}`} onClick={() => loadConversation(item)}>
                <strong>{item.title || 'Conversation'}</strong>
                <small>{item.preview || 'Continue this chat'}</small>
              </button>
            )) : <p className="muted-text">Your chats will appear here.</p>}
          </div>

          <div className="panel-head"><h3>Mode</h3></div>
          <div className="choice-group wrap">
            {LEARNING_MODES.map((mode) => (
              <button key={mode.id} className={`choice-btn ${session.mode === mode.id ? 'active' : ''}`} onClick={() => {
                setSession((current) => ({ ...current, mode: mode.id }));
              }}>{mode.label}</button>
            ))}
          </div>

          <div className="difficulty-box">
            <h4>Learning level</h4>
            <div className="choice-group wrap">
              {DIFFICULTY_LEVELS.map((level) => (
                <button key={level} className={`choice-btn ${difficulty === level ? 'active' : ''}`} onClick={() => { setDifficulty(level); setSession((current) => ({ ...current, difficulty: level })); }}>{level}</button>
              ))}
            </div>
          </div>

          <div
            className={`ai-dropzone ${dragOver ? 'is-over' : ''} ${material?.status === 'error' ? 'has-error' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => { event.preventDefault(); setDragOver(false); processFile(event.dataTransfer.files?.[0]); }}
          >
            <UploadCloud size={22} />
            <strong>Upload notes</strong>
            <span>PDF, Word, PowerPoint, TXT</span>
            <input ref={inputRef} type="file" accept={ACCEPT_ATTR} onChange={(event) => processFile(event.target.files?.[0])} />
          </div>
          {material && (
            <div className={`file-status-card ${material.status}`}>
              <div className="file-status-top">
                <FileText size={16} />
                <div>
                  <strong>{material.name}</strong>
                  <small>{material.type} · {formatSize(material.size)}{material.wordCount ? ` · ${material.wordCount} words` : ''}</small>
                </div>
              </div>
              <div className="upload-progress"><span style={{ width: `${material.progress || 0}%` }} /></div>
              <em>{material.status === 'ready' ? 'Processed and attached to this chat.' : material.status === 'error' ? material.error : 'Processing…'}</em>
              <div className="file-status-actions">
                <button type="button" onClick={() => replaceRef.current?.click()}><RefreshCw size={13} /> Replace</button>
                <button type="button" onClick={() => { setMaterial(null); setMessages((current) => [...current, { sender: 'bot', text: 'I removed the file from this session and will not use it unless you upload another.', time: nowTime() }]); }}><Trash2 size={13} /> Remove</button>
                <input ref={replaceRef} type="file" accept={ACCEPT_ATTR} onChange={(event) => processFile(event.target.files?.[0])} hidden />
              </div>
            </div>
          )}

          {staff && (
            <div className="spec-box">
              <h4>Class generation options</h4>
              <label className="field"><span>Questions</span><input type="number" min="1" max="40" value={spec.count} onChange={(event) => setSpec({ ...spec, count: Number(event.target.value) })} /></label>
              <label className="field"><span>Marks each</span><input type="number" min="1" value={spec.marksPerQuestion} onChange={(event) => setSpec({ ...spec, marksPerQuestion: Number(event.target.value) })} /></label>
              <label className="field"><span>Time allowed</span><input value={spec.timeAllowed} onChange={(event) => setSpec({ ...spec, timeAllowed: event.target.value })} /></label>
              <div className="choice-group wrap">
                {QUESTION_TYPES.map((type) => (
                  <button key={type.id} className={`choice-btn ${spec.questionTypes.includes(type.id) ? 'active' : ''}`} onClick={() => setSpec((current) => {
                    const exists = current.questionTypes.includes(type.id);
                    const questionTypes = exists ? current.questionTypes.filter((item) => item !== type.id) : [...current.questionTypes, type.id];
                    return { ...current, questionTypes: questionTypes.length ? questionTypes : [type.id] };
                  })}>{type.label}</button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div className="chat-panel panel-card">
          <div className="panel-head">
            <h3><MessageSquareText size={16} /> {session.subject || 'AI Teaching Assistant'}</h3>
            <span className={material?.status === 'ready' ? 'ready-chip' : 'muted-chip'}>
              {material?.status === 'ready' ? <><CheckCircle2 size={13} /> {material.name}</> : `${session.mode} mode`}
            </span>
          </div>
          <div className="prompt-pills">
            {prompts.map((prompt) => (
              <button key={prompt} className="prompt-pill" onClick={() => sendMessage(prompt)}>{prompt}</button>
            ))}
          </div>
          <div className="chat-messages" ref={threadRef}>
            {messages.map((message, index) => (
              <div key={`${message.time}-${index}`} className={`chat-message ${message.sender}`}>
                <div className={`chat-bubble ${message.sender === 'bot' ? 'rich-text' : ''}`}>
                  {message.sender === 'bot' ? <RichText text={message.text} /> : message.text}
                  {message.streaming && !message.text ? <Loader2 size={14} className="spin" /> : null}
                </div>
                {message.quizPrompt?.options?.length ? (
                  <div className="quiz-options">
                    {message.quizPrompt.options.map((option, optionIndex) => (
                      <button key={`${option}-${optionIndex}`} className="secondary-button" onClick={() => sendMessage(option)}>{String.fromCharCode(65 + optionIndex)}. {option}</button>
                    ))}
                  </div>
                ) : null}
                {message.quizSummary ? (
                  <div className="quiz-summary">
                    <strong>Score {message.quizSummary.score}/{message.quizSummary.questions.length} ({message.quizSummary.percent}%)</strong>
                    <span>Weak topics: {(message.quizSummary.weakTopics || []).join(', ') || 'None'}</span>
                  </div>
                ) : null}
                <small>{message.time}</small>
              </div>
            ))}
            {busy && !messages.some((item) => item.streaming) && <div className="chat-message bot"><div className="chat-bubble thinking"><Loader2 size={14} className="spin" /> Thinking about your last message…</div></div>}
          </div>
          <div className="composer">
            {material?.status === 'ready' && (
              <div className="attach-preview">
                <FileText size={14} />
                <span>{material.name}</span>
                <small>attached to this chat</small>
              </div>
            )}
            <button className="icon-button" type="button" aria-label="Attach file" onClick={() => inputRef.current?.click()}><Paperclip size={16} /></button>
            <textarea
              className="composer-input"
              rows={2}
              value={draft}
              placeholder="Talk naturally. Shift+Enter for a new line."
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
            />
            {busy ? (
              <button className="secondary-button" type="button" onClick={stopGeneration}><Square size={14} /> Stop</button>
            ) : (
              <button className="primary-button" onClick={() => sendMessage()} disabled={!draft.trim()}><Send size={15} /> Send</button>
            )}
          </div>
        </div>
      </div>

      {material?.status === 'error' && <div className="error-box ai-error"><AlertCircle size={16} /> {material.error}</div>}

      {staff && (
        <ArtifactEditor
          artifact={artifact}
          onChange={setArtifact}
          onRegenerate={() => sendMessage(`Regenerate this ${artifact?.kind || 'content'} at ${difficulty} level.`)}
          onApprove={() => {
            if (artifact?.assessment) onSaveAssessment({ ...artifact.assessment, status: 'approved' });
            setMessages((current) => [...current, { sender: 'bot', text: 'Draft approved. You still have full control to edit or publish it.', time: nowTime() }]);
          }}
          onPublish={() => {
            if (!artifact?.assessment) return;
            onSaveAssessment({ ...artifact.assessment, status: 'published' });
            setMessages((current) => [...current, { sender: 'bot', text: 'Published to Assessments. Students will only see it from there.', time: nowTime() }]);
          }}
          onSchedule={() => {
            const suggestions = artifact?.assessment
              ? suggestCalendarFromAssessment(artifact.assessment)
              : [{ id: makeId('event'), title: artifact?.content?.title || session.subject || 'AI learning session', description: 'Suggested from the AI assistant. Fully editable.', type: 'lesson', date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), startTime: '09:00', endTime: '11:00', status: 'suggested', source: 'ai' }];
            onScheduleEvents(suggestions);
            setMessages((current) => [...current, { sender: 'bot', text: 'I added a suggested calendar entry. Open Calendar to edit or delete it.', time: nowTime() }]);
          }}
        />
      )}
    </section>
  );
}
