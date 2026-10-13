import { CharacterController, CharacterState } from '@assistant/character';
import { PermissionManager } from '@assistant/permissions';
import { ToolRegistry } from '@assistant/tools';
import { MemoryStore } from '@assistant/memory';
import { GeminiLiveClient, GeminiLiveToolCall } from '@assistant/gemini';
import { AudioPlaybackQueue } from '@assistant/audio';
import { WakeWordEngine } from '@assistant/wakeword';
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

  // Multi-turn conversation tracking
  private liveSessionActive: boolean = false;
  private conversationIdleTimer: NodeJS.Timeout | null = null;
  private playbackDrainTimer: NodeJS.Timeout | null = null;
  private waitingForPlaybackDrain: boolean = false;
  private turnHadContent: boolean = false; // true if current turn had audio/text (not just tool calls)

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
    this.liveSessionActive = true;
    this.clearConversationTimers();
    this.character.setState('LISTENING');
    this.character.showStatus('Listening...');
    this.character.speak("Hi! I'm listening. How can I help you?", 3500);

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
    this.liveSessionActive = true;
    this.clearConversationTimers();
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
    this.turnHadContent = true;
    this.log('DEBUG', `Gemini text: "${text}"`);
    this.character.speak(text, 6000);
    this.character.setState('SPEAKING');
  }

  private handleGeminiAudio(pcm24Base64: string): void {
    this.turnHadContent = true;
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
      this.gemini.sendToolResponse(call.id, call.name, result);
    }

    this.character.setState('THINKING');
  }

  handleInterruption(): void {
    this.log('INFO', 'Assistant interrupted by user.');
    this.liveSessionActive = false;
    this.clearConversationTimers();
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
    const hadContent = this.turnHadContent;
    this.turnHadContent = false; // reset for next turn

    // If this turn had NO audio/text content (e.g., bare turn_complete after tool calls),
    // don't transition — stay in current state and wait for Gemini's next response
    if (!hadContent && this.liveSessionActive) {
      this.log('DEBUG', 'Turn complete with no content (tool-only turn), staying in current state.');
      return;
    }

    this.character.hideStatus();

    if (this.audioQueue.hasPending()) {
      // Audio is still queued — wait for it to finish before deciding next state
      this.character.setState('SPEAKING');
      this.waitingForPlaybackDrain = true;
      this.startPlaybackDrainCheck();
    } else {
      // No pending audio — transition (with cooldown if live session)
      this.onResponseFullyDelivered();
    }
  }

  /**
   * Called when all response audio has been played back (or there was none).
   * If we're in an active live session, wait for speaker cooldown then re-enter LISTENING.
   */
  private onResponseFullyDelivered(): void {
    this.waitingForPlaybackDrain = false;
    this.clearPlaybackDrainTimer();

    if (this.liveSessionActive && this.gemini.isConnected()) {
      // CRITICAL: Wait 1.5s "speaker cooldown" before re-entering LISTENING.
      // This prevents the mic from picking up Sora's own audio output from
      // the speakers and sending it back to Gemini as new user input.
      // During cooldown, state stays non-LISTENING so no audio is streamed.
      this.log('INFO', 'Response delivered. Speaker cooldown before re-listening...');

      setTimeout(() => {
        if (this.liveSessionActive && this.gemini.isConnected()) {
          this.log('INFO', 'Cooldown complete. Re-entering LISTENING for follow-up.');
          this.character.setState('LISTENING');
          this.character.showStatus('Listening...');

          // Set a conversation idle timeout (20s of no speech → end session)
          this.startConversationIdleTimer();
        }
      }, 1500);
    } else {
      // One-shot or disconnected: go to SUCCESS/IDLE
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

  /**
   * Polls every 200ms to check if the audio playback queue has drained.
   * Once empty, transitions to the next conversation state.
   */
  private startPlaybackDrainCheck(): void {
    this.clearPlaybackDrainTimer();
    this.playbackDrainTimer = setInterval(() => {
      if (!this.audioQueue.hasPending()) {
        this.onResponseFullyDelivered();
      }
    }, 200) as unknown as NodeJS.Timeout;
  }

  /**
   * Starts a 20-second idle timer. If the user hasn't started speaking
   * within 20s after Sora's response, end the live conversation session.
   */
  private startConversationIdleTimer(): void {
    this.clearConversationIdleTimer();
    this.conversationIdleTimer = setTimeout(() => {
      if (this.character.getState() === 'LISTENING' && this.liveSessionActive) {
        this.log('INFO', 'Conversation idle for 20s. Ending live session.');
        this.endLiveSession();
      }
    }, 20000);
  }

  /**
   * Notify the orchestrator that the user has started speaking during
   * an active conversation. This resets the idle timer.
   */
  notifyUserSpeaking(): void {
    if (this.liveSessionActive) {
      this.clearConversationIdleTimer();
    }
  }

  /**
   * End the live conversation session and return to IDLE.
   */
  endLiveSession(): void {
    this.liveSessionActive = false;
    this.clearConversationTimers();
    this.character.hideStatus();
    if (this.character.getState() === 'LISTENING') {
      this.character.speak('Let me know if you need anything else.', 3000);
      this.character.setState('IDLE');
    }
  }

  /** Returns whether a live multi-turn conversation is active */
  isLiveSessionActive(): boolean {
    return this.liveSessionActive;
  }

  private clearConversationTimers(): void {
    this.clearConversationIdleTimer();
    this.clearPlaybackDrainTimer();
  }

  private clearConversationIdleTimer(): void {
    if (this.conversationIdleTimer) {
      clearTimeout(this.conversationIdleTimer);
      this.conversationIdleTimer = null;
    }
  }

  private clearPlaybackDrainTimer(): void {
    if (this.playbackDrainTimer) {
      clearInterval(this.playbackDrainTimer);
      this.playbackDrainTimer = null;
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
    if (entry.data !== undefined) {
      console.log(`[${entry.level}] ${entry.message}`, JSON.stringify(entry.data));
    } else {
      console.log(`[${entry.level}] ${entry.message}`);
    }
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
