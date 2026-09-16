import { WakeWordEngine, WakeWordConfig, WakeWordDetectionResult } from './types.js';

export class LocalAcousticWakeWordEngine implements WakeWordEngine {
  private config: WakeWordConfig = {
    wakeWord: 'hey octo',
    enabled: true,
    sensitivity: 0.6,
  };
  private running: boolean = false;
  private listeners: Set<(result: WakeWordDetectionResult) => void> = new Set();
  private lastDetectionTime: number = 0;
  private energyHistory: number[] = [];
  private speechStreak: number = 0;
  private silenceStreak: number = 0;

  async init(config: WakeWordConfig): Promise<void> {
    this.config = { ...this.config, ...config };
  }

  updateConfig(config: Partial<WakeWordConfig>): void {
    this.config = { ...this.config, ...config };
  }

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.energyHistory = [];
  }

  isActive(): boolean {
    return this.running && this.config.enabled;
  }

  onDetected(callback: (result: WakeWordDetectionResult) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  processAudioChunk(chunk: Int16Array): WakeWordDetectionResult {
    const timestamp = Date.now();
    if (!this.running || !this.config.enabled) {
      return { detected: false, timestamp };
    }

    // Debounce detections: at least 2.5 seconds between wake events
    if (timestamp - this.lastDetectionTime < 2500) {
      return { detected: false, timestamp };
    }

    // Calculate RMS energy of current audio frame
    let sumSquares = 0;
    let zeroCrossings = 0;
    for (let i = 0; i < chunk.length; i++) {
      const val = chunk[i] / 32768;
      sumSquares += val * val;
      if (i > 0 && ((chunk[i] >= 0 && chunk[i - 1] < 0) || (chunk[i] < 0 && chunk[i - 1] >= 0))) {
        zeroCrossings++;
      }
    }
    const rms = Math.sqrt(sumSquares / chunk.length);
    const zcr = zeroCrossings / chunk.length;

    // Threshold adjusted by sensitivity (sensitivity 0.6 -> thresh ~0.04)
    const threshold = (1.1 - (this.config.sensitivity || 0.6)) * 0.05;

    if (rms > threshold && zcr > 0.02 && zcr < 0.35) {
      this.speechStreak++;
      this.silenceStreak = 0;
    } else {
      this.silenceStreak++;
      if (this.silenceStreak > 4) {
        this.speechStreak = 0;
      }
    }

    this.energyHistory.push(rms);
    if (this.energyHistory.length > 30) {
      this.energyHistory.shift();
    }

    // Syllabic cadence detection for "Hey Oc-to" (approx 3 energetic peaks over 600ms - 1400ms)
    // When 3 rhythmic peaks matching syllables occur:
    if (this.energyHistory.length >= 20) {
      let peaks = 0;
      for (let i = 2; i < this.energyHistory.length - 2; i++) {
        if (
          this.energyHistory[i] > threshold * 1.5 &&
          this.energyHistory[i] > this.energyHistory[i - 1] &&
          this.energyHistory[i] > this.energyHistory[i + 1]
        ) {
          peaks++;
        }
      }

      // Check for 2 or 3 syllabic bursts ("hey", "oc", "to")
      if (peaks >= 2 && peaks <= 4 && this.speechStreak >= 3 && this.speechStreak <= 15) {
        const score = Math.min(1, rms / (threshold * 3));
        if (score >= (1.1 - (this.config.sensitivity || 0.6))) {
          this.lastDetectionTime = timestamp;
          this.speechStreak = 0;
          this.energyHistory = [];

          const result: WakeWordDetectionResult = {
            detected: true,
            wakeWord: this.config.wakeWord,
            score,
            timestamp,
          };

          for (const cb of this.listeners) {
            try {
              cb(result);
            } catch (err) {
              console.error('Error in wake word listener:', err);
            }
          }

          return result;
        }
      }
    }

    return { detected: false, timestamp };
  }
}
