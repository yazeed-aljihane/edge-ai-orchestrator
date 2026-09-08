# RIME — Edge AI Orchestrator

A local learning MVP for operating an Edge device through an AI assistant and an Arabic RTL operations interface. Ask about the device, discover video files, start analysis, inspect progress and events, or stop a task.

The focus is the complete operational flow: **request → tool → Edge workload → observed result**. Video analysis is currently a basic person detector, not a unique-person counter.

## Architecture

```text
React / Vite UI
  ├─ Assistant chat
  └─ Manual operations
          │ HTTP
          ▼
Cloud API — Express / TypeScript (:3000)
  ├─ AI agent — AI SDK + Groq
  ├─ Defined tools and input schemas
  └─ Authenticated Edge client
          │ HTTP + EDGE_API_TOKEN
          ▼
Edge Agent — FastAPI (:8000)
  ├─ Validates supported operations and video identifiers
  ├─ Owns processes, task state, metrics and events
  └─ Fixed video-analysis subprocess — OpenCV
```

Only Edge starts and stops workloads. The Cloud and browser do not execute user-supplied shell commands. The current services communicate over loopback on one machine; this is not a remote fleet deployment.

## Implemented

- Arabic chat with suggested requests, conversation context and expandable tool-call details. Responses arrive after execution; there is no token streaming.
- Operations view with device health, tasks, process metrics, progress, events and stop controls. Task details can be passed to the assistant for explanation.
- Manual video-analysis form using `task_id` and `video_id`. There is no camera ID or free-command field.
- Video filename discovery through the `list_videos` tool. The current listing returns filenames, not duration, dimensions or verified readability; launch validation is stricter than listing.
- Task lifecycle: `running`, `stopping`, `stopped`, `completed`, `failed`.
- Latest progress stored separately from the last 100 non-progress events per task.
- In-memory task state and conversation state; neither survives a service restart or page reload respectively.

## Local setup

Requirements: a recent Node.js version compatible with the installed Vite release, npm, Python 3.14+ and uv. The Edge workload runner targets macOS/Linux and uses Unix resource limits.

From the repository root:

```sh
npm ci
```

Create a private `.env` at the repository root with these settings. Replace the placeholders; never commit credentials.

```dotenv
GROQ_API_KEY=replace-with-your-groq-key
EDGE_API_TOKEN=replace-with-an-independent-random-key-at-least-32-characters
OPERATOR_API_TOKEN=replace-with-another-independent-random-key-at-least-32-characters
LOCAL_DEV_AUTH=true
```

Generate each internal key independently, for example with `openssl rand -hex 32`. Node loads `.env` using `dotenv`; Edge reads its token from the environment or the root `.env`. Groq currently uses `openai/gpt-oss-120b`. Manual operations do not require an LLM call.

Install Edge dependencies:

```sh
cd edge-agent
uv sync --locked
```

Place video files directly in `edge-agent/videos/`. Supported filename patterns use ASCII letters, digits, `_` or `-`, followed by lowercase `.mp4`, `.avi`, `.mov` or `.mkv`, for example `entrance.mp4`. The decoder must also support the actual video format.

Run these in separate terminals:

```sh
# Edge — from edge-agent/
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```sh
# Cloud — from the repository root
npm run dev
```

```sh
# UI — from the repository root
npm run dev:ui
```

Open the URL printed by Vite. The local access policy supports UI ports **5173 and 5174**; free one of these if Vite selects a higher port. Restart Edge after Python changes; the command above does not enable automatic reload.

### Access modes

- **Local development:** `npm run dev` sets `NODE_ENV=development`. When `LOCAL_DEV_AUTH=true` is also set, the UI opens without an operator key. The Cloud checks the loopback peer, allowed Host/Origin, browser fetch metadata and `X-Rime-Client: local-ui` header.
- **Operator authentication:** outside that explicit mode, enter `OPERATOR_API_TOKEN` in the login screen. The browser holds it in memory only. This grants one operator access to all tasks; there are no per-user roles or ownership rules.
- **Cloud → Edge:** `EDGE_API_TOKEN` is always required, including local development. Never put it in frontend code.

Local mode trusts programs and users on the machine; it is not authentication against local processes. Keep the development proxy bound to loopback. Remote deployment requires HTTPS and a separate deployment/access design.

To serve the built UI through Cloud, with operator authentication:

```sh
npm run build
NODE_ENV=production npm start
```

Open `http://127.0.0.1:3000`. Edge must also be running.

## Tools and API

| Assistant tool | Purpose |
| --- | --- |
| `get_agent_health` | Device health, CPU, memory and active tasks |
| `list_videos` | Filenames in the Edge videos directory |
| `list_tasks` | Task states, metrics and latest progress |
| `get_task_status` | One task's state and latest progress |
| `get_task_events` | Retained detection/completion events |
| `start_video_analysis` | Analyze the selected `videoId`; generates a task ID |
| `stop_task` | Stop a task by ID |

| Cloud endpoint | Purpose |
| --- | --- |
| `POST /agent/chat` | `{ "message": "...", "history": [] }`; returns text and tool calls |
| `GET /agent/health` | Proxy Edge health |
| `GET /tasks` | List tasks |
| `POST /task` | Start the supported operation |
| `GET /task/:task_id` | Inspect task and progress |
| `GET /task/:task_id/events` | Read retained events |
| `POST /task/:task_id/stop` | Request stop |
| `GET /health` | Cloud liveness, not Edge health |
| `GET /health/session` | UI access-mode discovery |

Edge exposes corresponding task routes, `GET /health` and `GET /videos`, all requiring its Bearer token. The `list_videos` tool calls the Edge client directly from Cloud; there is currently no public Cloud `/videos` proxy route.

Example in explicit local development mode, from the same machine:

```sh
curl http://127.0.0.1:3000/task \
  -H 'X-Rime-Client: local-ui' \
  -H 'Content-Type: application/json' \
  -d '{"task_id":123,"operation":"video_analysis","video_id":"test.mp4"}'

curl -H 'X-Rime-Client: local-ui' http://127.0.0.1:3000/task/123

curl -X POST -H 'X-Rime-Client: local-ui' \
  http://127.0.0.1:3000/task/123/stop
```

Outside local mode, use `Authorization: Bearer <OPERATOR_API_TOKEN>` instead. Task IDs must be positive safe integers and cannot be reused while retained in Edge memory.

## Progress and detection semantics

Analysis reads each frame and runs OpenCV HOG person detection on every tenth frame. It emits NDJSON over stdout:

- `PROGRESS`: initially, approximately once per second while frames are processed, and after the reading loop ends. Includes `frames_read`, `frames_analyzed`, `total_frames` and `progress_percent`. Edge stores only the latest progress with `updated_at`; these updates do not consume the detection event history.
- `PERSON_DETECTED`: emitted when the detected count is positive and differs from the previous analyzed frame. Includes `video_id`, count, previous count, frame index and an approximate position within the video.
- `VIDEO_COMPLETED`: emitted after the reading loop ends. Includes the last detected count, read/analyzed frame counts, FPS and total frames.

Example progress field in a task response:

```json
{
  "frames_read": 600,
  "frames_analyzed": 60,
  "total_frames": 1000,
  "progress_percent": 60,
  "updated_at": "2026-09-09T00:00:00+00:00"
}
```

The UI polls task data every five seconds. Progress is the last observation, not proof of successful completion; inspect task status too. Unknown/invalid FPS and frame totals become `null`, and an unknown total produces no percentage. Timestamp is processing time; `video_time_seconds` uses `(frame_index - 1) / fps`, an approximation for constant-frame-rate video.

### Accuracy limits

**Do not sum detections or events to infer unique people.** The detector has no identity tracking: a person reappearing after a cut cannot be recognized as the same person. Detection may also miss people or generate false positives.

`person_count` describes one analyzed frame; `last_person_count` describes the last analyzed frame, not a video-wide total. If no frame was analyzed, the latter is `null`. Sampling every tenth frame can miss brief appearances. Events are count-change notifications, not an exhaustive timeline, and only the latest 100 non-progress events are retained.

Tracking, matching people across cuts (re-identification), and a validated unique-person count are deferred. There is no enforced guard yet preventing the assistant from misinterpreting these counts. The current reader also does not distinguish normal EOF from every possible decoder read failure.

## Execution safeguards

- Edge accepts only `video_analysis` with a validated video identifier; extra request fields and free commands are rejected even when bypassing Cloud.
- Launch paths are constrained to the video directory and symlinks are rejected. Only trusted administrators should write code or video files.
- Fixed Python executable/workload entrypoint; no shell command construction.
- Maximum 2 active workloads and 100 retained tasks. Restart clears task history.
- Maximum 300 seconds wall time, 240 seconds CPU, 128 open files and no core dumps. Linux also applies a 2 GiB address-space limit; macOS has no memory cap here.
- Workload launch refuses root and passes a restricted environment without application tokens. Stop requests send termination, then force-kill after a five-second grace period if needed.
- Cloud allows at most 2 concurrent chat requests; agent execution is limited to 6 steps.

These controls are **not an OS sandbox**. Workloads retain the service account's filesystem permissions. Deployment isolation using a dedicated account/container and credential separation remains future work.

## Source layout

```text
src/
  server.ts                 HTTP server and access-mode discovery
  app.ts                    Cloud routes
  security.ts               Operator auth and local access checks
  clients/edge.agent.ts     Authenticated Edge HTTP client
  ai-agent/
    type.ts                 Agent types
    prompts.ts              Agent instructions
    tools/tools.ts          Tool definitions
    tools/execute.ts        runAgent execution
edge-agent/
  main.py                   Lifecycle, state, APIs and stream consumers
  security.py               Auth, operation schema and video validation
  workload_runner.py        Fixed entrypoint and resource limits
  video_analysis.py         Detection and progress events
frontend/src/
  App.tsx                   Chat and access screen
  Operations.tsx            Manual operations and progress
  api.ts                    Browser request headers
```

## Validation

From the repository root:

```sh
npm run typecheck
npm run build
node tests/local-auth.mjs
edge-agent/.venv/bin/python -m unittest discover -s edge-agent -p 'test_*.py'
```

The Python tests cover request authentication, launch constraints and simulated progress/event routing. They do not establish real-video detection accuracy. End-to-end chat requires a valid Groq key and running Edge; test it by listing videos, analyzing one, inspecting progress/events and stopping a running task.

Next work: richer video metadata, clearer analysis summaries and error reporting, then identity tracking only when required. Database persistence, fleet management and production isolation are not implemented.
