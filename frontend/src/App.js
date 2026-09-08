import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
const statusLabels = {
    running: 'قيد التشغيل',
    stopping: 'جارٍ الإيقاف',
    stopped: 'متوقفة',
    completed: 'مكتملة',
    failed: 'فشلت',
};
async function request(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(body.error ?? body.message ?? 'تعذر إكمال الطلب');
    }
    return body;
}
function formatMemory(bytes) {
    if (!bytes)
        return '—';
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export default function App() {
    const [tasks, setTasks] = useState([]);
    const [health, setHealth] = useState(null);
    const [taskId, setTaskId] = useState('');
    const [command, setCommand] = useState('python worker.py');
    const [selectedTask, setSelectedTask] = useState(null);
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isStopping, setIsStopping] = useState(null);
    const [message, setMessage] = useState('');
    const refresh = useCallback(async (quiet = false) => {
        if (!quiet)
            setIsLoading(true);
        try {
            const [taskResponse, healthResponse] = await Promise.all([
                request('/tasks'),
                request('/agent/health'),
            ]);
            setTasks(taskResponse.tasks.sort((a, b) => b.task_id - a.task_id));
            setHealth(healthResponse);
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : 'تعذر الاتصال بالـ agent');
        }
        finally {
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
    async function createTask(event) {
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
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : 'تعذر تشغيل المهمة');
        }
        finally {
            setIsSubmitting(false);
        }
    }
    async function showTask(task) {
        setSelectedTask(task);
        setEvents([]);
        try {
            const [details, eventResponse] = await Promise.all([
                request(`/task/${task.task_id}`),
                request(`/task/${task.task_id}/events`),
            ]);
            setSelectedTask({ ...task, ...details });
            setEvents(eventResponse.events);
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : 'تعذر عرض تفاصيل المهمة');
        }
    }
    async function stopTask(task) {
        setIsStopping(task.task_id);
        setMessage('');
        try {
            await request(`/task/${task.task_id}/stop`, { method: 'POST' });
            await refresh(true);
            if (selectedTask?.task_id === task.task_id)
                await showTask(task);
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : 'تعذر إيقاف المهمة');
        }
        finally {
            setIsStopping(null);
        }
    }
    return (_jsxs("main", { className: "app-shell", children: [_jsxs("header", { className: "topbar", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "EDGE AI ORCHESTRATOR" }), _jsx("h1", { children: "\u0644\u0648\u062D\u0629 \u0645\u0647\u0627\u0645 \u0627\u0644\u062D\u0627\u0641\u0629" }), _jsx("p", { className: "subtitle", children: "\u062A\u0627\u0628\u0639 \u0648\u0634\u063A\u0651\u0644 \u0623\u062D\u0645\u0627\u0644 \u0627\u0644\u0639\u0645\u0644 \u0645\u0646 \u0645\u0643\u0627\u0646 \u0648\u0627\u062D\u062F." })] }), _jsxs("div", { className: `connection ${health?.status === 'OK' ? 'online' : ''}`, children: [_jsx("span", { className: "connection-dot" }), health?.status === 'OK' ? 'الـ agent متصل' : 'جارٍ التحقق من الاتصال'] })] }), _jsxs("section", { className: "metrics", "aria-label": "\u0645\u0644\u062E\u0635 \u0627\u0644\u0645\u0647\u0627\u0645", children: [_jsx(Metric, { label: "\u0646\u0634\u0637\u0629 \u0627\u0644\u0622\u0646", value: stats.active, accent: "blue" }), _jsx(Metric, { label: "\u0645\u0643\u062A\u0645\u0644\u0629", value: stats.completed, accent: "green" }), _jsx(Metric, { label: "\u0641\u0634\u0644\u062A", value: stats.failed, accent: "red" }), _jsx(Metric, { label: "\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0645\u0639\u0627\u0644\u062C", value: health ? `${health.cpu_percent.toFixed(0)}%` : '—', accent: "orange" })] }), _jsxs("section", { className: "workspace", children: [_jsxs("div", { className: "create-panel", children: [_jsx("div", { className: "section-heading", children: _jsxs("div", { children: [_jsx("p", { className: "section-kicker", children: "\u0645\u0647\u0645\u0629 \u062C\u062F\u064A\u062F\u0629" }), _jsx("h2", { children: "\u062A\u0634\u063A\u064A\u0644 \u062D\u0645\u0644 \u0639\u0645\u0644" })] }) }), _jsxs("form", { onSubmit: createTask, children: [_jsx("label", { htmlFor: "task-id", children: "\u0631\u0642\u0645 \u0627\u0644\u0645\u0647\u0645\u0629" }), _jsx("input", { id: "task-id", inputMode: "numeric", value: taskId, onChange: (event) => setTaskId(event.target.value), placeholder: "\u0645\u062B\u0627\u0644: 101" }), _jsx("label", { htmlFor: "command", children: "\u0623\u0645\u0631 \u0627\u0644\u062A\u0634\u063A\u064A\u0644" }), _jsx("input", { id: "command", dir: "ltr", value: command, onChange: (event) => setCommand(event.target.value), placeholder: "python worker.py" }), _jsx("p", { className: "form-note", children: "\u064A\u0641\u0635\u0644 \u0627\u0644\u0623\u0645\u0631 \u0625\u0644\u0649 \u0643\u0644\u0645\u0627\u062A \u0642\u0628\u0644 \u0625\u0631\u0633\u0627\u0644\u0647 \u0644\u0644\u0640 agent." }), _jsx("button", { className: "primary-button", type: "submit", disabled: isSubmitting, children: isSubmitting ? 'جارٍ التشغيل...' : 'تشغيل المهمة' })] }), message && _jsx("p", { className: "message", role: "status", children: message })] }), _jsxs("div", { className: "tasks-panel", children: [_jsxs("div", { className: "section-heading task-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "section-kicker", children: "\u0627\u0644\u0645\u0647\u0627\u0645" }), _jsx("h2", { children: "\u0643\u0644 \u0627\u0644\u0645\u0647\u0627\u0645" })] }), _jsx("button", { className: "icon-button", type: "button", onClick: () => void refresh(), "aria-label": "\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u0647\u0627\u0645", title: "\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u0647\u0627\u0645", children: "\u21BB" })] }), _jsx("div", { className: "table-wrap", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0627\u0644\u0645\u0647\u0645\u0629" }), _jsx("th", { children: "\u0627\u0644\u062D\u0627\u0644\u0629" }), _jsx("th", { children: "\u0627\u0644\u0645\u0639\u0627\u0644\u062C" }), _jsx("th", { children: "\u0627\u0644\u0630\u0627\u0643\u0631\u0629" }), _jsx("th", { "aria-label": "\u0625\u062C\u0631\u0627\u0621\u0627\u062A" })] }) }), _jsx("tbody", { children: isLoading ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "empty-state", children: "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u0647\u0627\u0645..." }) })) : tasks.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "empty-state", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0647\u0627\u0645 \u0628\u0639\u062F. \u0627\u0628\u062F\u0623 \u0628\u0625\u0646\u0634\u0627\u0621 \u0645\u0647\u0645\u0629 \u062C\u062F\u064A\u062F\u0629." }) })) : tasks.map((task) => (_jsxs("tr", { children: [_jsxs("td", { children: [_jsxs("button", { className: "task-id", type: "button", onClick: () => void showTask(task), children: ["#", task.task_id] }), _jsxs("span", { className: "pid", children: ["PID ", task.pid ?? '—'] })] }), _jsx("td", { children: _jsx(StatusBadge, { status: task.status }) }), _jsxs("td", { children: [task.process_metrics?.cpu_percent?.toFixed(1) ?? '—', task.process_metrics ? '%' : ''] }), _jsx("td", { children: formatMemory(task.process_metrics?.memory_rss_bytes) }), _jsx("td", { children: (task.status === 'running' || task.status === 'stopping') && _jsx("button", { className: "stop-button", type: "button", onClick: () => void stopTask(task), disabled: isStopping === task.task_id, children: isStopping === task.task_id ? 'جارٍ الإيقاف' : 'إيقاف' }) })] }, task.task_id))) })] }) })] })] }), selectedTask && (_jsxs("aside", { className: "details-panel", "aria-live": "polite", children: [_jsxs("div", { className: "section-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "section-kicker", children: "\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0645\u0647\u0645\u0629" }), _jsxs("h2", { children: ["#", selectedTask.task_id, " ", _jsx(StatusBadge, { status: selectedTask.status })] })] }), _jsx("button", { className: "close-button", type: "button", onClick: () => setSelectedTask(null), "aria-label": "\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644", children: "\u00D7" })] }), _jsxs("dl", { className: "details-grid", children: [_jsxs("div", { children: [_jsx("dt", { children: "\u0627\u0644\u0645\u0639\u0631\u0641" }), _jsx("dd", { children: selectedTask.pid ?? '—' })] }), _jsxs("div", { children: [_jsx("dt", { children: "\u0631\u0645\u0632 \u0627\u0644\u062E\u0631\u0648\u062C" }), _jsx("dd", { children: selectedTask.returncode ?? '—' })] }), _jsxs("div", { children: [_jsx("dt", { children: "\u0627\u0644\u0645\u0639\u0627\u0644\u062C" }), _jsxs("dd", { children: [selectedTask.process_metrics?.cpu_percent?.toFixed(1) ?? '—', "%"] })] }), _jsxs("div", { children: [_jsx("dt", { children: "\u0627\u0644\u0630\u0627\u0643\u0631\u0629" }), _jsx("dd", { children: formatMemory(selectedTask.process_metrics?.memory_rss_bytes) })] })] }), selectedTask.last_error && _jsx("p", { className: "error-text", children: selectedTask.last_error }), _jsxs("div", { className: "events", children: [_jsx("p", { className: "events-title", children: "\u0622\u062E\u0631 \u0627\u0644\u0623\u062D\u062F\u0627\u062B" }), events.length ? _jsx("pre", { children: JSON.stringify(events, null, 2) }) : _jsx("p", { className: "no-events", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u062D\u062F\u0627\u062B \u0645\u0633\u062C\u0644\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0645\u0647\u0645\u0629." })] })] }))] }));
}
function Metric({ label, value, accent }) {
    return _jsxs("div", { className: "metric", children: [_jsx("span", { className: `metric-accent ${accent}` }), _jsx("p", { children: label }), _jsx("strong", { children: value })] });
}
function StatusBadge({ status }) {
    return _jsx("span", { className: `status ${status}`, children: statusLabels[status] });
}
//# sourceMappingURL=App.js.map