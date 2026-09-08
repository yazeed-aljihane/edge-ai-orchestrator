import express from 'express';
import { createTask, getTask, stopTask, getHealth, getevents, getAllTasks } from './clients/edge.agent.js';
import { runAgent } from './ai-agent/tools/execute.js';

import { authenticate } from './security.js';

let router = express.Router();
router.use(['/task', '/tasks', '/agent'], authenticate);

function handleError(res: express.Response, error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
        console.error("Request timed out:", error);
        return res.status(504).json({ error: "Request timed out" });
    }
    const cause = error instanceof Error ? error.cause : undefined;

    if (
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        cause.code === "ECONNREFUSED"
    ) {
        return res.status(502).json({ error: "agent_unavailable" });
    }

    console.error("Internal server error:", error);
    return res.status(500).json({ error: "Internal server error" });
}
 
router.post("/task",async (req, res) => {
    const { task_id, operation, video_id } = req.body;
    if (Object.keys(req.body).some(key => !['task_id', 'operation', 'video_id'].includes(key)) ||
        !Number.isSafeInteger(task_id) || task_id <= 0 || operation !== 'video_analysis' ||
        typeof video_id !== 'string' || !/^[a-zA-Z0-9_-]+\.(mp4|avi|mov|mkv)$/.test(video_id)) {
        return res.status(400).json({ error: 'Invalid supported operation' });
    }
try {
    const agentResponse = await createTask({ task_id, operation, video_id });
    return res.status(agentResponse.status).json(agentResponse.body);
} catch (error) {
    return handleError(res, error);
}
});

router.get("/task/:task_id", async (req, res) => {
    const { task_id } = req.params;

    try {
        const agentResponse = await getTask(task_id);
        return res.status(agentResponse.status).json(agentResponse.body);
    } catch (error) {
        return handleError(res, error);
    }
});

router.post("/task/:task_id/stop", async (req, res) => {
    const { task_id } = req.params;

    try {
        const agentResponse = await stopTask(task_id);
        return res.status(agentResponse.status).json(agentResponse.body);
    } catch (error) {
        return handleError(res, error);
    }
});

router.get("/agent/health", async (req, res) => {
    try {
        const agentResponse = await getHealth();
        return res.status(agentResponse.status).json(agentResponse.body);
    } catch (error) {
        return handleError(res, error);
    }
});

router.get("/task/:task_id/events", async (req, res) => {
    const { task_id } = req.params;

    try {
        const agentResponse = await getevents(task_id);
        return res.status(agentResponse.status).json(agentResponse.body);
    } catch (error) {
        return handleError(res, error);
    }
});

router.get("/tasks", async (req, res) => {
    try {
        const agentResponse = await getAllTasks();
        return res.status(agentResponse.status).json(agentResponse.body);
    } catch (error) {
        return handleError(res, error);
    }
});

let activeChatRequests = 0;
router.post('/agent/chat', async (req, res) => {
    const { message } = req.body;
    const history = req.body.history ?? [];
    if (!Array.isArray(history) || history.length > 20 || history.some(item =>
        !item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || item.content.length > 12000
    )) {
        return res.status(400).json({ error: 'Invalid chat history' });
    }

    if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'message must be a non-empty string' });
    }

    if (message.length > 4_000) {
        return res.status(400).json({ error: 'message is too long' });
    }

    if (activeChatRequests >= 2) return res.status(429).json({ error: 'Too many active chat requests' });
    activeChatRequests++;
    try {
        return res.json(await runAgent(message.trim(), history.map(({ role, content }) => ({ role, content }))));
    } catch (error) {
        return handleError(res, error);
    } finally {
        activeChatRequests--;
    }
});



export { router };
