import { apiFetch } from './api';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import './operations.css';

type TaskStatus = 'running' | 'stopping' | 'stopped' | 'completed' | 'failed';

type Progress = {
  frames_read: number;
  frames_analyzed: number;
  total_frames: number | null;
  progress_percent: number | null;
  updated_at: string | null;
};

type Task = {
  progress?: Progress | null;
  video_id?: string;
  task_id: number;
  status: TaskStatus;
  pid?: number;
  returncode?: number | null;
  last_error?: string | null;
  process_metrics?: {
    cpu_percent?: number;
    memory_rss_bytes?: number;
  } | null;
};

type AgentHealth = {
  agent_id: string;
  status: string;
  cpu_percent: number;
  memory_percent: number;
  active_tasks: number;
};

type ConnectionStatus = 'checking' | 'online' | 'offline';

type TaskEvent = {
  event_type?: string;
  video_id?: string;
  timestamp?: string;
  metadata?: {
    person_count?: number;
    frame_index?: number;
    frames_processed?: number;
  };
};

const statusLabels: Record<TaskStatus, string> = {
  running: 'قيد التشغيل',
  stopping: 'جارٍ الإيقاف',
  stopped: 'متوقفة',
  completed: 'مكتملة',
  failed: 'فشلت',
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(response.status === 502 ? 'تعذّر الاتصال بجهاز الإيدج.' : response.status === 504 ? 'انتهت مهلة الاستجابة من الجهاز.' : 'تعذّر إكمال الطلب. تحقق من حالة المهمة قبل إعادة المحاولة.');
  }

  return body as T;
}

function formatMemory(bytes?: number): string {
  if (bytes == null) return '—';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatEventTime(timestamp?: string): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : new Intl.DateTimeFormat('ar-SA', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(date);
}

function eventLabel(eventType?: string): string {
  if (eventType === 'PERSON_DETECTED') return 'رصد أشخاص';
  if (eventType === 'VIDEO_COMPLETED') return 'اكتمل تحليل الفيديو';
  return eventType?.replaceAll('_', ' ') ?? 'حدث جديد';
}

export default function Operations({ onAskAssistant }: { onAskAssistant: (prompt: string) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [taskId, setTaskId] = useState('');
  const [videoId, setVideoId] = useState('test.mp4');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStopping, setIsStopping] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [syncError, setSyncError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailsLoading, setDetailsLoading] = useState(false);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);

    try {
      const [taskResponse, healthResponse] = await Promise.all([
        request<{ tasks: Task[] }>('/tasks'),
        request<AgentHealth>('/agent/health'),
      ]);
      setTasks(taskResponse.tasks.sort((a, b) => b.task_id - a.task_id));
      setHealth(healthResponse);
      setSyncError('');
      setLastUpdated(new Date());
      setConnectionStatus(healthResponse.status === 'OK' ? 'online' : 'offline');
    } catch (error) {
      setConnectionStatus('offline');
      setSyncError(error instanceof Error ? error.message : 'تعذّر الاتصال بالجهاز.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!selectedTask) return;

    let active = true;
    const taskId = selectedTask.task_id;
    setDetailsLoading(true);
    setDetailError('');
    const refreshDetails = async () => {
      try {
        const [details, eventResponse] = await Promise.all([
          request<Task>(`/task/${taskId}`),
          request<{ events: TaskEvent[] }>(`/task/${taskId}/events`),
        ]);
        if (!active) return;
        setDetailError('');
        setSelectedTask((current) => current?.task_id === taskId ? { ...current, ...details } : current);
        setEvents(eventResponse.events);
      } catch (error) {
        if (active) setDetailError(error instanceof Error ? error.message : 'تعذّر تحديث تفاصيل المهمة.');
      } finally {
        if (active) setDetailsLoading(false);
      }
    };

    void refreshDetails();
    const timer = window.setInterval(() => void refreshDetails(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selectedTask?.task_id]);

  const stats = useMemo(() => ({
    active: tasks.filter((task) => task.status === 'running' || task.status === 'stopping').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
  }), [tasks]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = Number(taskId);


    if (!taskId.trim() || !Number.isSafeInteger(id) || id <= 0 || !/^[a-zA-Z0-9_-]+\.(mp4|avi|mov|mkv)$/.test(videoId)) {
      setMessage('أدخل رقماً صحيحاً موجباً للمهمة واسم الفيديو المسموح.');
      return;
    }

    setIsSubmitting(true);
    setMessage('');

    try {
      await request('/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: id, operation: 'video_analysis', video_id: videoId }),
      });
      setTaskId('');
      setMessage('تم إرسال المهمة إلى الجهاز.');
      await refresh(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذّر تشغيل المهمة.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function showTask(task: Task) {
    if (selectedTask?.task_id === task.task_id) return;
    setSelectedTask(task);
    setEvents([]);
    setDetailError('');
    setDetailsLoading(true);
  }

  async function stopTask(task: Task) {
    setIsStopping(task.task_id);
    setMessage('');

    try {
      await request(`/task/${task.task_id}/stop`, { method: 'POST' });
      await refresh(true);
      setMessage('تم إرسال طلب الإيقاف. يتم تحديث الحالة تلقائياً.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذّر إيقاف المهمة.');
    } finally {
      setIsStopping(null);
    }
  }

  return (
    <main className="app-shell ops" dir="rtl">
      <header className="topbar">
        <div><p className="eyebrow">RIME / OPERATIONS</p><h1>كل ما يحدث على جهازك.</h1><p className="subtitle">تابع التنفيذ، راجع النتائج، وتدخّل عند الحاجة.</p></div>
        <div className={`connection ${connectionStatus}`} role="status"><span className="connection-dot" />{connectionStatus === 'online' ? 'الإيدج متصل' : connectionStatus === 'offline' ? 'الإيدج غير متصل' : 'جارٍ الاتصال'}</div>
      </header>
      {syncError && <div className="ops-notice" role="status">{syncError} {lastUpdated ? 'المعروض آخر بيانات متاحة، وقد لا يعكس الحالة الحالية.' : 'ستظهر بيانات الجهاز عند استعادة الاتصال.'}</div>}
      <section className="ops-assistant"><div><span className="mini-emblem">✳</span><div><strong>خلّ المساعد يتولى التشغيل</strong><p>اطلب تحليل فيديو أو اسأل عن نتيجة مهمة.</p></div></div><button type="button" onClick={() => onAskAssistant('أريد تشغيل تحليل فيديو. ما المعلومات التي تحتاجها؟')}>ابدأ مع المساعد ↖</button></section>
      <section className="metrics" aria-label="ملخص المهام">
        <Metric label="قيد التنفيذ" value={lastUpdated ? stats.active : "—"} accent="blue" />
        <Metric label="مكتملة" value={lastUpdated ? stats.completed : "—"} accent="green" />
        <Metric label="تحتاج مراجعة" value={lastUpdated ? stats.failed : "—"} accent="red" />
        <Metric label="استهلاك المعالج" value={health ? `${health.cpu_percent.toFixed(0)}%` : '—'} accent="orange" />
      </section>

      <section className="workspace">
        <div className="tasks-panel">
          <div className="section-heading task-heading">
            <div>
              <p className="section-kicker">متابعة التنفيذ</p>
              <h2>مهام الجهاز <span className="ops-count">{lastUpdated ? tasks.length : "—"}</span></h2>
            </div>
            <button className="icon-button" type="button" onClick={() => void refresh()} aria-label="تحديث المهام" title="تحديث المهام" disabled={isLoading}>↻</button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>المهمة</th><th>الحالة</th><th>المعالج</th><th>الذاكرة</th><th aria-label="الإجراءات" /></tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="empty-state">جارٍ تحميل المهام…</td></tr>
                ) : tasks.length === 0 ? (
                  <tr><td colSpan={5} className="empty-state">{connectionStatus === 'offline' ? 'المهام غير متاحة حالياً. أعد الاتصال بالجهاز.' : 'لا توجد مهام بعد. ابدأ تحليل فيديو مع المساعد.'}</td></tr>
                ) : tasks.map((task) => (
                  <tr key={task.task_id}>
                    <td><button className="task-id" type="button" onClick={() => void showTask(task)}>#{task.task_id}</button><span className="pid">PID {task.pid ?? '—'}</span></td>
                    <td><StatusBadge status={task.status} /><TaskProgress progress={task.progress} /></td>
                    <td>{task.process_metrics?.cpu_percent?.toFixed(1) ?? '—'}{task.process_metrics ? '%' : ''}</td>
                    <td>{formatMemory(task.process_metrics?.memory_rss_bytes)}</td>
                    <td>{(task.status === 'running' || task.status === 'stopping') && <button className="stop-button" type="button" onClick={() => void stopTask(task)} disabled={isStopping !== null || task.status === 'stopping' || connectionStatus !== 'online'}>{isStopping === task.task_id || task.status === 'stopping' ? 'جارٍ الإيقاف' : 'إيقاف'}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {selectedTask && (
        <aside className="details-panel" aria-live="polite">
          <div className="section-heading">
            <div>
              <p className="section-kicker">تفاصيل التنفيذ</p>
              <h2>#{selectedTask.task_id} <StatusBadge status={selectedTask.status} /></h2>
            </div>
            <button className="close-button" type="button" onClick={() => setSelectedTask(null)} aria-label="إغلاق التفاصيل">×</button>
          </div>
          {detailError && <p className="ops-notice" role="status">{detailError}</p>}
          <button className="ops-explain" onClick={() => onAskAssistant(`راجع حالة المهمة ${selectedTask.task_id} وأحداثها واشرح لي النتيجة.`)}>✳ اشرح النتيجة مع المساعد ↖</button>
          <TaskProgress progress={selectedTask.progress} detailed />
          <dl className="details-grid">
            <div><dt>PID</dt><dd>{selectedTask.pid ?? '—'}</dd></div>
            <div><dt>رمز الخروج</dt><dd>{selectedTask.returncode ?? '—'}</dd></div>
            <div><dt>المعالج</dt><dd>{selectedTask.process_metrics?.cpu_percent?.toFixed(1) ?? '—'}%</dd></div>
            <div><dt>الذاكرة</dt><dd>{formatMemory(selectedTask.process_metrics?.memory_rss_bytes)}</dd></div>
          </dl>
          {selectedTask.last_error && <p className="error-text">{selectedTask.last_error}</p>}
          <div className="events">
            <div className="events-heading"><p className="events-title">سجل الأحداث</p><span>{events.length} حدث</span></div>
            {events.length ? (
              <div className="event-list">
                {events.slice().reverse().map((event, index) => (
                  <article className="event-row" key={`${event.timestamp ?? 'event'}-${index}`}>
                    <span className={`event-dot ${event.event_type === 'VIDEO_COMPLETED' ? 'complete' : ''}`} />
                    <div className="event-copy">
                      <strong>{eventLabel(event.event_type)}</strong>
                      <span>{event.video_id ? `الفيديو: ${event.video_id}` : 'مهمة إيدج'}</span>
                    </div>
                    <div className="event-meta">
                      {typeof event.metadata?.person_count === 'number' && <strong>{event.metadata.person_count} شخص</strong>}
                      {typeof event.metadata?.frame_index === 'number' && <span>الإطار {event.metadata.frame_index}</span>}
                      <time>{formatEventTime(event.timestamp)}</time>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="no-events">{detailsLoading ? 'جارٍ تحميل الأحداث…' : detailError ? 'الأحداث غير متاحة. ستتم إعادة المحاولة تلقائياً.' : 'لم تسجل هذه المهمة أي أحداث بعد.'}</p>}
          </div>
        </aside>
      )}
      {message && <p className="ops-notice" role="status">{message}</p>}
      <details className="ops-advanced"><summary>تشغيل تحليل فيديو <span>الملفات الموجودة على الجهاز</span></summary><form onSubmit={createTask}><div><label htmlFor="task-id">رقم المهمة</label><input id="task-id" required type="number" min="1" step="1" value={taskId} onChange={event => setTaskId(event.target.value)} placeholder="101" /></div><div><label htmlFor="video-id">اسم الفيديو</label><input id="video-id" dir="ltr" required value={videoId} onChange={event => setVideoId(event.target.value)} placeholder="test.mp4" /></div><button className="primary-button" disabled={isSubmitting || connectionStatus !== 'online'}>{isSubmitting ? 'جارٍ الإرسال…' : 'تشغيل المهمة'}</button></form><p>اختر اسم ملف داخل مجلد videos على الإيدج. المسارات والروابط والأوامر الحرة غير مسموحة.</p></details>
      <footer className="ops-footer"><span>تحديث تلقائي كل ٥ ثوانٍ</span><span>{lastUpdated ? `آخر اتصال ناجح: ${lastUpdated.toLocaleTimeString('ar-SA')}` : 'بانتظار بيانات الجهاز'}</span></footer>
    </main>
  );
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return <div className="metric"><span className={`metric-accent ${accent}`} /><p>{label}</p><strong>{value}</strong></div>;
}

function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`status ${status}`}>{statusLabels[status]}</span>;
}

function TaskProgress({ progress, detailed = false }: { progress?: Progress | null; detailed?: boolean }) {
  if (!progress) return <p className="ops-progress-note">لم يصل تحديث تقدم بعد</p>;
  return <div className="ops-progress">
    {progress.progress_percent != null && <><progress max={100} value={progress.progress_percent} aria-label="تقدم قراءة الفيديو" /><span>{progress.progress_percent}%</span></>}
    <p className="ops-progress-note">قُرئ {progress.frames_read} إطار · حُلّل {progress.frames_analyzed} إطار</p>
    {detailed && <p className="ops-progress-note">آخر تحديث: {formatEventTime(progress.updated_at ?? undefined)}{progress.total_frames == null ? ' · إجمالي الإطارات غير معروف' : ` · الإجمالي: ${progress.total_frames}`}</p>}
  </div>;
}
