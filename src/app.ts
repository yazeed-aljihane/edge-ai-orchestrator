import express from 'express';
import { createTask, getTask, stopTask, getHealth, getevents, getAllTasks } from './clients/edge.agent.js';

let router = express.Router();

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
    const { task_id, command } = req.body;

    if (!task_id || !command) {
        return res.status(400).json({ error: "Missing task_id or command in request body" });
    }
try {
    const agentResponse = await createTask({ task_id, command });
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



export { router };
