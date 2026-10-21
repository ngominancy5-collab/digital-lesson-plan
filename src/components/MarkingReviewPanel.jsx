import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Pencil,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { markingApi } from '../services/api.js';
import Notice from './Notice.jsx';

function clamp(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Number(max) || 0, n));
}

function statusFromMarks(awarded, available) {
  if (awarded >= available && available > 0) return 'correct';
  if (awarded > 0) return 'partial';
  return 'incorrect';
}

function summarize(questions) {
  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marksAvailable) || 0), 0);
  const obtained = questions.reduce((sum, q) => sum + (Number(q.marksAwarded) || 0), 0);
  const aiObtained = questions.reduce((sum, q) => sum + (Number(q.aiMarksAwarded) || 0), 0);
  const percentage = totalMarks ? Math.round((obtained / totalMarks) * 1000) / 10 : 0;
  const reviewedCount = questions.filter((q) => q.reviewed).length;
  return {
    totalMarks,
    obtained,
    aiObtained,
    percentage,
    reviewedCount,
    unreviewedCount: Math.max(0, questions.length - reviewedCount),
  };
}

export default function MarkingReviewPanel({
  paper,
  onClose,
  onSaved,
  onFinalized,
}) {
  const [questions, setQuestions] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [activeId, setActiveId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const locked = paper?.reviewStatus === 'finalized';

  useEffect(() => {
    const rows = (paper?.questions || []).map((item, index) => ({
      ...item,
      id: item.id || `q-${index}`,
      aiMarksAwarded: item.aiMarksAwarded != null ? item.aiMarksAwarded : item.marksAwarded,
      marksAwarded: item.marksAwarded != null ? item.marksAwarded : item.aiMarksAwarded,
      feedback: item.feedback || item.aiFeedback || '',
      markerComment: item.markerComment || '',
      reviewed: Boolean(item.reviewed),
      questionText: item.questionText || `Question ${item.number || index + 1}`,
      aiExplanation: item.aiExplanation || item.aiFeedback || item.feedback || '',
    }));
    setQuestions(rows);
    setFeedback(paper?.feedback || paper?.aiFeedback || '');
    setActiveId(rows[0]?.id || '');
    setConfirmFinalize(false);
    setError('');
    setNotice('');
  }, [paper?.id, paper?.updatedAt, paper?.reviewStatus]);

  const totals = useMemo(() => summarize(questions), [questions]);
  const active = questions.find((q) => q.id === activeId) || questions[0];

  function updateQuestion(id, patch) {
    if (locked) return;
    setQuestions((current) => current.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      next.marksAwarded = clamp(next.marksAwarded, next.marksAvailable);
      next.status = statusFromMarks(next.marksAwarded, next.marksAvailable);
      return next;
    }));
  }

  function confirmAiMark(id) {
    const q = questions.find((item) => item.id === id);
    if (!q) return;
    updateQuestion(id, {
      marksAwarded: q.aiMarksAwarded,
      feedback: q.aiFeedback || q.feedback,
      reviewed: true,
      adjustmentReason: 'confirm',
    });
  }

  function awardPartial(id) {
    const q = questions.find((item) => item.id === id);
    if (!q) return;
    const half = Math.round((q.marksAvailable / 2) * 10) / 10;
    updateQuestion(id, {
      marksAwarded: half,
      reviewed: true,
      adjustmentReason: 'partial',
      markerComment: q.markerComment || 'Partial credit awarded by marker.',
    });
  }

  function awardFullAlternative(id) {
    const q = questions.find((item) => item.id === id);
    if (!q) return;
    updateQuestion(id, {
      marksAwarded: q.marksAvailable,
      reviewed: true,
      adjustmentReason: 'alternative',
      markerComment: q.markerComment || 'Accepted as a valid alternative answer.',
    });
  }

  function overrideZero(id) {
    const q = questions.find((item) => item.id === id);
    if (!q) return;
    const suggested = q.marksAvailable > 0 ? Math.max(1, Math.round(q.marksAvailable * 0.4)) : 0;
    updateQuestion(id, {
      marksAwarded: suggested,
      reviewed: true,
      adjustmentReason: 'override',
      markerComment: q.markerComment || 'Overrode AI zero / low mark.',
    });
  }

  async function saveDraft() {
    if (!paper?.id || locked) return;
    setBusy('draft');
    setError('');
    setNotice('');
    try {
      const saved = await markingApi.saveDraft(paper.id, { questions, feedback });
      setNotice('Draft saved. You can resume this review later.');
      onSaved?.(saved);
    } catch (err) {
      setError(err.message || 'Could not save draft.');
    } finally {
      setBusy('');
    }
  }

  async function finalize() {
    if (!paper?.id || locked) return;
    if (!confirmFinalize) {
      setConfirmFinalize(true);
      return;
    }
    setBusy('finalize');
    setError('');
    setNotice('');
    try {
      const saved = await markingApi.finalize(paper.id, { questions, feedback });
      setNotice('Results finalized successfully. Final marks reflect your decisions.');
      setConfirmFinalize(false);
      onFinalized?.(saved);
    } catch (err) {
      setError(err.message || 'Could not finalize results.');
    } finally {
      setBusy('');
    }
  }

  async function reopen() {
    if (!paper?.id) return;
    setBusy('reopen');
    setError('');
    try {
      const saved = await markingApi.reopen(paper.id);
      setNotice('Marking reopened for correction.');
      onSaved?.(saved);
    } catch (err) {
      setError(err.message || 'Could not reopen marking.');
    } finally {
      setBusy('');
    }
  }

  if (!paper || !active) {
    return (
      <div className="panel-card marking-review-panel">
        <p className="muted-text">No marking result to review yet.</p>
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
      </div>
    );
  }

  return (
    <div className="panel-card marking-review-panel">
      <div className="marking-review-header">
        <div>
          <span className="glass-kicker">Teacher / lecturer review</span>
          <h2>Review &amp; Confirm Marks</h2>
          <p>
            AI suggestions are guidance only. Your final marks take priority.
            {' '}
            Status: <strong>{paper.reviewStatus || paper.status}</strong>
          </p>
        </div>
        <button type="button" className="text-button" onClick={onClose}>Close review</button>
      </div>

      {error ? <Notice message={error} onDismiss={() => setError('')} /> : null}
      {notice ? (
        <p className="paper-mark-progress-success"><CheckCircle2 size={15} /> {notice}</p>
      ) : null}

      <div className="marking-review-summary">
        <table className="paper-mark-table">
          <thead>
            <tr>
              <th>Question</th>
              <th>AI Mark</th>
              <th>Final Mark</th>
              <th>Maximum</th>
              <th>Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q.id} className={q.id === active.id ? 'is-active-row' : ''}>
                <td>
                  <button type="button" className="text-button" onClick={() => setActiveId(q.id)}>
                    Q{q.number}
                  </button>
                </td>
                <td>{q.aiMarksAwarded}</td>
                <td><strong>{q.marksAwarded}</strong></td>
                <td>{q.marksAvailable}</td>
                <td>{q.reviewed ? <Check size={14} /> : '—'}</td>
              </tr>
            ))}
            <tr>
              <td><strong>Total</strong></td>
              <td>{totals.aiObtained}</td>
              <td><strong>{totals.obtained}</strong></td>
              <td>{totals.totalMarks}</td>
              <td>{totals.reviewedCount}/{questions.length}</td>
            </tr>
          </tbody>
        </table>
        <p className="marking-review-percent">
          Final percentage: <strong>{totals.percentage}%</strong>
          {' '}(from your marks, not AI alone)
        </p>
        {totals.unreviewedCount > 0 && !locked ? (
          <p className="muted-text">{totals.unreviewedCount} question(s) not yet marked as reviewed.</p>
        ) : null}
      </div>

      <div className="marking-review-body">
        <aside className="marking-review-nav">
          {questions.map((q) => (
            <button
              key={q.id}
              type="button"
              className={`marking-q-nav ${q.id === active.id ? 'active' : ''} ${q.reviewed ? 'reviewed' : ''}`}
              onClick={() => setActiveId(q.id)}
            >
              Q{q.number}
              <small>{q.marksAwarded}/{q.marksAvailable}</small>
            </button>
          ))}
        </aside>

        <article className="marking-question-card">
          <header>
            <h3>Question {active.number} — {active.marksAvailable} marks</h3>
            <p>{active.questionText}</p>
          </header>

          <div className="marking-compare-grid">
            <section>
              <h4>Student&apos;s answer</h4>
              <p className="marking-answer-box">{active.studentAnswer || 'No extracted answer.'}</p>
            </section>
            <section>
              <h4>Expected answer (marking scheme)</h4>
              <p className="marking-answer-box">{active.expectedAnswer || 'Not provided.'}</p>
            </section>
          </div>

          <section className="marking-ai-block">
            <h4>AI evaluation</h4>
            <p><strong>Suggested mark:</strong> {active.aiMarksAwarded}/{active.marksAvailable}</p>
            <p>{active.aiExplanation || active.aiFeedback || 'No AI explanation provided.'}</p>
          </section>

          <section className="marking-final-block">
            <label className="field">
              <span>Teacher / lecturer final mark</span>
              <div className="marking-score-row">
                <input
                  type="number"
                  min="0"
                  max={active.marksAvailable}
                  step="0.5"
                  disabled={locked || Boolean(busy)}
                  value={active.marksAwarded}
                  onChange={(event) => updateQuestion(active.id, {
                    marksAwarded: event.target.value,
                    reviewed: true,
                    adjustmentReason: 'edit',
                  })}
                />
                <span>/ {active.marksAvailable}</span>
              </div>
            </label>

            <div className="marking-action-row">
              <button type="button" className="secondary-button" disabled={locked || Boolean(busy)} onClick={() => confirmAiMark(active.id)}>
                <Check size={15} /> Confirm AI Mark
              </button>
              <button type="button" className="secondary-button" disabled={locked || Boolean(busy)} onClick={() => awardPartial(active.id)}>
                Award Partial Marks
              </button>
              <button type="button" className="secondary-button" disabled={locked || Boolean(busy)} onClick={() => awardFullAlternative(active.id)}>
                Award Marks for Alternative Answer
              </button>
              <button type="button" className="secondary-button" disabled={locked || Boolean(busy)} onClick={() => overrideZero(active.id)}>
                <RotateCcw size={15} /> Override AI Decision
              </button>
            </div>

            <label className="field">
              <span>Edit feedback</span>
              <textarea
                rows={3}
                disabled={locked || Boolean(busy)}
                value={active.feedback}
                onChange={(event) => updateQuestion(active.id, {
                  feedback: event.target.value,
                  reviewed: true,
                  adjustmentReason: active.adjustmentReason || 'edit',
                })}
              />
            </label>

            <label className="field">
              <span>Marker comment (reason for adjustment)</span>
              <textarea
                rows={2}
                disabled={locked || Boolean(busy)}
                value={active.markerComment}
                placeholder="e.g. Accepted equivalent wording for data redundancy."
                onChange={(event) => updateQuestion(active.id, {
                  markerComment: event.target.value,
                  reviewed: true,
                })}
              />
            </label>
          </section>
        </article>
      </div>

      <label className="field marking-overall-feedback">
        <span>Overall feedback</span>
        <textarea
          rows={3}
          disabled={locked || Boolean(busy)}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
        />
      </label>

      <div className="marking-review-footer">
        {!locked ? (
          <>
            <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={saveDraft}>
              <Save size={15} /> {busy === 'draft' ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={finalize}>
              <ShieldCheck size={15} />
              {busy === 'finalize'
                ? 'Finalizing…'
                : (confirmFinalize
                  ? `Confirm finalize — ${totals.obtained}/${totals.totalMarks} (${totals.percentage}%)`
                  : 'Finalize Results')}
            </button>
            {confirmFinalize ? (
              <button type="button" className="text-button" onClick={() => setConfirmFinalize(false)}>Cancel confirmation</button>
            ) : null}
          </>
        ) : (
          <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={reopen}>
            <Pencil size={15} /> Correct finalized marks
          </button>
        )}
      </div>
    </div>
  );
}
