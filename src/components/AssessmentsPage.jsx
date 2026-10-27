import { useMemo, useRef, useState } from 'react';
import { Check, ClipboardCheck, FileUp, FolderOpen, Plus, Trash2, X } from 'lucide-react';
import { DIFFICULTY_LEVELS, QUESTION_TYPES, suggestCalendarFromAssessment } from '../../shared/learningEngine.js';
import { resourceApi } from '../services/api.js';
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

export default function AssessmentsPage({
  assessments,
  quizzes = [],
  resources = [],
  courses = [],
  difficulty,
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
  const fileInputRef = useRef(null);

  const selected = useMemo(
    () => library.find((item) => item.id === selectedId) || library[0] || null,
    [library, selectedId],
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
    try {
      let documentIds = [];
      if (materialSource === 'upload') {
        documentIds = await ensureUploadedDocumentIds();
      } else {
        documentIds = [...selectedResourceIds];
        if (!documentIds.length) {
          throw new Error('Select at least one course or subject file.');
        }
      }

      const result = await onGenerate({
        ...generator,
        documentId: documentIds[0],
        documentIds,
      });
      setSelectedId(result.id);
      if (materialSource === 'upload') {
        setPendingFiles([]);
        setUploadedResources([]);
      }
    } catch (err) {
      setError(err.message || 'The AI could not generate questions.');
    } finally {
      setBusy(false);
    }
  }

  function updateQuestion(questionId, patch) {
    if (!selected) return;
    const questions = selected.questions.map((question) => (question.id === questionId ? { ...question, ...patch } : question));
    onSave({ ...selected, questions, totalMarks: questions.reduce((sum, item) => sum + Number(item.marks || 0), 0) });
  }

  return (
    <section className="account-page assessments-page">
      <div className="account-heading">
        <div>
          <span className="section-kicker">ASSESSMENT STUDIO</span>
          <h1>AI-generated assessments</h1>
          <p>Create quizzes and tests from uploaded course materials, then edit every question before publishing.</p>
        </div>
      </div>

      <div className="assessments-with-ai">
        <div className="assessments-layout">
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
            <button className="primary-button" type="submit" disabled={busy || !materialSource}>
              <Plus size={15} /> {busy ? 'Generating...' : 'Generate with AI'}
            </button>
          </form>

          <div className="panel-card assessment-list">
            <div className="panel-head"><h3>Your assessments</h3></div>
            {library.length ? library.map((item) => (
              <button type="button" className={`assessment-row ${selected?.id === item.id ? 'active' : ''}`} key={item.id} onClick={() => setSelectedId(item.id)}>
                <strong>{item.title}</strong>
                <small>{item.difficulty} · {item.questions?.length || 0} questions · {item.status}</small>
              </button>
            )) : <p className="muted-text">No assessments yet.</p>}
          </div>
        </div>
      </div>

      {selected && (
        <div className="panel-card assessment-editor">
          <div className="panel-head">
            <div>
              <span className="section-kicker">{selected.status}</span>
              <h3>{selected.title}</h3>
            </div>
            <div className="plan-actions">
              <button className="secondary-button" onClick={() => onSave({ ...selected, status: 'approved' })}><Check size={14} /> Approve</button>
              <button className="primary-button" onClick={() => onSave({ ...selected, status: 'published' })}><ClipboardCheck size={14} /> Publish</button>
              <button className="secondary-button" onClick={() => onSchedule(suggestCalendarFromAssessment(selected))}><ClipboardCheck size={14} /> Suggest date</button>
              <button className="secondary-button danger" onClick={() => onDelete(selected)}><Trash2 size={14} /> Delete</button>
            </div>
          </div>
          <label className="field"><span>Title</span><input value={selected.title} onChange={(event) => onSave({ ...selected, title: event.target.value })} /></label>
          <div className="review-meta">
            <span>{selected.questions.length} questions</span>
            <span>{selected.totalMarks} marks</span>
            <span>{selected.timeAllowed}</span>
            <span>{selected.sourceFile || 'Uploaded material'}</span>
          </div>
          {selected.questions.map((question, index) => (
            <div className="question-card" key={question.id}>
              <div className="question-card-head">
                <strong>Q{index + 1}. {question.type.replace('-', ' ')}</strong>
                <input className="marks-input" type="number" min="1" value={question.marks} onChange={(event) => updateQuestion(question.id, { marks: Number(event.target.value) })} />
              </div>
              <textarea rows={3} value={question.prompt} onChange={(event) => updateQuestion(question.id, { prompt: event.target.value })} />
              {question.options?.length ? question.options.map((option, optionIndex) => (
                <label className="option-inline" key={`${question.id}-${optionIndex}`}>
                  <input type="radio" name={`sel-${question.id}`} checked={question.answer === option} onChange={() => updateQuestion(question.id, { answer: option })} />
                  <input value={option} onChange={(event) => {
                    const options = question.options.map((item, idx) => (idx === optionIndex ? event.target.value : item));
                    updateQuestion(question.id, { options, answer: question.answer === option ? event.target.value : question.answer });
                  }} />
                </label>
              )) : <textarea rows={2} value={question.answer} onChange={(event) => updateQuestion(question.id, { answer: event.target.value })} />}
              {question.sourceExcerpt ? <small className="source-excerpt">From source: {question.sourceExcerpt}</small> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
