import {
  CharacterState,
  CharacterEvent,
  ConfirmationRequest,
  CharacterController,
} from './types.js';

export class DefaultCharacterController implements CharacterController {
  private currentState: CharacterState = 'IDLE';
  private listeners: Set<(event: CharacterEvent) => void> = new Set();
  private eventHistory: CharacterEvent[] = [];
  private pendingConfirmations: Map<string, { resolve: (approved: boolean) => void }> = new Map();
  private speechTimeout: NodeJS.Timeout | null = null;
  private statusTimeout: NodeJS.Timeout | null = null;

  getState(): CharacterState {
    return this.currentState;
  }

  setState(newState: CharacterState): void {
    if (this.currentState === newState) return;
    this.currentState = newState;
    this.emit({
      type: 'state_change',
      state: this.currentState,
      timestamp: Date.now(),
    });
  }

  speak(text: string, durationMs: number = 5000): void {
    if (this.speechTimeout) {
      clearTimeout(this.speechTimeout);
      this.speechTimeout = null;
    }

    this.emit({
      type: 'speech',
      state: this.currentState,
      text,
      timestamp: Date.now(),
    });

    if (durationMs > 0) {
      this.speechTimeout = setTimeout(() => {
        this.emit({
          type: 'speech',
          state: this.currentState,
          text: '',
          timestamp: Date.now(),
        });
      }, durationMs);
    }
  }

  showStatus(text: string): void {
    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout);
      this.statusTimeout = null;
    }

    this.emit({
      type: 'status',
      state: this.currentState,
      statusText: text,
      timestamp: Date.now(),
    });
  }

  hideStatus(): void {
    this.emit({
      type: 'status',
      state: this.currentState,
      statusText: '',
      timestamp: Date.now(),
    });
  }

  requestConfirmation(request: ConfirmationRequest): Promise<boolean> {
    this.setState('WAITING_FOR_CONFIRMATION');
    this.emit({
      type: 'confirmation_required',
      state: 'WAITING_FOR_CONFIRMATION',
      confirmation: request,
      timestamp: Date.now(),
    });

    return new Promise<boolean>((resolve) => {
      this.pendingConfirmations.set(request.id, { resolve });
    });
  }

  resolveConfirmation(id: string, approved: boolean): void {
    const pending = this.pendingConfirmations.get(id);
    if (pending) {
      this.pendingConfirmations.delete(id);
      pending.resolve(approved);

      this.emit({
        type: 'confirmation_resolved',
        state: approved ? 'SUCCESS' : 'IDLE',
        confirmation: { id, toolName: '', description: '', createdAt: Date.now() },
        timestamp: Date.now(),
      });

      this.setState(approved ? 'EXECUTING' : 'IDLE');
    }
  }

  subscribe(listener: (event: CharacterEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getHistory(): CharacterEvent[] {
    return [...this.eventHistory];
  }

  private emit(event: CharacterEvent): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > 200) {
      this.eventHistory.shift();
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in character event listener:', err);
      }
    }
  }
}
