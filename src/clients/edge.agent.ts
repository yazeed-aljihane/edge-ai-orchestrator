

type AgentResponse = {
    status: number;
    body: unknown;
};

type FetchWithTimeoutOptions = RequestInit & {
  timeout?: number;
};

async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeout = 3000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function createTask(task: { task_id: number; command: string[] }): Promise<AgentResponse> {
        const response = await fetchWithTimeout("http://127.0.0.1:8000/task", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(task),
        });
        return {
            status: response.status,
            body: await response.json()
        };


}

export async function getTask(taskId: string): Promise<AgentResponse> {
        const response = await fetchWithTimeout(
          `http://127.0.0.1:8000/task/${encodeURIComponent(taskId)}`,
        );
        return {
            status: response.status,
            body: await response.json()
        };
}

export async function stopTask(taskId: string): Promise<AgentResponse> {
        const response = await fetchWithTimeout(
          `http://127.0.0.1:8000/task/${encodeURIComponent(taskId)}/stop`,
          {
            method: "POST",
          },
        );
        return {
            status: response.status,
            body: await response.json()
        };
}

export async function getHealth(): Promise<AgentResponse> {
        const response = await fetchWithTimeout(`http://127.0.0.1:8000/health`);
        return {
            status: response.status,
            body: await response.json()
        };
    
}

export async function getevents(taskId: string): Promise<AgentResponse> {
        const response = await fetchWithTimeout(
          `http://127.0.0.1:8000/task/${encodeURIComponent(taskId)}/events`
        );
        return {
            status: response.status,
            body: await response.json()
        };
}