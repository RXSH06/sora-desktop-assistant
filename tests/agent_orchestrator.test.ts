import { describe, it, expect, vi } from 'vitest';
import { AgentOrchestrator } from '../packages/agent/src/index.js';
import { DefaultCharacterController } from '../packages/character/src/index.js';
import { DefaultPermissionManager } from '../packages/permissions/src/index.js';
import { ToolRegistry } from '../packages/tools/src/index.js';
import { FileMemoryStore } from '../packages/memory/src/index.js';
import { AudioPlaybackQueue } from '../packages/audio/src/index.js';
import { LocalAcousticWakeWordEngine } from '../packages/wakeword/src/index.js';

describe('Agent Orchestrator', () => {
  it('handles multi-step execution lifecycle and interruptions', async () => {
    const character = new DefaultCharacterController();
    const permissions = new DefaultPermissionManager();
    const tools = new ToolRegistry(permissions);
    const memory = new FileMemoryStore();
    const audioQueue = new AudioPlaybackQueue();
    const wakeWord = new LocalAcousticWakeWordEngine();

    const mockGeminiClient = {
      isConnected: vi.fn().mockReturnValue(true),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      sendTextMessage: vi.fn(),
      sendToolResponse: vi.fn(),
      sendInterruptionNotice: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => {}),
    };

    const orchestrator = new AgentOrchestrator({
      character,
      permissions,
      tools,
      memory,
      gemini: mockGeminiClient as any,
      audioQueue,
      wakeWord,
    });

    // 1. Process prompt
    await orchestrator.processUserTextPrompt('Find my ESP32 project');
    expect(mockGeminiClient.sendTextMessage).toHaveBeenCalled();
    expect(character.getState()).toBe('THINKING');

    // 2. Interruption
    orchestrator.handleInterruption();
    expect(character.getState()).toBe('IDLE');
    expect(mockGeminiClient.sendInterruptionNotice).toHaveBeenCalled();

    // 3. Emergency Stop
    orchestrator.emergencyStop();
    expect(character.getState()).toBe('ERROR');
    expect(permissions.isEmergencyStopped()).toBe(true);

    orchestrator.resetEmergencyStop();
    expect(character.getState()).toBe('IDLE');
    expect(permissions.isEmergencyStopped()).toBe(false);
  });
});
