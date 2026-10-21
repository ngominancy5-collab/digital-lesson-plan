import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileText,
  LoaderCircle,
  Pencil,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { ACCEPT_ATTR, ACCEPTED_EXTENSIONS, extractLocalDocument, fileExtension, fileToBase64 } from '../lib/documentExtractor.js';
import { isReadableEducationalText } from '../../shared/learningEngine.js';
import { api, markingApi } from '../services/api.js';
import Notice from './Notice.jsx';
import MarkingReviewPanel from './MarkingReviewPanel.jsx';
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/jpg';

async function extractTextFromFile(file, onProgress) {
  const ext = fileExtension(file.name);
  if (file.type.startsWith('image/')) {
    onProgress?.(40);
    const contentBase64 = await fileToBase64(file);
    onProgress?.(70);
    const response = await api.post('/ai/extract', {
      fileName: file.name,
      mimeType: file.type,
      contentBase64,
    });
    return response.data.text || '';
  }
  if (!ACCEPTED_EXTENSIONS.includes(ext) && !file.type.startsWith('image/')) {
    throw new Error('Use PDF, DOC/DOCX, TXT, or an image of the paper.');
  }
  let text = await extractLocalDocument(file, onProgress);
  if (!text || !isReadableEducationalText(text)) {
    const contentBase64 = await fileToBase64(file);
    onProgress?.(70);
    const response = await api.post('/ai/extract', {
      fileName: file.name,
      mimeType: file.type,
      contentBase64,
    });
    text = response.data.text || '';
  }
  return text;
}

export default function PaperMarkingPage({ user, history = [], onSaveResult }) {
  const [markingKey, setMarkingKey] = useState(null);
  const [studentPaper, setStudentPaper] = useState(null);
  const [subject, setSubject] = useState('');
  const [studentLabel, setStudentLabel] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState('');
  const [markProgress, setMarkProgress] = useState(null);
  const [markComplete, setMarkComplete] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [historyNotice, setHistoryNotice] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ studentLabel: '', subject: '', feedback: '' });
  const [historyBusy, setHistoryBusy] = useState('');
  const keyRef = useRef(null);
  const paperRef = useRef(null);
  const scanRef = useRef(null);
  const markAbortRef = useRef(null);
  const resultSectionRef = useRef(null);

  const activeHistory = useMemo(
    () => history.find((item) => item.id === selectedHistoryId) || null,
    [history, selectedHistoryId],
  );

  const display = result || activeHistory;

  async function handleUpload(kind, file) {
    if (!file) return;
    setError('');
    setBusy(kind);
    try {
      const text = await extractTextFromFile(file, () => {});
      if (!String(text || '').trim()) {
        throw new Error('Could not read text from that file. Try a clearer scan or text-based PDF.');
      }
      const payload = {
        name: file.name,
        type: file.type || fileExtension(file.name).toUpperCase(),
        text,
        uploadedAt: new Date().toISOString(),
      };
      if (kind === 'key') setMarkingKey(payload);
      else setStudentPaper(payload);
      setResult(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed.');
    } finally {
      setBusy('');
    }
  }

  useEffect(() => () => {
    markAbortRef.current?.abort();
  }, []);

  async function runMarking() {
    if (busy === 'mark') return;
    if (!markingKey?.text || !studentPaper?.text) {
      setError('Upload a marking key and a student paper first.');
      return;
    }
    markAbortRef.current?.abort();
    const controller = new AbortController();
    markAbortRef.current = controller;
    setError('');
    setMarkComplete(false);
    setBusy('mark');
    setMarkProgress({
      percent: 0,
      message: 'Preparing assessment for marking.',
      estimated: true,
      done: false,
    });
    try {
      const saved = await markingApi.markWithProgress(
        {
          markingKeyText: markingKey.text,
          studentPaperText: studentPaper.text,
          subject,
          studentLabel: studentLabel || studentPaper.name || 'Student paper',
        },
        {
          signal: controller.signal,
          onProgress: (update) => {
            setMarkProgress((current) => {
              const nextPercent = Number(update.percent);
              // Never jump to 100% until the backend confirms done.
              if (!update.done && nextPercent >= 100) {
                return {
                  percent: Math.max(current?.percent || 0, 99),
                  message: update.message || 'Marking is still in progress. Please wait.',
                  estimated: true,
                  done: false,
                };
              }
              return {
                percent: Math.max(0, Math.min(100, Number.isFinite(nextPercent) ? nextPercent : (current?.percent || 0))),
                message: update.message || current?.message || 'Marking is still in progress. Please wait.',
                estimated: Boolean(update.estimated),
                done: Boolean(update.done),
              };
            });
          },
        },
      );
      const next = {
        ...saved,
        markingKeyName: markingKey.name,
        studentPaperName: studentPaper.name,
        reviewStatus: saved.reviewStatus || 'ai_completed',
        status: saved.reviewStatus || 'ai_completed',
      };
      setMarkProgress({
        percent: 100,
        message: 'Marking completed successfully!',
        estimated: false,
        done: true,
      });
      setMarkComplete(true);
      setReviewOpen(false);
      setSuccessMessage('');
      setResult(next);
      setSelectedHistoryId(next.id);
      onSaveResult?.(next);
    } catch (err) {
      if (err.name === 'AbortError') {
        setMarkProgress(null);
        return;
      }
      setMarkProgress(null);
      setMarkComplete(false);
      setError(err.response?.data?.error || err.message || 'Marking failed.');
    } finally {
      setBusy('');
      markAbortRef.current = null;
    }
  }

  function applyPaperUpdate(paper) {
    setResult(paper);
    setSelectedHistoryId(paper.id);
    onSaveResult?.(paper);
  }

  async function loadPaper(item) {
    setSelectedHistoryId(item.id);
    setHistoryError('');
    const fresh = await markingApi.get(item.id);
    setResult(fresh);
    return fresh;
  }

  async function reviewRecord(item) {
    setHistoryBusy(`review-${item.id}`);
    setHistoryNotice('');
    try {
      await loadPaper(item);
      setReviewOpen(false);
      setSuccessMessage('');
      window.setTimeout(() => resultSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (err) {
      setHistoryError(err.message || 'Could not open this record.');
    } finally {
      setHistoryBusy('');
    }
  }

  async function editRecord(item) {
    setHistoryBusy(`edit-${item.id}`);
    setHistoryError('');
    setHistoryNotice('');
    try {
      let paper = await loadPaper(item);
      if (paper.reviewStatus === 'finalized') {
        paper = await markingApi.reopen(paper.id);
        applyPaperUpdate(paper);
      }
      setEditTarget(paper);
      setEditForm({
        studentLabel: paper.studentLabel || paper.studentName || '',
        subject: paper.subject || paper.assessmentName || '',
        feedback: paper.feedback || paper.aiFeedback || '',
      });
    } catch (err) {
      setHistoryError(err.message || 'Could not open this record for editing.');
    } finally {
      setHistoryBusy('');
    }
  }

  async function saveEditMeta(event) {
    event.preventDefault();
    if (!editTarget?.id) return;
    const studentLabel = editForm.studentLabel.trim();
    const subject = editForm.subject.trim();
    if (!studentLabel || !subject) {
      setHistoryError('Student / paper ID and subject are required.');
      return;
    }
    setHistoryBusy('save-edit');
    setHistoryError('');
    try {
      const saved = await markingApi.update(editTarget.id, {
        studentLabel,
        subject,
        feedback: editForm.feedback,
      });
      applyPaperUpdate(saved);
      setEditTarget(null);
      setHistoryNotice('Record updated successfully.');
      setReviewOpen(true);
    } catch (err) {
      setHistoryError(err.message || 'Could not save changes.');
    } finally {
      setHistoryBusy('');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget?.id) return;
    setHistoryBusy('delete');
    setHistoryError('');
    try {
      const outcome = await markingApi.remove(deleteTarget.id);
      if (selectedHistoryId === deleteTarget.id) {
        setResult(null);
        setSelectedHistoryId('');
        setReviewOpen(false);
      }
      setDeleteTarget(null);
      setHistoryNotice(outcome.message || 'Record deleted.');
      onSaveResult?.();
    } catch (err) {
      setHistoryError(err.message || 'Could not delete this record.');
    } finally {
      setHistoryBusy('');
    }
  }

  function statusLabel(item) {
    const value = String(item.reviewStatus || item.status || 'draft').replace(/_/g, ' ');
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  return (
    <section className="account-page paper-marking-page">
      <div className="account-heading">
        <div>
          <span className="section-kicker">AI PAPER MARKING</span>
          <h1>Paper Marking</h1>
          <p>Upload a marking key, then upload or scan a student paper. Review AI marks before finalising.</p>
        </div>
      </div>

      <div className="paper-marking-layout">
        <div className="paper-marking-main">
          <div className="paper-step-grid">
            <article className="panel-card paper-step-card">
              <span className="glass-kicker">Step 1</span>
              <h3>Upload marking key</h3>
              <p>PDF, DOC/DOCX, TXT, or image of the scheme.</p>
              <button type="button" className="primary-button" onClick={() => keyRef.current?.click()} disabled={Boolean(busy)}>
                {busy === 'key' ? <LoaderCircle size={16} className="fa-spin" /> : <UploadCloud size={16} />}
                {markingKey ? 'Replace marking key' : 'Upload marking key'}
              </button>
              <input ref={keyRef} type="file" accept={`${ACCEPT_ATTR},${IMAGE_ACCEPT}`} hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) handleUpload('key', file); }} />
              {markingKey && <div className="paper-file-chip"><FileText size={15} /><span>{markingKey.name}</span><Check size={14} /></div>}
            </article>

            <article className="panel-card paper-step-card">
              <span className="glass-kicker">Step 2</span>
              <h3>Student paper</h3>
              <p>Upload a file or scan with your device camera.</p>
              <div className="paper-action-row">
                <button type="button" className="primary-button" onClick={() => paperRef.current?.click()} disabled={Boolean(busy)}>
                  {busy === 'paper' ? <LoaderCircle size={16} className="fa-spin" /> : <UploadCloud size={16} />}
                  Upload paper
                </button>
                <button type="button" className="secondary-button" onClick={() => scanRef.current?.click()} disabled={Boolean(busy)}>
                  <Camera size={16} /> Scan paper
                </button>
              </div>
              <input ref={paperRef} type="file" accept={`${ACCEPT_ATTR},${IMAGE_ACCEPT}`} hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) handleUpload('paper', file); }} />
              <input ref={scanRef} type="file" accept={IMAGE_ACCEPT} capture="environment" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) handleUpload('paper', file); }} />
              {studentPaper && <div className="paper-file-chip"><FileText size={15} /><span>{studentPaper.name}</span><Check size={14} /></div>}
            </article>
          </div>

          <div className="panel-card paper-meta-card">
            <div className="account-form-grid">
              <label className="field"><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Mathematics" disabled={busy === 'mark'} /></label>
              <label className="field"><span>Student / paper ID</span><input value={studentLabel} onChange={(event) => setStudentLabel(event.target.value)} placeholder="e.g. Form 3A — Chisomo Banda" disabled={busy === 'mark'} /></label>
            </div>
            {error ? <Notice message={error} onDismiss={() => setError('')} /> : null}
            {markProgress ? (
              <div className={`paper-mark-progress${markProgress.done ? ' is-complete' : ''}`} role="status" aria-live="polite">
                <div className="paper-mark-progress-head">
                  <strong>
                    {markProgress.done ? 'Marking Completed Successfully!' : 'AI is marking your assessment...'}
                  </strong>
                  <span className="paper-mark-progress-percent">{Math.round(markProgress.percent)}%</span>
                </div>
                <div className="paper-mark-progress-track" aria-hidden="true">
                  <div className="paper-mark-progress-fill" style={{ width: `${Math.max(0, Math.min(100, markProgress.percent))}%` }} />
                </div>
                <p className="paper-mark-progress-message">
                  {markProgress.done
                    ? 'Your assessment has been marked, and the results are ready to view.'
                    : (markProgress.message || 'Marking is still in progress. Please wait.')}
                </p>
                {markProgress.estimated && !markProgress.done ? (
                  <small className="paper-mark-progress-note">Stage-based progress while the AI works</small>
                ) : null}
                {markComplete && markProgress.done ? (
                  <p className="paper-mark-progress-success"><CheckCircle2 size={15} /> AI suggestions are ready — review before finalising.</p>
                ) : null}
              </div>
            ) : null}
            <button type="button" className="primary-button" onClick={runMarking} disabled={Boolean(busy) || !markingKey || !studentPaper}>
              {busy === 'mark' ? <LoaderCircle size={16} className="fa-spin" /> : <ClipboardCheck size={16} />}
              {busy === 'mark' ? 'Marking in progress…' : (error ? 'Retry marking with AI' : 'Mark paper with AI')}
            </button>
            {markComplete && display?.id ? (
              <button type="button" className="primary-button" style={{ marginTop: 10 }} onClick={() => setReviewOpen(true)}>
                Review &amp; Confirm Marks
              </button>
            ) : null}
            {successMessage ? (
              <p className="paper-mark-progress-success" style={{ marginTop: 12 }}>
                <CheckCircle2 size={15} /> {successMessage}
              </p>
            ) : null}
          </div>

          {reviewOpen && display ? (
            <MarkingReviewPanel
              paper={display}
              onClose={() => setReviewOpen(false)}
              onSaved={(paper) => applyPaperUpdate(paper)}
              onFinalized={(paper) => {
                applyPaperUpdate(paper);
                setReviewOpen(false);
                setSuccessMessage('Results finalized successfully. Final marks reflect your decisions.');
              }}
            />
          ) : null}

          {display && !reviewOpen && (
            <div className="panel-card paper-result-card" ref={resultSectionRef}>
              <div className="paper-result-summary">
                <div>
                  <span className="glass-kicker">
                    {(display.reviewStatus || display.status) === 'finalized' ? 'Final result' : 'AI suggested result'}
                  </span>
                  <h2>{display.percentage}%</h2>
                  <p>
                    {display.obtained ?? display.score} / {display.totalMarks} marks
                    {' · '}
                    {display.studentLabel || studentLabel || 'Student paper'}
                  </p>
                  {display.aiScore != null ? (
                    <p className="muted-text">
                      AI suggested: {display.aiScore}/{display.aiTotalMarks || display.totalMarks} ({display.aiPercentage}%)
                    </p>
                  ) : null}
                </div>
                <div className="paper-result-stats">
                  <span>Correct: <strong>{display.correct}</strong></span>
                  <span>Partial: <strong>{display.partial}</strong></span>
                  <span>Incorrect: <strong>{display.incorrect}</strong></span>
                  <span>Status: <strong>{display.reviewStatus || display.status}</strong></span>
                </div>
              </div>

              <div className="paper-table-wrap">
                <table className="paper-mark-table">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>AI Mark</th>
                      <th>Final Mark</th>
                      <th>Maximum</th>
                      <th>Feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {display.questions?.map((item) => (
                      <tr key={item.id || item.number}>
                        <td>{item.number}</td>
                        <td>{item.aiMarksAwarded != null ? item.aiMarksAwarded : item.marksAwarded}</td>
                        <td><strong>{item.marksAwarded}</strong></td>
                        <td>{item.marksAvailable}</td>
                        <td>{item.feedback}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="paper-ai-feedback">
                <h3>Feedback</h3>
                <p>{display.feedback || display.aiFeedback}</p>
              </div>

              {(display.reviewStatus || display.status) !== 'finalized' ? (
                <button type="button" className="primary-button" onClick={() => setReviewOpen(true)}>
                  Review &amp; Confirm Marks
                </button>
              ) : (
                <button type="button" className="secondary-button" onClick={() => setReviewOpen(true)}>
                  View / correct finalized marks
                </button>
              )}
            </div>
          )}

          <div className="panel-card paper-history-card">
            <div className="panel-head paper-history-head">
              <div>
                <h3>Marking history</h3>
                <p className="muted-text">Review, edit, or remove papers you have marked.</p>
              </div>
            </div>
            {historyNotice ? (
              <p className="paper-mark-progress-success"><CheckCircle2 size={15} /> {historyNotice}</p>
            ) : null}
            {historyError ? <Notice message={historyError} onDismiss={() => setHistoryError('')} /> : null}
            {history.length ? (
              <div className="paper-history-list">
                {history.map((item) => (
                  <article
                    key={item.id}
                    className={`paper-history-item ${selectedHistoryId === item.id ? 'active' : ''}`}
                  >
                    <div className="paper-history-copy">
                      <strong className="paper-history-title">{item.studentLabel || item.studentName || 'Paper'}</strong>
                      <p className="paper-history-subject">{item.subject || item.assessmentName || 'General'}</p>
                      <div className="paper-history-meta">
                        <span className={`paper-history-status is-${item.reviewStatus || item.status || 'draft'}`}>
                          {statusLabel(item)}
                        </span>
                        <span>{new Date(item.finalizedAt || item.lastSavedAt || item.createdAt).toLocaleString()}</span>
                        <span className="paper-history-score">
                          {item.percentage}% ({item.obtained ?? item.score}/{item.totalMarks})
                        </span>
                      </div>
                    </div>
                    <div className="paper-history-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={Boolean(historyBusy)}
                        onClick={() => reviewRecord(item)}
                      >
                        <Eye size={15} />
                        {historyBusy === `review-${item.id}` ? 'Opening…' : 'Review'}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={Boolean(historyBusy)}
                        onClick={() => editRecord(item)}
                      >
                        <Pencil size={15} />
                        {historyBusy === `edit-${item.id}` ? 'Opening…' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        className="secondary-button paper-history-delete"
                        disabled={Boolean(historyBusy)}
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2 size={15} /> Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted-text">AI suggestions and finalized results will appear here.</p>
            )}
          </div>
        </div>
      </div>

      {editTarget ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => !historyBusy && setEditTarget(null)}>
          <form
            className="confirm-dialog paper-edit-dialog"
            onClick={(event) => event.stopPropagation()}
            onSubmit={saveEditMeta}
          >
            <h2>Edit marking record</h2>
            <p>Update the student label, subject, and overall feedback. Marks are edited in the review panel after you save.</p>
            <label className="field">
              <span>Student / paper ID</span>
              <input
                value={editForm.studentLabel}
                onChange={(event) => setEditForm((current) => ({ ...current, studentLabel: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Subject / assessment</span>
              <input
                value={editForm.subject}
                onChange={(event) => setEditForm((current) => ({ ...current, subject: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Overall feedback</span>
              <textarea
                rows={3}
                value={editForm.feedback}
                onChange={(event) => setEditForm((current) => ({ ...current, feedback: event.target.value }))}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" disabled={Boolean(historyBusy)} onClick={() => setEditTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={historyBusy === 'save-edit'}>
                {historyBusy === 'save-edit' ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => !historyBusy && setDeleteTarget(null)}>
          <div className="confirm-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>Delete marking record?</h2>
            <p>
              {(deleteTarget.reviewStatus || deleteTarget.status) === 'finalized'
                ? 'This finalized result will be archived and removed from your active history.'
                : 'This will permanently remove the draft / AI marking record.'}
            </p>
            <p>
              <strong>{deleteTarget.studentLabel || deleteTarget.studentName || 'Paper'}</strong>
              {' — '}
              {deleteTarget.subject || deleteTarget.assessmentName || 'General'}
              {' · '}
              {deleteTarget.percentage}%
            </p>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" disabled={Boolean(historyBusy)} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button type="button" className="logout-confirm" disabled={historyBusy === 'delete'} onClick={confirmDelete}>
                {historyBusy === 'delete' ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
