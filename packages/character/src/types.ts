export type CharacterState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'SUCCESS'
  | 'ERROR'
  | 'WAITING_FOR_CONFIRMATION';

export interface ConfirmationRequest {
  id: string;
  toolName: string;
  description: string;
  details?: Record<string, unknown>;
  createdAt: number;
}

export type CharacterEventType =
  | 'state_change'
  | 'speech'
  | 'status'
  | 'confirmation_required'
  | 'confirmation_resolved';

export interface CharacterEvent {
  type: CharacterEventType;
  state: CharacterState;
  text?: string;
  statusText?: string;
  confirmation?: ConfirmationRequest;
  timestamp: number;
}

export type CharacterRendererType =
  | 'vector_robot' // Default vector/SVG reactive robot
  | 'sprite_2d'
  | 'live2d'
  | 'lottie'
  | 'gif'
  | 'webm'
  | 'three_d'
  | 'vrm';

export interface CharacterAssetConfig {
  type: CharacterRendererType;
  basePath?: string;
  skin?: string;
  scale?: number;
  customAssets?: Partial<Record<CharacterState, string>>;
}

export interface CharacterController {
  getState(): CharacterState;
  setState(state: CharacterState): void;
  speak(text: string, durationMs?: number): void;
  showStatus(text: string): void;
  hideStatus(): void;
  requestConfirmation(request: ConfirmationRequest): Promise<boolean>;
  resolveConfirmation(id: string, approved: boolean): void;
  subscribe(listener: (event: CharacterEvent) => void): () => void;
  getHistory(): CharacterEvent[];
}
