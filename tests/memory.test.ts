import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { FileMemoryStore } from '../packages/memory/src/index.js';

describe('Memory Store', () => {
  const testMemoryFile = path.join(os.tmpdir(), `test_memory_${Date.now()}.json`);

  afterEach(() => {
    if (fs.existsSync(testMemoryFile)) {
      fs.unlinkSync(testMemoryFile);
    }
  });

  it('stores and retrieves memory items across categories', () => {
    const store = new FileMemoryStore(testMemoryFile);
    store.set('projects', 'esp32 project', '/home/user/esp32', 'My ESP32 firmware');

    const value = store.get('projects', 'esp32 project');
    expect(value).toBe('/home/user/esp32');
  });

  it('resolves semantic shortcuts correctly', () => {
    const store = new FileMemoryStore(testMemoryFile);
    store.set('projects', 'companion robot', '/home/rishi/Projects/Companion Robot');

    const resolved = store.resolveShortcut('Save the BOM in my Companion Robot folder');
    expect(resolved).toBe('/home/rishi/Projects/Companion Robot');
  });

  it('formats system prompt context with known locations', () => {
    const store = new FileMemoryStore(testMemoryFile);
    store.set('projects', 'companion robot', '/home/rishi/Projects/Companion Robot');

    const context = store.getSystemPromptContext();
    expect(context).toContain('Stored Memory');
    expect(context).toContain('companion robot');
  });
});
