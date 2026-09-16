import { GeminiFunctionDeclaration } from '@assistant/tools';

export type GeminiVoice = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede';

export interface GeminiLiveConfig {
  apiKey: string;
  model?: string; // e.g. "models/gemini-2.0-flash-exp"
  voice?: GeminiVoice; // default 'Puck'
  systemInstruction?: string;
  tools?: GeminiFunctionDeclaration[];
  responseModalities?: ('AUDIO' | 'TEXT')[];
}

export interface GeminiLiveToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiLiveToolResponse {
  id: string;
  response: {
    output: unknown;
  };
}

export type GeminiLiveEvent =
  | { type: 'connected' }
  | { type: 'disconnected'; reason?: string }
  | { type: 'audio'; pcm24Base64: string }
  | { type: 'text'; text: string }
  | { type: 'interrupted' }
  | { type: 'turn_complete' }
  | { type: 'tool_call'; toolCalls: GeminiLiveToolCall[] }
  | { type: 'error'; error: Error };
