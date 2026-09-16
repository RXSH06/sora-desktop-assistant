import { CharacterState, CharacterEvent, ConfirmationRequest } from '@assistant/character';
import { PermissionLevel, AuditLogEntry, PermissionPolicy } from '@assistant/permissions';
import { MemoryItem, MemoryCategory } from '@assistant/memory';

export interface AppConfig {
  geminiApiKey: string;
  geminiModel: string;
  geminiVoice: string;
  wakeWord: string;
  wakeWordEnabled: boolean;
  wakeWordSensitivity: number;
  alwaysOnTop: boolean;
  opacity: number;
  characterSize: number;
  speechBubbleEnabled: boolean;
  autoStartOnBoot: boolean;
  googleClientId: string;
  googleClientSecret: string;
  hasGoogleAuth: boolean;
}

export interface NovaAPI {
  // Config
  getConfig(): Promise<AppConfig>;
  updateConfig(config: Partial<AppConfig>): Promise<AppConfig>;

  // Character & Agent
  sendPrompt(prompt: string): Promise<void>;
  interrupt(): Promise<void>;
  emergencyStop(): Promise<void>;
  resetEmergencyStop(): Promise<void>;
  setMicMuted(muted: boolean): Promise<void>;

  // Audio Stream
  sendAudioChunk(base64Chunk: string): Promise<void>;

  // Confirmations
  resolveConfirmation(id: string, approved: boolean): Promise<void>;

  // Permissions
  getPolicies(): Promise<PermissionPolicy[]>;
  setPolicy(toolName: string, level: PermissionLevel): Promise<void>;
  getAuditLogs(): Promise<AuditLogEntry[]>;

  // Memory
  getMemory(): Promise<Record<MemoryCategory, MemoryItem[]>>;
  setMemory(category: MemoryCategory, key: string, value: unknown, description?: string): Promise<void>;
  deleteMemory(category: MemoryCategory, key: string): Promise<void>;
  clearMemory(category?: MemoryCategory): Promise<void>;

  // Google OAuth
  startGoogleAuth(): Promise<{ authUrl: string }>;
  disconnectGoogleAuth(): Promise<void>;

  // Subscriptions from main to renderer
  onCharacterEvent(callback: (event: CharacterEvent) => void): () => void;
  onAudioOutput(callback: (pcm24Base64: string) => void): () => void;
  onAudioInterrupt(callback: () => void): () => void;
  onConfirmationRequired(callback: (request: ConfirmationRequest) => void): () => void;
  onLogsUpdated(callback: (logs: any[]) => void): () => void;

  // Window Controls
  minimizeWindow(): Promise<void>;
  toggleDrawer(open: boolean): Promise<void>;
}

declare global {
  interface Window {
    assistantAPI: NovaAPI;
  }
}
