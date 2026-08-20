

type AgentResponse = {
    status: number;
    body: unknown;
};

export async function createTask(task: { task_id: number; command: string[] }): Promise<AgentResponse> {
    try {
        const response = await fetch("http://127.0.0.1:8000/task", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(task)
        });
        return {
            status: response.status,
            body: await response.json()
        };
    } catch (error) {
        console.error("Error creating task:", error);
        throw new Error("Failed to create task");
    }

}

export async function getTask(taskId: string): Promise<AgentResponse> {
    try {
        const response = await fetch(`http://127.0.0.1:8000/task/${encodeURIComponent(taskId)}`);
        return {
            status: response.status,
            body: await response.json()
        };
    } catch (error) {
        console.error("Error getting task:", error);
        throw new Error("Failed to get task");
    }
}
