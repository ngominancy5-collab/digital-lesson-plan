import { useMemo, useState } from 'react';
import { CalendarDays, Clock3, Pencil, Plus, Trash2, Check, X } from 'lucide-react';
import { makeId } from '../../shared/learningEngine.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EVENT_TYPES = ['lesson', 'assessment', 'quiz', 'assignment', 'exam', 'revision', 'event'];

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function toDateKey(date) {
  const copy = new Date(date);
  const offset = copy.getTimezoneOffset();
  copy.setMinutes(copy.getMinutes() - offset);
  return copy.toISOString().slice(0, 10);
}

function emptyDraft(date = toDateKey(new Date())) {
  return {
    id: '',
    title: '',
    description: '',
    type: 'lesson',
    date,
    startTime: '09:00',
    endTime: '11:00',
    status: 'confirmed',
    source: 'manual',
  };
}

export default function CalendarPage({ events, onChange }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [editing, setEditing] = useState(null);
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));

  const days = useMemo(() => {
    const first = startOfMonth(cursor);
    const startOffset = (first.getDay() + 6) % 7;
    const grid = [];
    const start = new Date(first);
    start.setDate(first.getDate() - startOffset);
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      grid.push(date);
    }
    return grid;
  }, [cursor]);

  const selectedEvents = events.filter((event) => event.date === selectedDate);
  const suggested = events.filter((event) => event.status === 'suggested');
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  function upsert(nextEvent) {
    onChange((current) => {
      const exists = current.some((event) => event.id === nextEvent.id);
      return exists ? current.map((event) => event.id === nextEvent.id ? nextEvent : event) : [nextEvent, ...current];
    });
  }

  function remove(id) {
    onChange((current) => current.filter((event) => event.id !== id));
    setEditing(null);
  }

  function confirm(event) {
    upsert({ ...event, status: 'confirmed' });
  }

  function saveDraft(event) {
    event.preventDefault();
    if (!editing.title.trim() || !editing.date) return;
    upsert({
      ...editing,
      id: editing.id || makeId('event'),
      title: editing.title.trim(),
      description: editing.description.trim(),
      status: editing.status || 'confirmed',
    });
    setEditing(null);
  }

  return (
    <section className="calendar-page">
      <div className="account-heading">
        <div>
          <span className="section-kicker">TEACHING CALENDAR</span>
          <h1>Academic calendar</h1>
          <p>AI can suggest dates from lesson plans and assessments. Every event stays editable: change the date, time, title, or delete it.</p>
        </div>
        <button className="primary-button" onClick={() => setEditing(emptyDraft(selectedDate))}><Plus size={16} /> Add event</button>
      </div>

      {suggested.length ? (
        <div className="panel-card suggestion-banner">
          <div>
            <strong>{suggested.length} suggested {suggested.length === 1 ? 'entry' : 'entries'}</strong>
            <p>These came from the AI assistant or a generated plan. Approve them, edit them, or remove them. Nothing is locked.</p>
          </div>
          <div className="banner-actions">
            <button className="primary-button" onClick={() => onChange((current) => current.map((event) => event.status === 'suggested' ? { ...event, status: 'confirmed' } : event))}><Check size={14} /> Approve all</button>
            <button className="secondary-button" onClick={() => onChange((current) => current.filter((event) => event.status !== 'suggested'))}><Trash2 size={14} /> Discard suggestions</button>
          </div>
        </div>
      ) : null}

      <div className="calendar-with-ai">
      <div className="calendar-layout">
        <div className="panel-card calendar-card">
          <div className="panel-head">
            <h3>{monthLabel}</h3>
            <div className="calendar-nav">
              <button className="pill-button" onClick={() => setCursor((current) => addMonths(current, -1))}>Previous</button>
              <button className="pill-button" onClick={() => setCursor(startOfMonth(new Date()))}>Today</button>
              <button className="pill-button" onClick={() => setCursor((current) => addMonths(current, 1))}>Next</button>
            </div>
          </div>
          <div className="calendar-grid">
            {WEEKDAYS.map((day) => <div key={day} className="calendar-day-header">{day}</div>)}
            {days.map((date) => {
              const key = toDateKey(date);
              const inMonth = date.getMonth() === cursor.getMonth();
              const dayEvents = events.filter((event) => event.date === key);
              return (
                <button
                  type="button"
                  key={key}
                  className={`calendar-cell ${inMonth ? '' : 'muted'} ${key === selectedDate ? 'selected' : ''} ${dayEvents.length ? 'marked' : ''}`}
                  onClick={() => { setSelectedDate(key); setEditing(null); }}
                >
                  <span>{date.getDate()}</span>
                  {dayEvents.slice(0, 3).map((event) => (
                    <div key={event.id} className={`event-pill ${event.type} ${event.status === 'suggested' ? 'suggested' : ''}`}>{event.title}</div>
                  ))}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="panel-card calendar-side">
          <div className="panel-head">
            <h3>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          </div>
          {selectedEvents.length ? selectedEvents.map((event) => (
            <article className={`event-detail ${event.status}`} key={event.id}>
              <div>
                <span className={`event-pill ${event.type}`}>{event.type}</span>
                <h4>{event.title}</h4>
                <p>{event.description || 'No description yet.'}</p>
                <small><Clock3 size={12} /> {event.startTime} – {event.endTime} · {event.status === 'suggested' ? 'Suggested' : 'Scheduled'}</small>
              </div>
              <div className="event-detail-actions">
                {event.status === 'suggested' && <button className="secondary-button" onClick={() => confirm(event)}><Check size={13} /> Approve</button>}
                <button className="secondary-button" onClick={() => setEditing(event)}><Pencil size={13} /> Edit</button>
                <button className="secondary-button danger" onClick={() => remove(event.id)}><Trash2 size={13} /> Delete</button>
              </div>
            </article>
          )) : <p className="muted-text">No events on this day. Add one, or approve an AI suggestion.</p>}
        </aside>
      </div>
      </div>

      {editing && (
        <form className="panel-card event-editor" onSubmit={saveDraft}>
          <div className="panel-head">
            <h3>{editing.id ? 'Edit calendar event' : 'New calendar event'}</h3>
            <button type="button" className="icon-button" onClick={() => setEditing(null)} aria-label="Close editor"><X size={16} /></button>
          </div>
          <div className="grid-2">
            <label className="field"><span>Title</span><input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} required /></label>
            <label className="field"><span>Type</span>
              <select value={editing.type} onChange={(event) => setEditing({ ...editing, type: event.target.value })}>
                {EVENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="field"><span>Date</span><input type="date" value={editing.date} onChange={(event) => setEditing({ ...editing, date: event.target.value })} required /></label>
            <label className="field time-pair"><span>Time</span>
              <div>
                <input type="time" value={editing.startTime} onChange={(event) => setEditing({ ...editing, startTime: event.target.value })} />
                <input type="time" value={editing.endTime} onChange={(event) => setEditing({ ...editing, endTime: event.target.value })} />
              </div>
            </label>
            <label className="field full-span"><span>Description</span><textarea rows={3} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></label>
          </div>
          <div className="footer-actions-row">
            {editing.id ? <button type="button" className="secondary-button danger" onClick={() => remove(editing.id)}>Delete event</button> : null}
            <button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="primary-button"><CalendarDays size={15} /> Save changes</button>
          </div>
        </form>
      )}
    </section>
  );
}
