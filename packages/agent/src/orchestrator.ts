import { CharacterController, CharacterState } from '@octo/character';
import { PermissionManager } from '@octo/permissions';
import { ToolRegistry } from '@octo/tools';
import { MemoryStore } from '@octo/memory';
import { GeminiLiveClient, GeminiLiveToolCall } from '@octo/gemini';
import { AudioPlaybackQueue } from '@octo/audio';
import { WakeWordEngine } from '@octo/wakeword';
import { TaskContext, TaskStep, AgentLog } from './types.js';

export interface AgentOrchestratorOptions {
  character: CharacterController;
  permissions: PermissionManager;
  tools: ToolRegistry;
  memory: MemoryStore;
  gemini: GeminiLiveClient;
  audioQueue: AudioPlaybackQueue;
  wakeWord: WakeWordEngine;
}

export class AgentOrchestrator {
  private character: CharacterController;
  private permissions: PermissionManager;
  private tools: ToolRegistry;
  private memory: MemoryStore;
  private gemini: GeminiLiveClient;
  private audioQueue: AudioPlaybackQueue;
  private wakeWord: WakeWordEngine;

  private currentTask: TaskContext | null = null;
  private logs: AgentLog[] = [];
  private isProcessingPrompt: boolean = false;
  private pendingConfirmationStep: TaskStep | null = null;

  constructor(options: AgentOrchestratorOptions) {
    this.character = options.character;
    this.permissions = options.permissions;
    this.tools = options.tools;
    this.memory = options.memory;
    this.gemini = options.gemini;
    this.audioQueue = options.audioQueue;
    this.wakeWord = options.wakeWord;

    this.setupListeners();
  }

  private setupListeners(): void {
    // 1. Wake word events
    this.wakeWord.onDetected((result) => {
      this.log('INFO', `Wake word detected: "${result.wakeWord}" (score: ${result.score?.toFixed(2)})`);
      this.handleWakeWordTrigger();
    });

    // 2. Gemini Live events
    this.gemini.subscribe((event) => {
      switch (event.type) {
        case 'connected':
          this.log('INFO', 'Gemini Live session connected');
          break;

        case 'disconnected':
          this.log('WARN', `Gemini Live disconnected: ${event.reason || 'Unknown reason'}`);
          break;

        case 'text':
          this.handleGeminiText(event.text);
          break;

        case 'audio':
          this.handleGeminiAudio(event.pcm24Base64);
          break;

        case 'tool_call':
          this.handleToolCalls(event.toolCalls);
          break;

        case 'interrupted':
          this.handleInterruption();
          break;

        case 'turn_complete':
          this.handleTurnComplete();
          break;

        case 'error':
          this.log('ERROR', `Gemini Live error: ${event.error.message}`, event.error);
          this.character.setState('ERROR');
          this.character.speak('I encountered an error connecting to Gemini.', 4000);
          break;
      }
    });
  }

  handleWakeWordTrigger(): void {
    this.character.setState('LISTENING');
    this.character.showStatus('Listening...');
    // If not connected, connect to Gemini Live
    if (!this.gemini.isConnected()) {
      this.gemini.connect().catch((err) => {
        this.log('ERROR', 'Failed to connect to Gemini Live on wake word:', err);
      });
    }
  }

  async processUserTextPrompt(prompt: string): Promise<void> {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) return;

    // Check for interruption command like "stop" or "cancel"
    if (/^(stop|cancel|shut up|halt|abort)$/i.test(cleanPrompt)) {
      this.handleInterruption();
      return;
    }

    this.log('INFO', `User prompt: "${cleanPrompt}"`);
    this.character.setState('THINKING');
    this.character.showStatus('Thinking...');

    // Resolve memory shortcuts (e.g. "my Companion Robot project" -> "/home/user/Projects/Companion Robot")
    const resolvedPrompt = this.memory.resolveShortcut(cleanPrompt);

    this.currentTask = {
      id: `task_${Date.now()}`,
      userPrompt: resolvedPrompt,
      state: 'THINKING',
      steps: [],
      startedAt: Date.now(),
    };

    if (!this.gemini.isConnected()) {
      try {
        await this.gemini.connect();
      } catch (err: any) {
        this.character.setState('ERROR');
        this.character.speak('Could not connect to Gemini API. Please check your API key.', 4000);
        return;
      }
    }

    this.gemini.sendTextMessage(resolvedPrompt);
  }

  private handleGeminiText(text: string): void {
    this.log('DEBUG', `Gemini text: "${text}"`);
    this.character.speak(text, 6000);
    this.character.setState('SPEAKING');
  }

  private handleGeminiAudio(pcm24Base64: string): void {
    this.character.setState('SPEAKING');
    this.audioQueue.enqueueBase64(pcm24Base64);
  }

  private async handleToolCalls(toolCalls: GeminiLiveToolCall[]): Promise<void> {
    this.character.setState('EXECUTING');

    for (const call of toolCalls) {
      this.log('INFO', `Tool requested: ${call.name}`, call.args);
      const step: TaskStep = {
        id: call.id,
        toolName: call.name,
        args: call.args,
        status: 'EXECUTING',
        timestamp: Date.now(),
      };
      this.currentTask?.steps.push(step);

      this.character.showStatus(`Executing ${call.name.replace(/_/g, ' ')}...`);

      // Check permission level
      const permLevel = this.permissions.getToolLevel(call.name);
      if (permLevel === 'CONFIRM') {
        this.character.setState('WAITING_FOR_CONFIRMATION');
      }

      // Execute tool
      const result = await this.tools.execute(call.name, call.args);
      step.result = result;
      step.status = result.success ? 'COMPLETED' : 'FAILED';

      this.log(
        result.success ? 'INFO' : 'WARN',
        `Tool completed: ${call.name} (success: ${result.success})`,
        result
      );

      // Return result to Gemini Live
      this.gemini.sendToolResponse(call.id, result);
    }

    this.character.setState('THINKING');
  }

  handleInterruption(): void {
    this.log('INFO', 'Assistant interrupted by user.');
    this.audioQueue.interrupt();
    this.character.hideStatus();
    this.character.speak('Stopped.', 1500);
    this.character.setState('IDLE');
    this.gemini.sendInterruptionNotice();
  }

  emergencyStop(): void {
    this.log('WARN', 'EMERGENCY STOP TRIGGERED (Ctrl+Shift+Esc)');
    this.permissions.triggerEmergencyStop();
    this.audioQueue.interrupt();
    this.character.setState('ERROR');
    this.character.showStatus('EMERGENCY STOP ACTIVE');
    this.character.speak('Emergency stop triggered. All actions aborted.', 4000);
    if (this.currentTask) {
      this.currentTask.error = 'Emergency stop triggered';
      this.currentTask.completedAt = Date.now();
    }
  }

  resetEmergencyStop(): void {
    this.permissions.resetEmergencyStop();
    this.character.setState('IDLE');
    this.character.hideStatus();
    this.log('INFO', 'Emergency stop reset.');
  }

  private handleTurnComplete(): void {
    this.character.hideStatus();
    if (this.audioQueue.hasPending()) {
      this.character.setState('SPEAKING');
    } else {
      if (this.currentTask && this.currentTask.steps.length > 0) {
        this.character.setState('SUCCESS');
        setTimeout(() => {
          if (this.character.getState() === 'SUCCESS') {
            this.character.setState('IDLE');
          }
        }, 2500);
      } else {
        this.character.setState('IDLE');
      }
    }
  }

  log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: unknown): void {
    // Sanitized logging: never log sensitive tokens or keys
    const entry: AgentLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      level,
      message,
      data: this.sanitizeLogData(data),
      timestamp: Date.now(),
    };
    this.logs.unshift(entry);
    if (this.logs.length > 300) {
      this.logs.pop();
    }
    console.log(`[${entry.level}] ${entry.message}`);
  }

  private sanitizeLogData(data: unknown): unknown {
    if (!data) return data;
    try {
      const str = JSON.stringify(data);
      const sanitized = str
        .replace(/"apiKey":\s*"[^"]+"/g, '"apiKey":"***"')
        .replace(/"access_token":\s*"[^"]+"/g, '"access_token":"***"')
        .replace(/"refresh_token":\s*"[^"]+"/g, '"refresh_token":"***"')
        .replace(/"password":\s*"[^"]+"/g, '"password":"***"');
      return JSON.parse(sanitized);
    } catch {
      return '[Complex Data]';
    }
  }

  getLogs(limit: number = 50): AgentLog[] {
    return this.logs.slice(0, limit);
  }

  getCurrentTask(): TaskContext | null {
    return this.currentTask;
  }
}
