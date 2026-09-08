import { jsonSchema, tool } from 'ai';
import type { EdgeResponse, EmptyInput, TaskInput, VideoAnalysisInput } from '../type.js';
import {
  createTask,
  getAllTasks,
  getevents,
  getHealth,
  getTask,
  stopTask,
  list_videos
} from '../../clients/edge.agent.js';

function taskId(): number {
  return Date.now();
}

function agentResult(response: EdgeResponse) {
  return { httpStatus: response.status, data: response.body };
}

export const edgeTools = {
  get_agent_health: tool({
    description: 'Get the current Edge Agent health and resource usage.',
    inputSchema: jsonSchema<EmptyInput>({ type: 'object', properties: {}, additionalProperties: false }),
    execute: async () => agentResult(await getHealth()),
  }),
  list_tasks: tool({
    description: 'List every task currently known by the Edge Agent.',
    inputSchema: jsonSchema<EmptyInput>({ type: 'object', properties: {}, additionalProperties: false }),
    execute: async () => agentResult(await getAllTasks()),
  }),
  get_task_status: tool({
    description: 'Get task status, video ID, latest progress (frames_read, frames_analyzed, total_frames, progress_percent, updated_at), metrics and errors. Progress is the last observation, not proof of completion. A null percentage means total frames are unknown.',
    inputSchema: jsonSchema<TaskInput>({
      type: 'object',
      properties: { taskId: { type: 'integer', minimum: 0 } },
      required: ['taskId'],
      additionalProperties: false,
    }),
    execute: async ({ taskId }) => agentResult(await getTask(String(taskId))),
  }),
  get_task_events: tool({
    description: 'Get the latest events emitted by one task.',
    inputSchema: jsonSchema<TaskInput>({
      type: 'object',
      properties: { taskId: { type: 'integer', minimum: 0 } },
      required: ['taskId'],
      additionalProperties: false,
    }),
    execute: async ({ taskId }) => agentResult(await getevents(String(taskId))),
  }),
  stop_task: tool({
    description: 'Stop a running task by task ID.',
    inputSchema: jsonSchema<TaskInput>({
      type: 'object',
      properties: { taskId: { type: 'integer', minimum: 0 } },
      required: ['taskId'],
      additionalProperties: false,
    }),
    execute: async ({ taskId }) => agentResult(await stopTask(String(taskId))),
  }),
  start_video_analysis: tool({
    description: 'Start the supported video analysis workload. A unique task ID is created automatically.',
    inputSchema: jsonSchema<VideoAnalysisInput>({
      type: 'object',
      properties: {
        videoId: { type: 'string', pattern: '^[a-zA-Z0-9_-]+\\.(mp4|avi|mov|mkv)$', description: 'Approved filename inside the Edge videos folder, e.g. test.mp4. Never a path or URL.' },
      },
      required: ['videoId'],
      additionalProperties: false,
    }),
    execute: async ({ videoId }) => {
      const id = taskId();
      const response = await createTask({
        task_id: id,
        operation: 'video_analysis', video_id: videoId,
      });

      return { taskId: id, ...agentResult(response) };
    },
  }),
  list_videos: tool({
    description: 'List all available videos in the Edge videos folder.',
    inputSchema: jsonSchema<EmptyInput>({ type: 'object', properties: {}, additionalProperties: false }),
    execute: async () => agentResult(await list_videos()),
  }),
};
