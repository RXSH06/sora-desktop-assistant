import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { WakeWordEngine, WakeWordConfig, WakeWordDetectionResult } from './types.js';

export class OpenWakeWordRunner implements WakeWordEngine {
  private config: WakeWordConfig = {
    wakeWord: 'hey sora',
    enabled: true,
    sensitivity: 0.6,
  };
  private process: ChildProcess | null = null;
  private running: boolean = false;
  private listeners: Set<(result: WakeWordDetectionResult) => void> = new Set();
  private lastDetectionTime: number = 0;

  async init(config: WakeWordConfig): Promise<void> {
    this.config = { ...this.config, ...config };
  }

  updateConfig(config: Partial<WakeWordConfig>): void {
    this.config = { ...this.config, ...config };
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Check if python worker script exists
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'openwakeword_worker.py');
    if (!fs.existsSync(scriptPath)) {
      return;
    }

    try {
      this.process = spawn('python3', [scriptPath], {
        stdio: ['pipe', 'pipe', 'ignore'],
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString('utf-8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line.trim());
            if (parsed.detected && Date.now() - this.lastDetectionTime > 2500) {
              this.lastDetectionTime = Date.now();
              const result: WakeWordDetectionResult = {
                detected: true,
                wakeWord: parsed.wakeWord || this.config.wakeWord,
                score: parsed.score || 0.9,
                timestamp: Date.now(),
              };
              for (const cb of this.listeners) {
                cb(result);
              }
            }
          } catch {}
        }
      });

      this.process.on('error', () => {
        this.process = null;
      });
    } catch {
      this.process = null;
    }
  }

  stop(): void {
    this.running = false;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  isActive(): boolean {
    return this.running && this.config.enabled;
  }

  onDetected(callback: (result: WakeWordDetectionResult) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  processAudioChunk(chunk: Int16Array): WakeWordDetectionResult {
    if (!this.running || !this.config.enabled || !this.process?.stdin?.writable) {
      return { detected: false, timestamp: Date.now() };
    }

    try {
      const buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      this.process.stdin.write(buffer);
    } catch {}

    return { detected: false, timestamp: Date.now() };
  }
}
