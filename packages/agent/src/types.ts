import { CharacterState } from '@octo/character';
import { ToolResult } from '@octo/tools';

export interface TaskStep {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'PENDING' | 'EXECUTING' | 'WAITING_CONFIRMATION' | 'COMPLETED' | 'FAILED';
  result?: ToolResult;
  timestamp: number;
}

export interface TaskContext {
  id: string;
  userPrompt: string;
  state: CharacterState;
  steps: TaskStep[];
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export interface AgentLog {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  data?: unknown;
  timestamp: number;
}
