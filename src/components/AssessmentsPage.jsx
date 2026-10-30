import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileUp, FolderOpen, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { DIFFICULTY_LEVELS, QUESTION_TYPES } from '../../shared/learningEngine.js';
import { downloadAssessmentPdf, downloadQuizPdf, resourceApi } from '../services/api.js';
import Notice from './Notice.jsx';

const ACCEPT = '.pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

function asQuiz(quiz) {
  return {
    ...quiz,
    recordKind: 'quiz',
    kind: 'quiz',
    status: quiz.status || 'saved',
    totalMarks: (quiz.questions || []).reduce((sum, item) => sum + Number(item.marks || 0), 0),
    timeAllowed: quiz.timeAllowed || '',
    questions: (quiz.questions || []).map((question) => ({
      id: question.id,
      type: question.questionType || question.type || 'multiple-choice',
      prompt: question.question || question.prompt || '',
      marks: question.marks,
      answer: question.correctAnswer || question.answer || '',
      options: (question.options || []).map((option) => (typeof option === 'string' ? option : option.optionText)),
    })),
  };
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return '—';
  }
}

function optionLetter(index) {
  return String.fromCharCode(65 + index);
}

function cloneAssessment(item) {
  if (!item) return null;
  return {
    ...item,
    questions: (item.questions || []).map((question) => ({
      ...question,
      options: Array.isArray(question.options) ? [...question.options] : [],
    })),
  };
}

function sectionMeta(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('true') || value.includes('false')) {
    return { key: 'true-false', title: 'TRUE / FALSE QUESTIONS', order: 1 };
  }
  if (value.includes('multiple') || value.includes('mcq') || value.includes('choice')) {
    return { key: 'multiple-choice', title: 'MULTIPLE-CHOICE QUESTIONS', order: 2 };
  }
  if (value.includes('short')) {
    return { key: 'short-answer', title: 'SHORT-ANSWER QUESTIONS', order: 3 };
  }
  if (value.includes('scenario')) {
    return { key: 'scenario', title: 'SCENARIO-BASED QUESTIONS', order: 4 };
  }
  if (value.includes('practical') || value.includes('application')) {
    return { key: 'practical', title: 'PRACTICAL / APPLICATION QUESTIONS', order: 5 };
  }
  if (value.includes('long') || value.includes('essay')) {
    return { key: 'essay', title: 'ESSAY / LONG-ANSWER QUESTIONS', order: 6 };
  }
  return { key: 'general', title: 'QUESTIONS', order: 7 };
}

function groupPaperSections(questions = []) {
  const map = new Map();
  questions.forEach((question) => {
    const meta = sectionMeta(question.type);
    if (!map.has(meta.key)) map.set(meta.key, { ...meta, questions: [] });
    map.get(meta.key).questions.push(question);
  });
  return [...map.values()].sort((a, b) => a.order - b.order);
}

export default function AssessmentsPage({
  assessments,
  quizzes = [],
  resources = [],
  courses = [],
  difficulty,
  user,
  onGenerate,
  onSave,
  onDelete,
  onSchedule,
  onResourcesChange,
  onNavigate,
}) {
  const library = [
    ...assessments.map((item) => ({ ...item, recordKind: 'assessment' })),
    ...quizzes.map(asQuiz),
  ];
  const [selectedId, setSelectedId] = useState(library[0]?.id || '');
  const [materialSource, setMaterialSource] = useState(''); // '' | 'upload' | 'existing'
  const [subjectName, setSubjectName] = useState('');
  const [selectedResourceIds, setSelectedResourceIds] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadedResources, setUploadedResources] = useState([]);
  const [busy, setBusy] = useState(false);
  const [generateProgress, setGenerateProgress] = useState({ percent: 0, label: '' });
  const [generator, setGenerator] = useState({
    count: 10,
    difficulty: difficulty || 'Intermediate',
    questionTypes: ['multiple-choice', 'true-false', 'short-answer'],
    marksPerQuestion: 2,
    totalMarks: 20,
    topicsInclude: '',
    topicsExclude: '',
    kind: 'quiz',
  });
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [editingPaper, setEditingPaper] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef(null);

  const selected = useMemo(
    () => library.find((item) => item.id === selectedId) || library[0] || null,
    [library, selectedId],
  );

  useEffect(() => {
    setDraft(cloneAssessment(selected));
    setSaveNotice('');
    setEditingPaper(false);
  }, [selectedId, selected?.updatedAt, selected?.id]);

  const paperSections = useMemo(
    () => groupPaperSections(draft?.questions || []),
    [draft?.questions],
  );

  const paperTotalMarks = useMemo(
    () => Number(draft?.totalMarks || draft?.marks)
      || (draft?.questions || []).reduce((sum, item) => sum + Number(item.marks || 0), 0),
    [draft],
  );

  const subjectOptions = useMemo(() => [...new Set([
    ...courses.map((course) => course.name),
    ...resources.map((item) => item.courseName),
  ].filter(Boolean))], [courses, resources]);

  const existingResources = useMemo(() => resources.filter((item) => {
    if (!subjectName) return true;
    return String(item.courseName || '').toLowerCase() === subjectName.trim().toLowerCase();
  }), [resources, subjectName]);

  function toggleType(id) {
    setGenerator((current) => {
      const exists = current.questionTypes.includes(id);
      const questionTypes = exists ? current.questionTypes.filter((item) => item !== id) : [...current.questionTypes, id];
      return { ...current, questionTypes: questionTypes.length ? questionTypes : [id] };
    });
  }

  function chooseSource(next) {
    setMaterialSource(next);
    setError('');
    if (next === 'upload') {
      setSelectedResourceIds([]);
    } else if (next === 'existing') {
      setPendingFiles([]);
      setUploadedResources([]);
    }
  }

  function onPickFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setPendingFiles((current) => {
      const names = new Set(current.map((file) => `${file.name}:${file.size}`));
      const next = [...current];
      files.forEach((file) => {
        const key = `${file.name}:${file.size}`;
        if (!names.has(key)) next.push(file);
      });
      return next;
    });
    setError('');
  }

  function removePendingFile(index) {
    setPendingFiles((current) => current.filter((_, i) => i !== index));
  }

  function toggleResource(id) {
    setSelectedResourceIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  async function ensureUploadedDocumentIds() {
    if (uploadedResources.length) {
      return uploadedResources.map((item) => item.id);
    }
    if (!pendingFiles.length) {
      throw new Error('Choose one or more files to upload.');
    }
    const created = [];
    for (const file of pendingFiles) {
      const resource = await resourceApi.upload(file, subjectName ? { courseName: subjectName } : {});
      created.push(resource);
    }
    setUploadedResources(created);
    if (typeof onResourcesChange === 'function') {
      await onResourcesChange();
    }
    return created.map((item) => item.id);
  }

  async function generate(event) {
    event.preventDefault();
    setError('');

    if (!materialSource) {
      setError('Choose where your assessment materials should come from.');
      return;
    }

    setBusy(true);
    setGenerateProgress({ percent: 8, label: 'Preparing your materials…' });
    let progressTimer;
    try {
      let documentIds = [];
      if (materialSource === 'upload') {
        setGenerateProgress({ percent: 18, label: 'Uploading selected files…' });
        documentIds = await ensureUploadedDocumentIds();
      } else {
        documentIds = [...selectedResourceIds];
        if (!documentIds.length) {
          throw new Error('Select at least one course or subject file.');
        }
      }

      setGenerateProgress({
        percent: 32,
        label: `Reading key content from ${documentIds.length} file${documentIds.length === 1 ? '' : 's'}…`,
      });
      const startedAt = Date.now();
      progressTimer = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const soft = Math.min(88, 38 + Math.floor(elapsed / 1800) * 6);
        const label = elapsed > 22000
          ? 'Almost there — finishing your questions…'
          : elapsed > 10000
            ? 'Writing questions from your materials…'
            : 'Asking AI to build your assessment…';
        setGenerateProgress((previous) => ({
          percent: Math.max(previous.percent || 38, soft),
          label,
        }));
      }, 1800);

      setGenerateProgress({ percent: 42, label: 'Asking AI to build your assessment…' });
      const result = await onGenerate({
        ...generator,
        documentId: documentIds[0],
        documentIds,
        courseName: subjectName || '',
        subjectName: subjectName || '',
        institution: user?.institution || '',
      });
      if (progressTimer) clearInterval(progressTimer);
      setGenerateProgress({ percent: 96, label: 'Saving assessment…' });
      setSelectedId(result.id);
      setEditingPaper(false);
      if (materialSource === 'upload') {
        setPendingFiles([]);
        setUploadedResources([]);
      }
      setGenerateProgress({ percent: 100, label: 'Assessment ready' });
    } catch (err) {
      if (progressTimer) clearInterval(progressTimer);
      setGenerateProgress({ percent: 0, label: '' });
      setError(err.message || 'The AI could not generate questions.');
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setBusy(false);
    }
  }

  function updateDraft(patch) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setSaveNotice('');
  }

  function updateQuestion(questionId, patch) {
    setDraft((current) => {
      if (!current) return current;
      const questions = (current.questions || []).map((question) => (
        question.id === questionId ? { ...question, ...patch } : question
      ));
      return {
        ...current,
        questions,
        totalMarks: questions.reduce((sum, item) => sum + Number(item.marks || 0), 0),
      };
    });
    setSaveNotice('');
  }

  function updateOption(questionId, optionIndex, nextValue) {
    setDraft((current) => {
      if (!current) return current;
      const questions = (current.questions || []).map((question) => {
        if (question.id !== questionId) return question;
        const previous = question.options[optionIndex];
        const options = question.options.map((item, idx) => (idx === optionIndex ? nextValue : item));
        const answer = question.answer === previous ? nextValue : question.answer;
        return { ...question, options, answer };
      });
      return { ...current, questions };
    });
    setSaveNotice('');
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...draft,
        totalMarks: (draft.questions || []).reduce((sum, item) => sum + Number(item.marks || 0), 0),
        meta: {
          ...(draft.meta || {}),
          courseName: draft.meta?.courseName || subjectName || '',
          institution: draft.meta?.institution || user?.institution || '',
        },
      });
      setSaveNotice('Changes saved.');
      setEditingPaper(false);
    } catch (err) {
      setError(err?.message || 'Could not save your edits.');
    } finally {
      setSaving(false);
    }
  }

  async function downloadPaper() {
    if (!draft?.id) {
      setError('Save the assessment before downloading the PDF.');
      return;
    }
    setDownloading(true);
    setError('');
    try {
      if (draft.recordKind === 'quiz') await downloadQuizPdf(draft.id);
      else await downloadAssessmentPdf(draft.id);
    } catch (err) {
      setError(err?.message || 'Could not download the assessment PDF.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="account-page assessments-page">
      <div className="account-heading">
        <div>
          <span className="section-kicker">ASSESSMENT STUDIO</span>
          <h1>AI-generated assessments</h1>
          <p>Generate a complete assessment paper from your course materials, preview it as a document, then download a printable PDF.</p>
        </div>
      </div>

      <div className="assessments-with-ai">
        <div className="assessments-layout">
          {busy ? (
            <div className="panel-card generation-screen assessment-generation-screen">
              <div className="loader-ring" />
              <h3>{generateProgress.label || 'Creating your assessment…'}</h3>
              <div
                className="lesson-plan-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={generateProgress.percent}
              >
                <div className="lesson-plan-progress-bar" style={{ width: `${generateProgress.percent}%` }} />
              </div>
              <strong className="lesson-plan-progress-label">{generateProgress.percent}%</strong>
            </div>
          ) : (
          <form className="panel-card assessment-builder" onSubmit={generate}>
            <div className="panel-head"><h3>Generate from uploaded material</h3></div>

            <div className="assessment-source-block">
              <p className="assessment-source-question">Where would you like to get your assessment materials from?</p>
              <div className="assessment-source-options" role="radiogroup" aria-label="Assessment material source">
                <button
                  type="button"
                  role="radio"
                  aria-checked={materialSource === 'upload'}
                  className={`assessment-source-card ${materialSource === 'upload' ? 'active' : ''}`}
                  onClick={() => chooseSource('upload')}
                >
                  <span className="assessment-source-icon" aria-hidden="true"><FileUp size={22} /></span>
                  <strong>Upload New Files</strong>
                  <span>Upload assessment materials directly from your device.</span>
                  <em className="assessment-source-cta">Click to select</em>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={materialSource === 'existing'}
                  className={`assessment-source-card ${materialSource === 'existing' ? 'active' : ''}`}
                  onClick={() => chooseSource('existing')}
                >
                  <span className="assessment-source-icon" aria-hidden="true"><FolderOpen size={22} /></span>
                  <strong>Use Existing Course/Subject Files</strong>
                  <span>Select materials you have already uploaded under Courses and Subjects.</span>
                  <em className="assessment-source-cta">Click to select</em>
                </button>
              </div>
            </div>

            {materialSource === 'upload' ? (
              <div className="assessment-source-panel">
                <label className="field">
                  <span>Subject (optional)</span>
                  <input
                    type="text"
                    list="assessment-subject-suggestions"
                    value={subjectName}
                    onChange={(event) => setSubjectName(event.target.value)}
                    placeholder="Type a subject name"
                    autoComplete="off"
                  />
                  <datalist id="assessment-subject-suggestions">
                    {subjectOptions.map((name) => <option key={name} value={name} />)}
                  </datalist>
                </label>
                <label className="field">
                  <span>Upload files</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPT}
                    onChange={(event) => {
                      onPickFiles(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </label>
                {pendingFiles.length ? (
                  <ul className="assessment-file-list">
                    {pendingFiles.map((file, index) => (
                      <li key={`${file.name}-${file.size}-${index}`}>
                        <div>
                          <strong>{file.name}</strong>
                          <small>{Math.max(1, Math.round(file.size / 1024))} KB · {file.type || 'file'}</small>
                        </div>
                        <button type="button" className="icon-button small" aria-label="Remove file" onClick={() => removePendingFile(index)}>
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-text">Supported: PDF, DOC, DOCX, TXT. You can select multiple files.</p>
                )}
                {uploadedResources.length ? (
                  <p className="muted-text">Ready: {uploadedResources.map((item) => item.fileName || item.originalName).join(', ')}</p>
                ) : null}
              </div>
            ) : null}

            {materialSource === 'existing' ? (
              <div className="assessment-source-panel">
                <label className="field">
                  <span>Course or subject</span>
                  <select
                    value={subjectName}
                    onChange={(event) => {
                      setSubjectName(event.target.value);
                      setSelectedResourceIds([]);
                    }}
                  >
                    <option value="">All courses / subjects</option>
                    {subjectOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>

                {existingResources.length ? (
                  <div className="assessment-existing-files">
                    {existingResources.map((item) => {
                      const checked = selectedResourceIds.includes(item.id);
                      return (
                        <label key={item.id} className={`assessment-existing-row ${checked ? 'active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleResource(item.id)}
                          />
                          <span>
                            <strong>{item.fileName || item.originalName || 'Untitled file'}</strong>
                            <small>
                              {(item.fileType || item.mimeType || 'file').toString()}
                              {' · '}
                              {item.courseName || 'No course'}
                              {' · '}
                              {formatDate(item.createdAt || item.uploadedAt)}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="assessment-empty-existing">
                    <p><strong>No existing files found.</strong></p>
                    <p className="muted-text">
                      Upload materials under Courses or Subjects first, or choose Upload New Files to continue directly.
                    </p>
                    {typeof onNavigate === 'function' ? (
                      <div className="assessment-empty-actions">
                        <button type="button" className="secondary-button" onClick={() => onNavigate('courses')}>Go to Courses / Subjects</button>
                        <button type="button" className="secondary-button" onClick={() => chooseSource('upload')}>Upload New Files</button>
                      </div>
                    ) : null}
                  </div>
                )}

                {existingResources.length ? (
                  <label className="field">
                    <span>Optional: also upload new files to include</span>
                    <input
                      type="file"
                      multiple
                      accept={ACCEPT}
                      onChange={async (event) => {
                        const files = Array.from(event.target.files || []);
                        event.target.value = '';
                        if (!files.length) return;
                        setBusy(true);
                        setError('');
                        try {
                          const createdIds = [];
                          for (const file of files) {
                            const resource = await resourceApi.upload(file, subjectName ? { courseName: subjectName } : {});
                            createdIds.push(resource.id);
                          }
                          if (typeof onResourcesChange === 'function') await onResourcesChange();
                          setSelectedResourceIds((current) => [...new Set([...current, ...createdIds])]);
                        } catch (err) {
                          setError(err.message || 'Could not upload the extra file.');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            <div className="grid-2">
              <label className="field"><span>Type</span>
                <select value={generator.kind} onChange={(event) => setGenerator({ ...generator, kind: event.target.value })}>
                  <option value="quiz">Quiz</option>
                  <option value="test">Test</option>
                  <option value="assessment">Assessment</option>
                  <option value="practice">Practice questions</option>
                </select>
              </label>
              <label className="field"><span>Difficulty</span>
                <select value={generator.difficulty} onChange={(event) => setGenerator({ ...generator, difficulty: event.target.value })}>
                  {DIFFICULTY_LEVELS.map((level) => <option key={level}>{level}</option>)}
                </select>
              </label>
              <label className="field"><span>Number of questions</span><input type="number" min="1" max="40" value={generator.count} onChange={(event) => setGenerator({ ...generator, count: Number(event.target.value) })} /></label>
              <label className="field"><span>Marks per question</span><input type="number" min="1" value={generator.marksPerQuestion} onChange={(event) => setGenerator({ ...generator, marksPerQuestion: Number(event.target.value) })} /></label>
              <label className="field"><span>Total marks</span><input type="number" min="1" value={generator.totalMarks} onChange={(event) => setGenerator({ ...generator, totalMarks: Number(event.target.value) })} /></label>
              <label className="field"><span>Topics to include</span><input value={generator.topicsInclude} placeholder="Optional" onChange={(event) => setGenerator({ ...generator, topicsInclude: event.target.value })} /></label>
              <label className="field"><span>Topics to exclude</span><input value={generator.topicsExclude} placeholder="Optional" onChange={(event) => setGenerator({ ...generator, topicsExclude: event.target.value })} /></label>
            </div>
            <div className="choice-group wrap">
              {QUESTION_TYPES.map((type) => (
                <button type="button" key={type.id} className={`choice-btn ${generator.questionTypes.includes(type.id) ? 'active' : ''}`} onClick={() => toggleType(type.id)}>{type.label}</button>
              ))}
            </div>
            {error ? <Notice message={error} /> : null}
            <button className="primary-button" type="submit" disabled={!materialSource}>
              <Plus size={15} /> Generate with AI
            </button>
          </form>
          )}
        </div>
      </div>

      {draft ? (
        <div className="assessment-paper-shell">
          <div className="panel-card assessment-paper-toolbar">
            <div>
              <span className="section-kicker">ASSESSMENT DOCUMENT</span>
              <h3>Document preview</h3>
              <p className="muted-text">Review the generated question paper, then download the full PDF for printing or distribution.</p>
            </div>
            <div className="plan-actions">
              <button type="button" className="primary-button" disabled={downloading} onClick={() => void downloadPaper()}>
                <Download size={14} /> {downloading ? 'Preparing PDF…' : 'Download Assessment'}
              </button>
              <button type="button" className="secondary-button" onClick={() => setEditingPaper((value) => !value)}>
                <Pencil size={14} /> {editingPaper ? 'Hide editor' : 'Edit before download'}
              </button>
              {editingPaper ? (
                <button type="button" className="secondary-button" disabled={saving} onClick={() => void saveDraft()}>
                  <Save size={14} /> {saving ? 'Saving…' : 'Save edits'}
                </button>
              ) : null}
              <button type="button" className="secondary-button danger" onClick={() => onDelete(draft)}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>

          {saveNotice ? <p className="assessment-save-notice">{saveNotice}</p> : null}
          {error ? <Notice message={error} /> : null}

          {editingPaper ? (
            <div className="panel-card assessment-edit-panel">
              <div className="grid-2">
                <label className="field assessment-edit-field">
                  <span>Assessment title</span>
                  <input value={draft.title || ''} onChange={(event) => updateDraft({ title: event.target.value })} />
                </label>
                <label className="field assessment-edit-field">
                  <span>Course / subject</span>
                  <input
                    value={draft.meta?.courseName || ''}
                    onChange={(event) => updateDraft({ meta: { ...(draft.meta || {}), courseName: event.target.value } })}
                  />
                </label>
                <label className="field assessment-edit-field">
                  <span>Course code</span>
                  <input
                    value={draft.meta?.courseCode || ''}
                    onChange={(event) => updateDraft({ meta: { ...(draft.meta || {}), courseCode: event.target.value } })}
                  />
                </label>
                <label className="field assessment-edit-field">
                  <span>Time allowed</span>
                  <input value={draft.timeAllowed || ''} onChange={(event) => updateDraft({ timeAllowed: event.target.value })} />
                </label>
              </div>
              <label className="field assessment-edit-field">
                <span>Instructions to candidates</span>
                <textarea
                  rows={3}
                  value={draft.instructions || ''}
                  onChange={(event) => updateDraft({ instructions: event.target.value })}
                />
              </label>
              {(draft.questions || []).map((question, index) => (
                <div className="assessment-edit-question" key={question.id || `edit-${index}`}>
                  <div className="question-card-head">
                    <strong>Question {index + 1}</strong>
                    <label className="marks-field">
                      <span>Marks</span>
                      <input
                        className="marks-input"
                        type="number"
                        min="1"
                        value={question.marks ?? 1}
                        onChange={(event) => updateQuestion(question.id, { marks: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                  <label className="field assessment-edit-field">
                    <span>Question text</span>
                    <textarea
                      rows={3}
                      value={question.prompt || ''}
                      onChange={(event) => updateQuestion(question.id, { prompt: event.target.value })}
                    />
                  </label>
                  {question.options?.length ? (
                    <div className="assessment-edit-options">
                      {question.options.map((option, optionIndex) => (
                        <label className="field assessment-edit-field" key={`${question.id}-opt-${optionIndex}`}>
                          <span>Option {optionLetter(optionIndex)}</span>
                          <input
                            value={option}
                            onChange={(event) => updateOption(question.id, optionIndex, event.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <article className="assessment-paper-preview" aria-label="Assessment document preview">
            <header className="assessment-paper-header">
              <p className="assessment-paper-institution">
                {draft.meta?.institution || user?.institution || 'PlanWise AI Assessment'}
              </p>
              <h2>{draft.title || 'Untitled assessment'}</h2>
              <dl className="assessment-paper-meta">
                {(draft.meta?.courseName || draft.meta?.courseCode) ? (
                  <div>
                    <dt>Course</dt>
                    <dd>{[draft.meta?.courseName, draft.meta?.courseCode].filter(Boolean).join(' · ')}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Assessment type</dt>
                  <dd>{String(draft.kind || draft.type || 'assessment').replace(/-/g, ' ')}</dd>
                </div>
                {draft.difficulty || draft.meta?.difficulty ? (
                  <div>
                    <dt>Difficulty</dt>
                    <dd>{draft.difficulty || draft.meta?.difficulty}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Date</dt>
                  <dd>{formatDate(draft.dueDate || draft.createdAt)}</dd>
                </div>
                {draft.timeAllowed ? (
                  <div>
                    <dt>Time allowed</dt>
                    <dd>{draft.timeAllowed}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Total marks</dt>
                  <dd>{paperTotalMarks}</dd>
                </div>
              </dl>
            </header>

            <section className="assessment-paper-instructions">
              <h3>Instructions to candidates</h3>
              <p>{draft.instructions || 'Answer all questions. Show your working where required.'}</p>
            </section>

            {paperSections.map((section, sectionIndex) => {
              const sectionMarks = section.questions.reduce((sum, item) => sum + Number(item.marks || 0), 0);
              const sectionLetter = optionLetter(sectionIndex);
              let runningNumber = paperSections
                .slice(0, sectionIndex)
                .reduce((sum, item) => sum + item.questions.length, 0);
              return (
                <section className="assessment-paper-section" key={section.key}>
                  <h3>SECTION {sectionLetter}: {section.title}</h3>
                  <p className="assessment-paper-section-note">
                    Answer all questions in this section. This section carries {sectionMarks} mark{sectionMarks === 1 ? '' : 's'}.
                  </p>
                  {section.questions.map((question) => {
                    runningNumber += 1;
                    const marks = Number(question.marks || 1);
                    return (
                      <div className="assessment-paper-question" key={question.id || `paper-q-${runningNumber}`}>
                        <h4>
                          Question {runningNumber}
                          <span> ({marks} Mark{marks === 1 ? '' : 's'})</span>
                        </h4>
                        <p className="assessment-paper-prompt">{question.prompt}</p>
                        {question.options?.length ? (
                          <ol className="assessment-paper-options" type="A">
                            {question.options.map((option, optionIndex) => (
                              <li key={`${question.id}-${optionIndex}`}>
                                <span className="assessment-paper-option-letter">{optionLetter(optionIndex)}.</span>
                                <span>{option}</span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <div className="assessment-paper-answer-lines" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </article>
        </div>
      ) : null}
    </section>
  );
}
