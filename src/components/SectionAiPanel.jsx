import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, SendHorizontal, Sparkles } from 'lucide-react';
import { streamAiChat } from '../services/api.js';

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function SectionAiPanel({
  title = 'AI Assistant',
  subtitle = 'Ask for help with this section.',
  user,
  context = 'general',
  starters = [],
  systemHint = '',
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        text: systemHint || `I am focused on ${context}. Ask me anything related to this section.`,
        time: nowTime(),
      },
    ]);
  }, [context, systemHint]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(raw) {
    const prompt = String(raw || input).trim();
    if (!prompt || busy) return;
    setInput('');
    const botId = `bot-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', text: prompt, time: nowTime() },
      { id: botId, role: 'assistant', text: '', time: nowTime(), streaming: true },
    ]);
    setBusy(true);
    const history = messages.slice(-8).map((item) => ({ role: item.role, content: item.text }));
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await streamAiChat({
        message: `[Context: ${context}] ${systemHint ? `${systemHint}\n\n` : ''}${prompt}`,
        history,
        profile: { id: user?.id, name: user?.name, role: user?.role },
        session: { mode: 'tutor', difficulty: 'Intermediate', topics: [context] },
        difficulty: 'Intermediate',
      }, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('stream unavailable');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalReply = '';
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
            finalReply += typeof data === 'string' ? data : '';
            setMessages((current) => current.map((item) => (item.id === botId ? { ...item, text: finalReply, streaming: true } : item)));
          }
          if (event === 'done' && data?.reply) finalReply = data.reply;
        });
      }
      setMessages((current) => current.map((item) => (
        item.id === botId ? { ...item, streaming: false, text: finalReply || item.text || 'I could not complete that reply.' } : item
      )));
    } catch (error) {
      if (error.name !== 'AbortError') {
        setMessages((current) => current.map((item) => (
          item.id === botId ? { ...item, streaming: false, text: 'I could not reach the AI just now. Try again in a moment.' } : item
        )));
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  return (
    <aside className="section-ai-panel glass-panel">
      <div className="section-ai-head">
        <span className="glass-kicker"><Sparkles size={12} /> {title}</span>
        <p>{subtitle}</p>
      </div>
      <div className="section-ai-messages" ref={listRef}>
        {messages.map((item) => (
          <div key={item.id} className={`section-ai-bubble ${item.role}`}>
            <p>{item.text || (item.streaming ? '…' : '')}</p>
          </div>
        ))}
      </div>
      {starters.length > 0 && (
        <div className="section-ai-starters">
          {starters.map((item) => (
            <button key={item} type="button" disabled={busy} onClick={() => send(item)}>{item}</button>
          ))}
        </div>
      )}
      <form className="section-ai-form" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask the AI…" disabled={busy} />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
          {busy ? <LoaderCircle size={15} className="fa-spin" /> : <SendHorizontal size={15} />}
        </button>
      </form>
    </aside>
  );
}
