import express from 'express';
import { createTask, getTask } from './clients/edge.agent.js';

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

export { router };
