import 'dotenv/config';
import { generateText, stepCountIs } from 'ai';
import { groq } from '@ai-sdk/groq';
import { systemPrompt } from '../prompts.js';
import { edgeTools } from './tools.js';
import type { AgentResponse, ChatMessage } from '../type.js';

const model = groq('openai/gpt-oss-120b');

export async function runAgent(userPrompt: string, history: ChatMessage[] = []): Promise<AgentResponse> {
  const result = await generateText({
    model,
    system: systemPrompt,
    messages: [...history, { role: 'user', content: userPrompt }],
    tools: edgeTools,
    stopWhen: stepCountIs(6),
    temperature: 0.2,
  });

  return {
    text: result.text || 'I could not complete that request.',
    toolCalls: result.steps.flatMap(step => step.toolCalls.map(({ toolName, input }) => ({ toolName, input }))),
  };
}
