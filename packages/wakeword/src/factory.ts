import { WakeWordEngine, WakeWordConfig } from './types.js';
import { LocalAcousticWakeWordEngine } from './local_engine.js';
import { OpenWakeWordRunner } from './openwakeword_runner.js';

export function createWakeWordEngine(config: WakeWordConfig): WakeWordEngine {
  if (config.engineType === 'acoustic_template') {
    const engine = new LocalAcousticWakeWordEngine();
    engine.init(config);
    return engine;
  }

  // Default to proven openWakeWord neural runner (Alexa, Hey Jarvis, Hey Mycroft, Hey Sora)
  const runner = new OpenWakeWordRunner();
  runner.init(config);
  return runner;
}
