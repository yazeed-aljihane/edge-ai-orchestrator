import express from 'express';
import { createTask, getTask, stopTask, getHealth } from './clients/edge.agent.js';

let router = express.Router();

 
router.post("/task",async (req, res) => {
    const { task_id, command } = req.body;

    if (!task_id || !command) {
        return res.status(400).json({ error: "Missing task_id or command in request body" });
    }
try {
    const agentResponse = await createTask({ task_id, command });
    return res.status(agentResponse.status).json(agentResponse.body);
} catch (error) {
    console.error("Error creating task:", error);
    return res.status(500).json({ error: "Failed to create task" });
}
});

router.get("/task/:task_id", async (req, res) => {
    const { task_id } = req.params;

    try {
        const agentResponse = await getTask(task_id);
        return res.status(agentResponse.status).json(agentResponse.body);
    } catch (error) {
        console.error("Error getting task:", error);
        return res.status(500).json({ error: "Failed to get task" });
    }
});

router.post("/task/:task_id/stop", async (req, res) => {
    const { task_id } = req.params;

    try {
        const agentResponse = await stopTask(task_id);
        return res.status(agentResponse.status).json(agentResponse.body);
    } catch (error) {
        console.error("Error stopping task:", error);
        return res.status(500).json({ error: "Failed to stop task" });
    }
});

router.get("/agent/health", async (req, res) => {
    try {
        const agentResponse = await getHealth();
        return res.status(agentResponse.status).json(agentResponse.body);
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.error("Health check request timed out:", error);
          return res
            .status(504)
            .json({ error: "Health check request timed out" });
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
          console.error("Error getting health:", error);
        return res.status(500).json({ error: "Failed to get health" });
    }
});


export { router };
