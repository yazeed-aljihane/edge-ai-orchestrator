export type EmptyInput = Record<string, never>;

export type TaskInput = {
  taskId: number;
};

export type VideoAnalysisInput = {
  videoId: string;
};

export type EdgeResponse = {
  status: number;
  body: unknown;
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AgentToolCall = {
  toolName: string;
  input: unknown;
};

export type AgentResponse = {
  text: string;
  toolCalls: AgentToolCall[];
};
