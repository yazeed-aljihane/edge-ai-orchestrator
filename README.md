# Edge AI Orchestrator

A small learning project that simulates cloud-to-edge orchestration for AI/CV workloads.

The project has two services:

- **Cloud Backend**: Node.js + Express + TypeScript API.
- **Edge Agent**: Python + FastAPI service that starts and manages Linux workloads with `asyncio` subprocesses.

The cloud service does not run workloads directly. It receives task requests, forwards them to the edge agent, and returns the agent response back to the caller.

## Architecture

```text
Client
  |
  | HTTP
  v
Cloud Backend :3000
  |
  | HTTP
  v
Edge Agent :8000
  |
  | asyncio subprocess
  v
Linux workload / AI-CV command
```

## Current Flow

1. A client sends a task to the cloud backend.
2. The cloud backend forwards the task to the edge agent.
3. The edge agent starts the command as an async subprocess.
4. The client can ask the cloud backend for task status.
5. The edge agent reports the process state.

Task states include:

- `running`
- `completed`
- `failed`
- `stopping`
- `stopped`

## Cloud Backend

Source:

- `src/server.ts`
- `src/app.ts`
- `src/clients/edge.agent.ts`

Endpoints:

```text
POST /task
GET  /task/:task_id
GET  /health
```

The cloud backend forwards the agent HTTP status code and JSON body as-is.

## Edge Agent

Source:

- `edge-agent/main.py`
- `edge-agent/worker.py`

Endpoints:

```text
POST /task
GET  /task/{task_id}
POST /task/{task_id}/stop
GET  /health
```

The agent keeps task state in memory and manages each workload through an `asyncio` subprocess.

## Example Request

Start a task through the cloud backend:

```bash
curl -X POST http://127.0.0.1:3000/task \
  -H "Content-Type: application/json" \
  -d '{"task_id":1,"command":["sleep","10"]}'
```

Check task status through the cloud backend:

```bash
curl http://127.0.0.1:3000/task/1
```

Stop a task directly through the edge agent:

```bash
curl -X POST http://127.0.0.1:8000/task/1/stop
```

## Run Locally

Install Node dependencies:

```bash
npm install
```

Run the cloud backend:

```bash
npm run dev
```

Run the edge agent from the `edge-agent` directory:

```bash
fastapi dev main.py
```

## Development

Type-check the cloud backend:

```bash
npm run typecheck
```

Build the cloud backend:

```bash
npm run build
```

## Notes

This is intentionally a small project. It does not include Docker orchestration, a database, persistent queues, or model storage. The focus is the basic orchestration contract between a cloud API and an edge agent that controls local workloads.
