import { describe, it, expect, vi } from 'vitest';
import { DefaultCharacterController } from '../packages/character/src/index.js';

describe('Character Controller', () => {
  it('initializes in IDLE state', () => {
    const controller = new DefaultCharacterController();
    expect(controller.getState()).toBe('IDLE');
  });

  it('transitions states and emits events', () => {
    const controller = new DefaultCharacterController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.setState('LISTENING');
    expect(controller.getState()).toBe('LISTENING');
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'state_change',
        state: 'LISTENING',
      })
    );

    controller.setState('THINKING');
    expect(controller.getState()).toBe('THINKING');

    controller.setState('EXECUTING');
    expect(controller.getState()).toBe('EXECUTING');

    controller.setState('SPEAKING');
    expect(controller.getState()).toBe('SPEAKING');

    controller.setState('SUCCESS');
    expect(controller.getState()).toBe('SUCCESS');
  });

  it('emits speech and status events', () => {
    const controller = new DefaultCharacterController();
    const events: any[] = [];
    controller.subscribe((e) => events.push(e));

    controller.speak('Hello user!', 1000);
    expect(events.some((e) => e.type === 'speech' && e.text === 'Hello user!')).toBe(true);

    controller.showStatus('Searching Gmail...');
    expect(events.some((e) => e.type === 'status' && e.statusText === 'Searching Gmail...')).toBe(true);
  });

  it('handles confirmation requests and approvals', async () => {
    const controller = new DefaultCharacterController();

    const confPromise = controller.requestConfirmation({
      id: 'req_123',
      toolName: 'delete_file',
      description: 'Delete test.txt',
      createdAt: Date.now(),
    });

    expect(controller.getState()).toBe('WAITING_FOR_CONFIRMATION');

    controller.resolveConfirmation('req_123', true);
    const result = await confPromise;
    expect(result).toBe(true);
    expect(controller.getState()).toBe('EXECUTING');
  });
});
