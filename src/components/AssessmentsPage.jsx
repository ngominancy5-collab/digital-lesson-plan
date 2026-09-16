import { useMemo, useState } from 'react';
import { Check, ClipboardCheck, Plus, Trash2, Wand2 } from 'lucide-react';
import { DIFFICULTY_LEVELS, QUESTION_TYPES, buildAssessmentFromMaterial, suggestCalendarFromAssessment } from '../../shared/learningEngine.js';

export default function AssessmentsPage({ assessments, material, difficulty, onSave, onDelete, onSchedule, onOpenAssistant }) {
  const [selectedId, setSelectedId] = useState(assessments[0]?.id || '');
  const [generator, setGenerator] = useState({
    count: 10,
    difficulty: difficulty || 'Intermediate',
    questionTypes: ['multiple-choice', 'true-false', 'short-answer'],
    marksPerQuestion: 2,
    totalMarks: 20,
    timeAllowed: '40 minutes',
    topicsInclude: '',
    topicsExclude: '',
    kind: 'quiz',
  });
  const [error, setError] = useState('');

  const selected = useMemo(
    () => assessments.find((item) => item.id === selectedId) || assessments[0] || null,
    [assessments, selectedId],
  );

  function toggleType(id) {
    setGenerator((current) => {
      const exists = current.questionTypes.includes(id);
      const questionTypes = exists ? current.questionTypes.filter((item) => item !== id) : [...current.questionTypes, id];
      return { ...current, questionTypes: questionTypes.length ? questionTypes : [id] };
    });
  }

  function generate(event) {
    event.preventDefault();
    if (material?.status !== 'ready' || !material.text) {
      setError('Upload and process a learning file in the AI Assistant first. Assessments are generated from that source, not from generic questions.');
      return;
    }
    const result = buildAssessmentFromMaterial({
      text: material.text,
      fileName: material.name,
      kind: generator.kind,
      difficulty: generator.difficulty,
      count: generator.count,
      questionTypes: generator.questionTypes,
      marksPerQuestion: generator.marksPerQuestion,
      totalMarks: generator.totalMarks,
      timeAllowed: generator.timeAllowed,
      topicsInclude: generator.topicsInclude,
      topicsExclude: generator.topicsExclude,
    });
    if (result.error) { setError(result.error); return; }
    setError('');
    onSave({ ...result, status: 'draft' });
    setSelectedId(result.id);
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
        <button className="secondary-button" onClick={onOpenAssistant}><Wand2 size={15} /> Open AI Assistant</button>
      </div>

      <div className="assessments-layout">
        <form className="panel-card assessment-builder" onSubmit={generate}>
          <div className="panel-head"><h3>Generate from uploaded material</h3></div>
          <p className="muted-text">{material?.status === 'ready' ? `Source: ${material.name}` : 'No processed file yet. Upload notes in the AI Assistant, then generate here.'}</p>
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
            <label className="field"><span>Time allowed</span><input value={generator.timeAllowed} onChange={(event) => setGenerator({ ...generator, timeAllowed: event.target.value })} /></label>
            <label className="field"><span>Topics to include</span><input value={generator.topicsInclude} placeholder="Optional" onChange={(event) => setGenerator({ ...generator, topicsInclude: event.target.value })} /></label>
            <label className="field"><span>Topics to exclude</span><input value={generator.topicsExclude} placeholder="Optional" onChange={(event) => setGenerator({ ...generator, topicsExclude: event.target.value })} /></label>
          </div>
          <div className="choice-group wrap">
            {QUESTION_TYPES.map((type) => (
              <button type="button" key={type.id} className={`choice-btn ${generator.questionTypes.includes(type.id) ? 'active' : ''}`} onClick={() => toggleType(type.id)}>{type.label}</button>
            ))}
          </div>
          {error ? <div className="error-box">{error}</div> : null}
          <button className="primary-button" type="submit"><Plus size={15} /> Generate assessment</button>
        </form>

        <div className="panel-card assessment-list">
          <div className="panel-head"><h3>Your assessments</h3></div>
          {assessments.length ? assessments.map((item) => (
            <button type="button" className={`assessment-row ${selected?.id === item.id ? 'active' : ''}`} key={item.id} onClick={() => setSelectedId(item.id)}>
              <strong>{item.title}</strong>
              <small>{item.difficulty} · {item.questions?.length || 0} questions · {item.status}</small>
            </button>
          )) : <p className="muted-text">No assessments yet.</p>}
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
              <button className="secondary-button danger" onClick={() => onDelete(selected.id)}><Trash2 size={14} /> Delete</button>
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
