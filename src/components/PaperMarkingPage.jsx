import { useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ClipboardCheck,
  FileText,
  LoaderCircle,
  UploadCloud,
} from 'lucide-react';
import { ACCEPT_ATTR, ACCEPTED_EXTENSIONS, extractLocalDocument, fileExtension, fileToBase64 } from '../lib/documentExtractor.js';
import { isReadableEducationalText } from '../../shared/learningEngine.js';
import { api, markingApi } from '../services/api.js';
import Notice from './Notice.jsx';
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
  const keyRef = useRef(null);
  const paperRef = useRef(null);
  const scanRef = useRef(null);

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

  async function runMarking() {
    if (!markingKey?.text || !studentPaper?.text) {
      setError('Upload a marking key and a student paper first.');
      return;
    }
    setError('');
    setBusy('mark');
    try {
      const saved = await markingApi.mark({
        markingKeyText: markingKey.text,
        studentPaperText: studentPaper.text,
        subject,
        studentLabel: studentLabel || studentPaper.name || 'Student paper',
      });
      const next = {
        ...saved,
        markingKeyName: markingKey.name,
        studentPaperName: studentPaper.name,
        status: 'review',
      };
      setResult(next);
      setSelectedHistoryId('');
      onSaveResult?.(next);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Marking failed.');
    } finally {
      setBusy('');
    }
  }

  function updateAward(questionId, value) {
    setResult((current) => {
      if (!current) return current;
      const questions = current.questions.map((item) => {
        if (item.id !== questionId) return item;
        const marksAwarded = Math.max(0, Math.min(item.marksAvailable, Number(value) || 0));
        let status = 'incorrect';
        if (marksAwarded >= item.marksAvailable) status = 'correct';
        else if (marksAwarded > 0) status = 'partial';
        return { ...item, marksAwarded, status };
      });
      const totalMarks = questions.reduce((sum, item) => sum + item.marksAvailable, 0);
      const obtained = questions.reduce((sum, item) => sum + item.marksAwarded, 0);
      const percentage = totalMarks ? Math.round((obtained / totalMarks) * 1000) / 10 : 0;
      return {
        ...current,
        questions,
        totalMarks,
        obtained,
        percentage,
        correct: questions.filter((item) => item.status === 'correct').length,
        partial: questions.filter((item) => item.status === 'partial').length,
        incorrect: questions.filter((item) => item.status === 'incorrect').length,
      };
    });
  }

  function acceptResult() {
    if (!result) return;
    const finalized = { ...result, status: 'final', finalizedAt: new Date().toISOString() };
    onSaveResult?.(finalized);
    setResult(finalized);
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
              <label className="field"><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Mathematics" /></label>
              <label className="field"><span>Student / paper ID</span><input value={studentLabel} onChange={(event) => setStudentLabel(event.target.value)} placeholder="e.g. Form 3A — Chisomo Banda" /></label>
            </div>
            {error ? <Notice message={error} /> : null}
            <button type="button" className="primary-button" onClick={runMarking} disabled={Boolean(busy) || !markingKey || !studentPaper}>
              {busy === 'mark' ? <LoaderCircle size={16} className="fa-spin" /> : <ClipboardCheck size={16} />}
              Mark paper with AI
            </button>
          </div>

          {display && (
            <div className="panel-card paper-result-card">
              <div className="paper-result-summary">
                <div>
                  <span className="glass-kicker">Paper result</span>
                  <h2>{display.percentage}%</h2>
                  <p>{display.obtained} / {display.totalMarks} marks · {display.studentLabel || studentLabel || 'Student paper'}</p>
                </div>
                <div className="paper-result-stats">
                  <span>Correct: <strong>{display.correct}</strong></span>
                  <span>Partial: <strong>{display.partial}</strong></span>
                  <span>Incorrect: <strong>{display.incorrect}</strong></span>
                  <span>Status: <strong>{display.status}</strong></span>
                </div>
              </div>

              <div className="paper-table-wrap">
                <table className="paper-mark-table">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Student answer</th>
                      <th>Expected</th>
                      <th>Marks</th>
                      <th>Awarded</th>
                      <th>Feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {display.questions?.map((item) => (
                      <tr key={item.id || item.number}>
                        <td>{item.number}</td>
                        <td>{item.studentAnswer}</td>
                        <td>{item.expectedAnswer}</td>
                        <td>{item.marksAvailable}</td>
                        <td>
                          {result && result.id === display.id ? (
                            <input
                              type="number"
                              min="0"
                              max={item.marksAvailable}
                              value={item.marksAwarded}
                              onChange={(event) => updateAward(item.id, event.target.value)}
                            />
                          ) : item.marksAwarded}
                        </td>
                        <td>{item.feedback}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="paper-ai-feedback">
                <h3>AI feedback</h3>
                <p>{display.aiFeedback}</p>
              </div>

              {result && result.status === 'review' && (
                <button type="button" className="primary-button" onClick={acceptResult}>
                  Accept & save marking result
                </button>
              )}
            </div>
          )}

          <div className="panel-card">
            <div className="panel-head"><h3>Marking history</h3></div>
            {history.length ? (
              <div className="paper-history-list">
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`paper-history-item ${selectedHistoryId === item.id ? 'active' : ''}`}
                    onClick={() => { setSelectedHistoryId(item.id); setResult(null); }}
                  >
                    <strong>{item.studentLabel || 'Paper'}</strong>
                    <span>{item.subject || 'General'} · {new Date(item.finalizedAt || item.createdAt).toLocaleString()}</span>
                    <em>{item.percentage}% ({item.obtained}/{item.totalMarks})</em>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted-text">Accepted marking results will appear here.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
