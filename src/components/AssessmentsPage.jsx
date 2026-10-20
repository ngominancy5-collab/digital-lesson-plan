import { useMemo, useState } from 'react';
import { Check, ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { DIFFICULTY_LEVELS, QUESTION_TYPES, suggestCalendarFromAssessment } from '../../shared/learningEngine.js';
import Notice from './Notice.jsx';

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

export default function AssessmentsPage({ assessments, quizzes = [], resources = [], courses = [], difficulty, onGenerate, onSave, onDelete, onSchedule }) {
  const library = [
    ...assessments.map((item) => ({ ...item, recordKind: 'assessment' })),
    ...quizzes.map(asQuiz),
  ];
  const [selectedId, setSelectedId] = useState(library[0]?.id || '');
  const [resourceId, setResourceId] = useState(resources[0]?.id || '');
  const [subjectName, setSubjectName] = useState('');
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

  const selected = useMemo(
    () => library.find((item) => item.id === selectedId) || library[0] || null,
    [library, selectedId],
  );

  function toggleType(id) {
    setGenerator((current) => {
      const exists = current.questionTypes.includes(id);
      const questionTypes = exists ? current.questionTypes.filter((item) => item !== id) : [...current.questionTypes, id];
      return { ...current, questionTypes: questionTypes.length ? questionTypes : [id] };
    });
  }

  async function generate(event) {
    event.preventDefault();
    if (!resourceId) {
      setError('Choose a saved resource. Questions are generated on the server from that file.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await onGenerate({ ...generator, documentId: resourceId });
      setSelectedId(result.id);
    } catch (err) {
      setError(err.message || 'The AI could not generate questions.');
    } finally {
      setBusy(false);
    }
  }

  function updateQuestion(questionId, patch) {
    if (!selected) return;
    const questions = selected.questions.map((question) => question.id === questionId ? { ...question, ...patch } : question);
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
          <label className="field"><span>Subject</span>
            <select value={subjectName} onChange={(event) => { setSubjectName(event.target.value); setResourceId(''); }}>
              <option value="">All subjects</option>
              {[...new Set([
                ...courses.map((course) => course.name),
                ...resources.map((item) => item.courseName),
              ].filter(Boolean))].map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="field"><span>Saved resource</span>
            <select value={resourceId} onChange={(event) => setResourceId(event.target.value)}>
              <option value="">Choose a resource</option>
              {resources
                .filter((item) => !subjectName || !item.courseName || item.courseName === subjectName)
                .map((item) => <option key={item.id} value={item.id}>{item.courseName ? `${item.courseName} · ` : ''}{item.fileName}</option>)}
            </select>
          </label>
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
          <button className="primary-button" type="submit" disabled={busy}><Plus size={15} /> {busy ? 'Generating...' : 'Generate with AI'}</button>
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
                    const options = question.options.map((item, idx) => idx === optionIndex ? event.target.value : item);
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
