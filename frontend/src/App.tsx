import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type TaskStatus = 'running' | 'stopping' | 'stopped' | 'completed' | 'failed';

type Task = {
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

const statusLabels: Record<TaskStatus, string> = {
  running: 'قيد التشغيل',
  stopping: 'جارٍ الإيقاف',
  stopped: 'متوقفة',
  completed: 'مكتملة',
  failed: 'فشلت',
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error ?? body.message ?? 'تعذر إكمال الطلب');
  }

  return body as T;
}

function formatMemory(bytes?: number): string {
  if (!bytes) return '—';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [taskId, setTaskId] = useState('');
  const [command, setCommand] = useState('python worker.py');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<unknown[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStopping, setIsStopping] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);

    try {
      const [taskResponse, healthResponse] = await Promise.all([
        request<{ tasks: Task[] }>('/tasks'),
        request<AgentHealth>('/agent/health'),
      ]);
      setTasks(taskResponse.tasks.sort((a, b) => b.task_id - a.task_id));
      setHealth(healthResponse);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر الاتصال بالـ agent');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const stats = useMemo(() => ({
    active: tasks.filter((task) => task.status === 'running' || task.status === 'stopping').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
  }), [tasks]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = Number(taskId);
    const parts = command.trim().split(/\s+/).filter(Boolean);

    if (!Number.isInteger(id) || id < 0 || parts.length === 0) {
      setMessage('أدخل رقم مهمة صحيحاً وأمراً للتشغيل.');
      return;
    }

    setIsSubmitting(true);
    setMessage('');

    try {
      await request('/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: id, command: parts }),
      });
      setTaskId('');
      setMessage('تم إرسال المهمة إلى جهاز الحافة.');
      await refresh(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر تشغيل المهمة');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function showTask(task: Task) {
    setSelectedTask(task);
    setEvents([]);

    try {
      const [details, eventResponse] = await Promise.all([
        request<Task>(`/task/${task.task_id}`),
        request<{ events: unknown[] }>(`/task/${task.task_id}/events`),
      ]);
      setSelectedTask({ ...task, ...details });
      setEvents(eventResponse.events);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر عرض تفاصيل المهمة');
    }
  }

  async function stopTask(task: Task) {
    setIsStopping(task.task_id);
    setMessage('');

    try {
      await request(`/task/${task.task_id}/stop`, { method: 'POST' });
      await refresh(true);
      if (selectedTask?.task_id === task.task_id) await showTask(task);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر إيقاف المهمة');
    } finally {
      setIsStopping(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">EDGE AI ORCHESTRATOR</p>
          <h1>لوحة مهام الحافة</h1>
          <p className="subtitle">تابع وشغّل أحمال العمل من مكان واحد.</p>
        </div>
        <div className={`connection ${health?.status === 'OK' ? 'online' : ''}`}>
          <span className="connection-dot" />
          {health?.status === 'OK' ? 'الـ agent متصل' : 'جارٍ التحقق من الاتصال'}
        </div>
      </header>

      <section className="metrics" aria-label="ملخص المهام">
        <Metric label="نشطة الآن" value={stats.active} accent="blue" />
        <Metric label="مكتملة" value={stats.completed} accent="green" />
        <Metric label="فشلت" value={stats.failed} accent="red" />
        <Metric label="استخدام المعالج" value={health ? `${health.cpu_percent.toFixed(0)}%` : '—'} accent="orange" />
      </section>

      <section className="workspace">
        <div className="create-panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">مهمة جديدة</p>
              <h2>تشغيل حمل عمل</h2>
            </div>
          </div>

          <form onSubmit={createTask}>
            <label htmlFor="task-id">رقم المهمة</label>
            <input id="task-id" inputMode="numeric" value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="مثال: 101" />
            <label htmlFor="command">أمر التشغيل</label>
            <input id="command" dir="ltr" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="python worker.py" />
            <p className="form-note">يفصل الأمر إلى كلمات قبل إرساله للـ agent.</p>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'جارٍ التشغيل...' : 'تشغيل المهمة'}
            </button>
          </form>

          {message && <p className="message" role="status">{message}</p>}
        </div>

        <div className="tasks-panel">
          <div className="section-heading task-heading">
            <div>
              <p className="section-kicker">المهام</p>
              <h2>كل المهام</h2>
            </div>
            <button className="icon-button" type="button" onClick={() => void refresh()} aria-label="تحديث المهام" title="تحديث المهام">↻</button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>المهمة</th><th>الحالة</th><th>المعالج</th><th>الذاكرة</th><th aria-label="إجراءات" /></tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="empty-state">جارٍ تحميل المهام...</td></tr>
                ) : tasks.length === 0 ? (
                  <tr><td colSpan={5} className="empty-state">لا توجد مهام بعد. ابدأ بإنشاء مهمة جديدة.</td></tr>
                ) : tasks.map((task) => (
                  <tr key={task.task_id}>
                    <td><button className="task-id" type="button" onClick={() => void showTask(task)}>#{task.task_id}</button><span className="pid">PID {task.pid ?? '—'}</span></td>
                    <td><StatusBadge status={task.status} /></td>
                    <td>{task.process_metrics?.cpu_percent?.toFixed(1) ?? '—'}{task.process_metrics ? '%' : ''}</td>
                    <td>{formatMemory(task.process_metrics?.memory_rss_bytes)}</td>
                    <td>{(task.status === 'running' || task.status === 'stopping') && <button className="stop-button" type="button" onClick={() => void stopTask(task)} disabled={isStopping === task.task_id}>{isStopping === task.task_id ? 'جارٍ الإيقاف' : 'إيقاف'}</button>}</td>
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
              <p className="section-kicker">تفاصيل المهمة</p>
              <h2>#{selectedTask.task_id} <StatusBadge status={selectedTask.status} /></h2>
            </div>
            <button className="close-button" type="button" onClick={() => setSelectedTask(null)} aria-label="إغلاق التفاصيل">×</button>
          </div>
          <dl className="details-grid">
            <div><dt>المعرف</dt><dd>{selectedTask.pid ?? '—'}</dd></div>
            <div><dt>رمز الخروج</dt><dd>{selectedTask.returncode ?? '—'}</dd></div>
            <div><dt>المعالج</dt><dd>{selectedTask.process_metrics?.cpu_percent?.toFixed(1) ?? '—'}%</dd></div>
            <div><dt>الذاكرة</dt><dd>{formatMemory(selectedTask.process_metrics?.memory_rss_bytes)}</dd></div>
          </dl>
          {selectedTask.last_error && <p className="error-text">{selectedTask.last_error}</p>}
          <div className="events">
            <p className="events-title">آخر الأحداث</p>
            {events.length ? <pre>{JSON.stringify(events, null, 2)}</pre> : <p className="no-events">لا توجد أحداث مسجلة لهذه المهمة.</p>}
          </div>
        </aside>
      )}
    </main>
  );
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return <div className="metric"><span className={`metric-accent ${accent}`} /><p>{label}</p><strong>{value}</strong></div>;
}

function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`status ${status}`}>{statusLabels[status]}</span>;
}
