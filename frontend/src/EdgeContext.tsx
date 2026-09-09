import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from './api';

type TaskStatus = 'running' | 'stopping' | 'stopped' | 'completed' | 'failed';

type Task = {
  task_id: number;
  video_id?: string;
  status: TaskStatus;
  progress?: { progress_percent: number | null } | null;
};

type Health = {
  cpu_percent: number;
  memory_percent: number;
  active_tasks: number;
};

type TaskEvent = {
  event_type?: string;
  timestamp?: string;
  metadata?: { person_count?: number; frame_index?: number };
};

const statusLabel: Record<TaskStatus, string> = {
  running: 'يعمل',
  stopping: 'يتوقف',
  stopped: 'متوقف',
  completed: 'مكتمل',
  failed: 'فشل',
};

function timeLabel(timestamp?: string) {
  if (!timestamp) return 'الآن';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('ar-SA', { hour: 'numeric', minute: '2-digit' }).format(date);
}

export default function EdgeContext({
  onOpenOperations,
  onAsk,
}: {
  onOpenOperations: () => void;
  onAsk: (prompt: string) => void;
}) {
  const [health, setHealth] = useState<Health | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [healthResponse, taskResponse] = await Promise.all([
        apiFetch('/agent/health', { signal: AbortSignal.timeout(8000) }),
        apiFetch('/tasks', { signal: AbortSignal.timeout(8000) }),
      ]);
      if (!healthResponse.ok || !taskResponse.ok) throw new Error('offline');
      const nextHealth = await healthResponse.json() as Health;
      const taskBody = await taskResponse.json() as { tasks: Task[] };
      const nextTasks = [...taskBody.tasks].sort((a, b) => b.task_id - a.task_id);
      setHealth(nextHealth);
      setTasks(nextTasks);
      setOnline(true);

      const eventTask = nextTasks.find(task => task.status === 'running') ?? nextTasks[0];
      if (!eventTask) {
        setEvents([]);
        return;
      }
      const eventResponse = await apiFetch(`/task/${eventTask.task_id}/events`, { signal: AbortSignal.timeout(8000) });
      if (eventResponse.ok) {
        const eventBody = await eventResponse.json() as { events: TaskEvent[] };
        setEvents(eventBody.events.slice(-3).reverse());
      }
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const activeTask = useMemo(
    () => tasks.find(task => task.status === 'running' || task.status === 'stopping'),
    [tasks],
  );

  return <aside className="edge-context" aria-label="حالة الإيدج ونتائج التحليل">
    <div className="context-heading">
      <div>
        <span className="context-kicker">EDGE STATUS</span>
        <h2>المشهد الآن</h2>
      </div>
      <button className="context-refresh" type="button" onClick={() => void refresh()} aria-label="تحديث حالة الإيدج">↻</button>
    </div>

    <section className={`edge-health-card ${online === false ? 'is-offline' : ''}`}>
      <div className="health-topline">
        <span><i className={`live-dot ${online === false ? 'offline' : online === null ? 'checking' : ''}`} />Edge Agent</span>
        <strong>{online === null ? 'جارٍ الفحص' : online ? 'متصل' : 'غير متصل'}</strong>
      </div>
      <div className="health-stats">
        <div><span>المعالج</span><strong>{health ? `${health.cpu_percent.toFixed(0)}%` : '—'}</strong></div>
        <div><span>الذاكرة</span><strong>{health ? `${health.memory_percent.toFixed(0)}%` : '—'}</strong></div>
        <div><span>نشطة</span><strong>{health?.active_tasks ?? '—'}</strong></div>
      </div>
    </section>

    <section className="context-section">
      <div className="context-section-title"><h3>آخر المهام</h3><button onClick={onOpenOperations}>عرض الكل</button></div>
      {tasks.length ? <div className="context-task-list">
        {tasks.slice(0, 3).map(task => <button className="context-task" key={task.task_id} onClick={() => onAsk(`راجع المهمة ${task.task_id} واشرح لي حالتها ونتائجها.`)}>
          <span className={`task-state-dot ${task.status}`} />
          <span className="context-task-copy"><strong dir="ltr">{task.video_id ?? `#${task.task_id}`}</strong><small dir="ltr">#${task.task_id}</small></span>
          <span className="context-task-meta"><strong>{statusLabel[task.status]}</strong><small>{task.progress?.progress_percent != null ? `${task.progress.progress_percent}%` : '—'}</small></span>
        </button>)}
      </div> : <div className="context-empty">{online === false ? 'ستظهر المهام عند اتصال الإيدج.' : 'لا توجد مهام حتى الآن.'}</div>}
    </section>

    <section className="context-section context-events">
      <div className="context-section-title"><h3>أحدث النتائج</h3>{activeTask && <span className="active-task-id" dir="ltr">#{activeTask.task_id}</span>}</div>
      {events.length ? <div className="context-event-list">
        {events.map((event, index) => <div className="context-event" key={`${event.timestamp ?? 'event'}-${index}`}>
          <span className={event.event_type === 'VIDEO_COMPLETED' ? 'event-glyph complete' : 'event-glyph'} />
          <div><strong>{event.event_type === 'VIDEO_COMPLETED' ? 'اكتمل التحليل' : event.event_type === 'PERSON_DETECTED' ? 'رصد في المقطع' : 'حدث جديد'}</strong><span>{typeof event.metadata?.person_count === 'number' ? `${event.metadata.person_count} شخص · الإطار ${event.metadata.frame_index ?? '—'}` : `الإطار ${event.metadata?.frame_index ?? '—'}`}</span></div>
          <time>{timeLabel(event.timestamp)}</time>
        </div>)}
      </div> : <div className="context-empty">لا توجد نتائج مسجلة.</div>}
    </section>

    <button className="context-primary" type="button" onClick={() => onAsk('ما حالة الإيدج والمهام الحالية؟ أعطني ملخصاً عملياً.')}>اسأل عن الحالة <span>↖</span></button>
  </aside>;
}
