import { SoraAPI, AppConfig } from '../shared/ipc.js';
import { CharacterEvent, ConfirmationRequest, CharacterState } from '@assistant/character';
import { PermissionLevel, PermissionPolicy, AuditLogEntry } from '@assistant/permissions';
import { MemoryCategory, MemoryItem } from '@assistant/memory';

class FallbackAssistantAPI implements SoraAPI {
  private config: AppConfig = {
    geminiApiKey: '',
    geminiModel: 'models/gemini-2.0-flash-exp',
    geminiVoice: 'Puck',
    wakeWord: 'hey sora',
    wakeWordEnabled: true,
    wakeWordSensitivity: 0.6,
    alwaysOnTop: true,
    opacity: 0.96,
    characterSize: 180,
    speechBubbleEnabled: true,
    autoStartOnBoot: false,
    googleClientId: '',
    googleClientSecret: '',
    hasGoogleAuth: false,
  };

  private charListeners: Set<(event: CharacterEvent) => void> = new Set();
  private audioListeners: Set<(pcm: string) => void> = new Set();
  private interruptListeners: Set<() => void> = new Set();
  private confListeners: Set<(req: ConfirmationRequest) => void> = new Set();
  private logListeners: Set<(logs: any[]) => void> = new Set();

  async getConfig(): Promise<AppConfig> {
    return { ...this.config };
  }

  async updateConfig(newConfig: Partial<AppConfig>): Promise<AppConfig> {
    this.config = { ...this.config, ...newConfig };
    return { ...this.config };
  }

  async sendPrompt(prompt: string): Promise<void> {
    console.log('[Browser Fallback API] User prompt:', prompt);
    this.emitChar({ type: 'state_change', state: 'THINKING', timestamp: Date.now() });
    this.emitChar({ type: 'status', state: 'THINKING', statusText: 'Thinking...', timestamp: Date.now() });

    setTimeout(() => {
      this.emitChar({ type: 'state_change', state: 'SPEAKING', timestamp: Date.now() });
      this.emitChar({
        type: 'speech',
        state: 'SPEAKING',
        text: `I received: "${prompt}". (Running in desktop preview)`,
        timestamp: Date.now(),
      });
      setTimeout(() => {
        this.emitChar({ type: 'state_change', state: 'IDLE', timestamp: Date.now() });
      }, 4000);
    }, 1200);
  }

  async interrupt(): Promise<void> {
    this.emitChar({ type: 'state_change', state: 'IDLE', timestamp: Date.now() });
    this.emitChar({ type: 'speech', state: 'IDLE', text: 'Stopped.', timestamp: Date.now() });
  }

  async emergencyStop(): Promise<void> {
    this.emitChar({ type: 'state_change', state: 'ERROR', timestamp: Date.now() });
    this.emitChar({ type: 'speech', state: 'ERROR', text: 'Emergency stop activated.', timestamp: Date.now() });
  }

  async resetEmergencyStop(): Promise<void> {
    this.emitChar({ type: 'state_change', state: 'IDLE', timestamp: Date.now() });
  }

  async setMicMuted(muted: boolean): Promise<void> {
    console.log('[Browser Fallback API] Mute:', muted);
  }

  async sendAudioChunk(base64Chunk: string): Promise<void> {
    // Process audio locally or ignore in browser preview
  }

  async resolveConfirmation(id: string, approved: boolean): Promise<void> {
    this.emitChar({
      type: 'confirmation_resolved',
      state: approved ? 'SUCCESS' : 'IDLE',
      timestamp: Date.now(),
    });
  }

  async getPolicies(): Promise<PermissionPolicy[]> {
    return [
      { toolName: 'search_files', level: 'SAFE', description: 'Search files and folders' },
      { toolName: 'read_file', level: 'SAFE', description: 'Read file contents' },
      { toolName: 'delete_file', level: 'CONFIRM', description: 'Delete file or directory' },
      { toolName: 'open_application', level: 'SAFE', description: 'Launch desktop app' },
      { toolName: 'browser_search', level: 'SAFE', description: 'Search via browser' },
    ];
  }

  async setPolicy(toolName: string, level: PermissionLevel): Promise<void> {}
  async getAuditLogs(): Promise<AuditLogEntry[]> {
    return [];
  }

  async getMemory(): Promise<Record<MemoryCategory, MemoryItem[]>> {
    return {
      projects: [{ category: 'projects', key: 'robot project', value: '~/Projects/Companion Robot', updatedAt: Date.now() }],
      frequent_paths: [{ category: 'frequent_paths', key: 'home', value: '/home/user', updatedAt: Date.now() }],
      user_preferences: [],
      applications: [],
      contacts: [],
      assistant_preferences: [],
      conversation_context: [],
    };
  }

  async setMemory(): Promise<void> {}
  async deleteMemory(): Promise<void> {}
  async clearMemory(): Promise<void> {}

  async startGoogleAuth(): Promise<{ authUrl: string }> {
    return { authUrl: 'https://accounts.google.com' };
  }

  async disconnectGoogleAuth(): Promise<void> {}

  onCharacterEvent(callback: (event: CharacterEvent) => void): () => void {
    this.charListeners.add(callback);
    return () => this.charListeners.delete(callback);
  }

  onAudioOutput(callback: (pcm: string) => void): () => void {
    this.audioListeners.add(callback);
    return () => this.audioListeners.delete(callback);
  }

  onAudioInterrupt(callback: () => void): () => void {
    this.interruptListeners.add(callback);
    return () => this.interruptListeners.delete(callback);
  }

  onConfirmationRequired(callback: (req: ConfirmationRequest) => void): () => void {
    this.confListeners.add(callback);
    return () => this.confListeners.delete(callback);
  }

  onLogsUpdated(callback: (logs: any[]) => void): () => void {
    this.logListeners.add(callback);
    return () => this.logListeners.delete(callback);
  }

  async minimizeWindow(): Promise<void> {}
  async toggleDrawer(open: boolean): Promise<void> {}

  private emitChar(event: CharacterEvent) {
    for (const l of this.charListeners) l(event);
  }
}

const fallbackInstance = new FallbackAssistantAPI();

export function getAssistantAPI(): SoraAPI {
  if (typeof window !== 'undefined' && window.assistantAPI) {
    return window.assistantAPI;
  }
  return fallbackInstance;
}
