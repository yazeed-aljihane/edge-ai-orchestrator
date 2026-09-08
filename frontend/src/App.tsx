import { apiFetch, setOperatorToken } from './api';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Operations from './Operations';
import './chat.css';

type Message = { role: 'user' | 'assistant'; content: string; toolCalls?: { toolName: string; input: unknown }[] };
const toolLabels: Record<string, string> = { get_agent_health: 'فحص حالة الجهاز', list_tasks: 'عرض المهام', get_task_status: 'فحص حالة المهمة', get_task_events: 'قراءة أحداث المهمة', stop_task: 'طلب إيقاف المهمة', start_video_analysis: 'طلب تحليل الفيديو' };
const suggestions = [ ['01', 'كيف وضع الجهاز؟', 'افحص حالة جهاز الإيدج واستهلاك الموارد.'], ['02', 'وش المهام الحالية؟', 'اعرض المهام الحالية وحالة كل مهمة.'], ['03', 'حلّل مقطع فيديو', 'أريد تحليل فيديو. ما المعلومات التي تحتاجها؟'] ];

export default function App() {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [loginError, setLoginError] = useState('');
  const [view, setView] = useState<'chat' | 'operations'>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState<boolean | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    void apiFetch('/health/session', { signal: AbortSignal.timeout(5000) })
      .then(async response => {
        if (!response.ok) throw new Error('تعذّر التحقق من وضع الدخول.');
        const session = await response.json();
        if (active && session.localDevelopment === true) setAuthenticated(true);
      })
      .catch(() => { if (active) setLoginError('تعذّر التحقق من الدخول المحلي. تأكد من تشغيل الخادم ثم حدّث الصفحة.'); })
      .finally(() => { if (active) setCheckingAccess(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    let alive = true;
    const check = async () => {
      try {
        const response = await apiFetch('/agent/health', { signal: AbortSignal.timeout(8000) });
        const health = await response.json();
        if (alive) setOnline(response.ok && health.status === 'OK');
      } catch { if (alive) setOnline(false); }
    };
    void check();
    const timer = window.setInterval(check, 15000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [authenticated]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, pending, error, view]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy.current || content.length > 4000) return;
    busy.current = true;
    const history = messages.slice(-20).map(({ role, content }) => ({ role, content }));
    setMessages(current => [...current, { role: 'user', content }]);
    setDraft(''); setError(''); setPending(true);
    try {
      const response = await apiFetch('/agent/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: content, history }) });
      if (!response.ok) throw new Error('تعذّر إكمال الطلب. راجع حالة المهام قبل إعادة أي أمر تشغيل أو إيقاف.');
      const result = await response.json();
      if (typeof result.text !== 'string') throw new Error('وصل رد غير متوقع من الخادم.');
      setMessages(current => [...current, { role: 'assistant', content: result.text, toolCalls: Array.isArray(result.toolCalls) ? result.toolCalls : [] }]);
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذّر الاتصال بالخادم.'); }
    finally { busy.current = false; setPending(false); window.setTimeout(() => input.current?.focus(), 0); }
  }

  if (checkingAccess) return <div className="rime" dir="rtl"><main className="chat-main"><p className="welcome" role="status">جارٍ فتح مساحة العمل…</p></main></div>;
  if (!authenticated) return <div className="rime" dir="rtl"><main className="chat-main"><section className="welcome"><div className="assistant-emblem">✳</div><h1>الدخول إلى مساحة العمل</h1><p className="welcome-copy">أدخل مفتاح المشغّل للوصول إلى جهازك.</p><form className="composer" onSubmit={async event => { event.preventDefault(); setOperatorToken(accessKey.trim()); try { const response = await apiFetch('/tasks'); if (response.status === 401) throw new Error('مفتاح الدخول غير صحيح.'); if (![200, 502, 504].includes(response.status)) throw new Error('تعذّر الاتصال بالخادم.'); setAuthenticated(true); setAccessKey(''); setLoginError(''); } catch (error) { setOperatorToken(''); setLoginError(error instanceof Error ? error.message : 'تعذّر الدخول.'); } }}><label htmlFor="operator-key">مفتاح المشغّل</label><input id="operator-key" type="password" autoComplete="off" required value={accessKey} onChange={event => setAccessKey(event.target.value)} /><button className="new-chat" style={{marginTop: 16}} type="submit">دخول</button>{loginError && <p role="alert">{loginError}</p>}</form></section></main></div>;

  return <div className="rime" dir="rtl">
    <aside className="rail">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setView('chat'); }} aria-label="RIME الرئيسية"><span className="brand-mark">r.</span><strong>rime<span>EDGE INTELLIGENCE</span></strong></a>
      <button className="new-chat" disabled={pending} onClick={() => { setMessages([]); setError(''); setDraft(''); setView('chat'); input.current?.focus(); }}><span>＋</span> محادثة جديدة</button>
      <p className="nav-label">مساحة العمل</p>
      <nav aria-label="التنقل الرئيسي"><button className={view === 'chat' ? 'selected' : ''} onClick={() => setView('chat')}><span>◉</span> المساعد <small>AI</small></button><button className={view === 'operations' ? 'selected' : ''} onClick={() => setView('operations')}><span>▤</span> العمليات</button></nav>
      <div className="rail-footer"><div className="device-icon">▣</div><div><strong>Edge Agent</strong><span><i className={`live-dot ${online === false ? 'offline' : online === null ? 'checking' : ''}`} />{online === null ? 'جارٍ فحص الاتصال' : online ? 'الجهاز متصل' : 'الجهاز غير متصل'}</span></div></div>
    </aside>
    <div className="main-surface">
      <header className="chat-header"><div>{view === 'chat' ? 'المساعد' : 'العمليات'}<span>/</span><strong>{view === 'chat' ? 'محادثة مع الإيدج' : 'المهام والأحداث'}</strong></div><span className="workspace-label">RIME WORKSPACE <span className="tiny-square" /></span></header>
      {view === 'operations' ? <div className="operations-view"><Operations onAskAssistant={prompt => { setDraft(prompt); setView('chat'); window.setTimeout(() => input.current?.focus(), 0); }} /></div> : <main className={`chat-main ${messages.length ? 'has-messages' : ''}`}>
        <div className="conversation">
          {messages.length === 0 ? <section className="welcome"><div className="assistant-emblem">✳</div><p className="intro-label">أقرب لجهازك.</p><h1>وش ننجز اليوم؟</h1><p className="welcome-copy">اسأل عن جهازك، تابع مهامك، أو ابدأ تحليل فيديو.<br />مساعدك يتولى التفاصيل.</p><div className="suggestions">{suggestions.map(([number, title, prompt]) => <button key={number} onClick={() => { setDraft(prompt!); input.current?.focus(); }}><span className="suggestion-number">{number}</span><strong>{title}</strong><span className="suggestion-arrow">↖</span></button>)}</div></section> : <div className="message-list" role="log" aria-label="رسائل المحادثة" aria-live="polite">{messages.map((message, index) => <article className={`chat-message ${message.role}`} key={index}><div className="message-author">{message.role === 'assistant' ? <><span className="mini-emblem">✳</span> مساعد RIME</> : 'أنت'}</div><div className="message-content" dir="auto">{message.content}</div>{!!message.toolCalls?.length && <details className="tool-details"><summary>الأدوات المستخدمة · {message.toolCalls.length}</summary>{message.toolCalls.map((tool, i) => <div className="tool-row" key={i}><span>↳ {toolLabels[tool.toolName] ?? tool.toolName}</span><pre dir="ltr">{JSON.stringify(tool.input, null, 2)}</pre></div>)}</details>}</article>)}</div>}
          {pending && <div className="thinking" role="status"><span className="mini-emblem">✳</span> جارٍ معالجة طلبك<span className="loading-dots">•••</span></div>}
          {error && <div className="chat-error" role="alert">{error}</div>}
          <div ref={bottom} />
        </div>
        <div className="composer-area"><form className="composer" onSubmit={send}><label className="sr-only" htmlFor="chat-input">رسالتك للمساعد</label><textarea id="chat-input" ref={input} dir="auto" rows={2} maxLength={4000} value={draft} onChange={e => setDraft(e.target.value)} placeholder="اسأل مساعدك أو اطلب منه تنفيذ مهمة…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} /><div className="composer-bottom"><span><span className="mini-spark">✳</span> مساعد الإيدج</span><button className="send-button" type="submit" disabled={pending || !draft.trim()} aria-label="إرسال الرسالة">↑</button></div></form><div className="composer-note"><span>تحقق من النتائج قبل اتخاذ قراراتك.</span><span>Enter للإرسال · Shift + Enter لسطر جديد</span></div></div>
      </main>}
    </div>
  </div>;
}
