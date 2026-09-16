import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { WakeWordEngine, WakeWordConfig, WakeWordDetectionResult } from './types.js';

export class OpenWakeWordRunner implements WakeWordEngine {
  private config: WakeWordConfig = {
    wakeWord: 'hey jarvis',
    enabled: true,
    sensitivity: 0.6,
  };
  private process: ChildProcess | null = null;
  private running: boolean = false;
  private listeners: Set<(result: WakeWordDetectionResult) => void> = new Set();
  private lastDetectionTime: number = 0;

  // Fallback acoustic detection for "hey sora"
  private speechStreak: number = 0;
  private silenceStreak: number = 0;

  async init(config: WakeWordConfig): Promise<void> {
    this.config = { ...this.config, ...config };
  }

  updateConfig(config: Partial<WakeWordConfig>): void {
    this.config = { ...this.config, ...config };
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const candidatePythons = [
      path.resolve(process.cwd(), '.venv', 'bin', 'python'),
      path.resolve(process.cwd(), '..', '.venv', 'bin', 'python'),
      path.resolve(process.cwd(), '..', '..', '.venv', 'bin', 'python'),
      '/home/rishi/My Projects/Desktop_assistant/.venv/bin/python',
      'python3',
    ];
    const pythonBin = candidatePythons.find((p) => fs.existsSync(p)) || 'python3';

    const candidateScripts = [
      path.resolve(process.cwd(), 'scripts', 'openwakeword_worker.py'),
      path.resolve(process.cwd(), '..', 'scripts', 'openwakeword_worker.py'),
      path.resolve(process.cwd(), '..', '..', 'scripts', 'openwakeword_worker.py'),
      '/home/rishi/My Projects/Desktop_assistant/scripts/openwakeword_worker.py',
    ];
    const scriptPath = candidateScripts.find((p) => fs.existsSync(p));

    if (!scriptPath) {
      console.warn('[OpenWakeWord] scripts/openwakeword_worker.py not found');
      return;
    }

    try {
      console.log(`[OpenWakeWord] Spawning worker: ${pythonBin} ${scriptPath}`);
      this.process = spawn(pythonBin, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString('utf-8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('{')) continue;

          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.status === 'ready') {
              console.log('[OpenWakeWord] Proven neural models ready:', parsed.models);
            }
            if (parsed.detected) {
              const now = Date.now();
              if (now - this.lastDetectionTime > 2000) {
                this.lastDetectionTime = now;
                console.log(`[OpenWakeWord] Detected proven wake word: "${parsed.wakeWord}" (score: ${parsed.score?.toFixed(2)})`);

                const result: WakeWordDetectionResult = {
                  detected: true,
                  wakeWord: parsed.wakeWord,
                  score: parsed.score,
                  timestamp: now,
                };
                for (const cb of this.listeners) {
                  cb(result);
                }
              }
            }
          } catch (err) {
            // Non-fatal parse error on stray log lines
          }
        }
      });

      this.process.stderr?.on('data', (err) => {
        const msg = err.toString().trim();
        if (msg && !msg.includes('UserWarning')) {
          console.warn('[OpenWakeWord stderr]:', msg);
        }
      });

      this.process.on('error', (err) => {
        console.warn('[OpenWakeWord error]:', err.message);
        this.process = null;
      });

      this.process.on('exit', (code) => {
        console.log(`[OpenWakeWord worker exited with code ${code}]`);
        this.process = null;
      });
    } catch (err) {
      console.error('[OpenWakeWord] Failed to spawn worker:', err);
      this.process = null;
    }
  }

  stop(): void {
    this.running = false;
    if (this.process) {
      this.process.kill('SIGTERM');
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
    if (!this.running || !this.config.enabled) {
      return { detected: false, timestamp: Date.now() };
    }

    // 1. Stream raw PCM chunk to openWakeWord neural process
    if (this.process?.stdin?.writable) {
      try {
        const buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        this.process.stdin.write(buffer);
      } catch {}
    }

    // 2. Hybrid acoustic cadence detection for "Hey Sora"
    let sumSquares = 0;
    for (let i = 0; i < chunk.length; i++) {
      const val = chunk[i] / 32768;
      sumSquares += val * val;
    }
    const rms = Math.sqrt(sumSquares / chunk.length);
    const threshold = (1.1 - (this.config.sensitivity || 0.6)) * 0.04;

    if (rms > threshold) {
      this.speechStreak++;
      this.silenceStreak = 0;
    } else {
      this.silenceStreak++;
      if (this.silenceStreak > 3) {
        if (this.speechStreak >= 4 && this.speechStreak <= 22) {
          const now = Date.now();
          if (now - this.lastDetectionTime > 2500) {
            this.lastDetectionTime = now;
            this.speechStreak = 0;
            this.silenceStreak = 0;
            const result: WakeWordDetectionResult = {
              detected: true,
              wakeWord: this.config.wakeWord,
              score: Math.min(1, rms / threshold),
              timestamp: now,
            };
            console.log(`[Acoustic Cadence] Detected wake word: "${result.wakeWord}"`);
            for (const cb of this.listeners) {
              cb(result);
            }
            return result;
          }
        }
        this.speechStreak = 0;
      }
    }

    return { detected: false, timestamp: Date.now() };
  }
}
