import { WakeWordEngine, WakeWordConfig } from './types.js';
import { LocalAcousticWakeWordEngine } from './local_engine.js';
import { OpenWakeWordRunner } from './openwakeword_runner.js';

export function createWakeWordEngine(config: WakeWordConfig): WakeWordEngine {
  if (config.engineType === 'openwakeword') {
    const runner = new OpenWakeWordRunner();
    runner.init(config);
    return runner;
  }
  // Default to local acoustic template engine (instant, reliable, zero-dep)
  const engine = new LocalAcousticWakeWordEngine();
  engine.init(config);
  return engine;
}
