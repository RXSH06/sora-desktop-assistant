export interface WakeWordConfig {
  wakeWord: string; // e.g. "hey sora"
  enabled: boolean;
  sensitivity?: number; // 0.1 to 1.0, default 0.6
  modelPath?: string;
  engineType?: 'openwakeword' | 'acoustic_template' | 'auto';
}

export interface WakeWordDetectionResult {
  detected: boolean;
  wakeWord?: string;
  score?: number;
  timestamp: number;
}

export interface WakeWordEngine {
  init(config: WakeWordConfig): Promise<void>;
  processAudioChunk(chunk: Int16Array): WakeWordDetectionResult;
  start(): void;
  stop(): void;
  isActive(): boolean;
  onDetected(callback: (result: WakeWordDetectionResult) => void): () => void;
  updateConfig(config: Partial<WakeWordConfig>): void;
}
