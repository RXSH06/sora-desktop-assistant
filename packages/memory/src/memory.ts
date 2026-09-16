import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MemoryCategory, MemoryItem, MemoryStore } from './types.js';

export class FileMemoryStore implements MemoryStore {
  private filePath: string;
  private data: Map<string, MemoryItem> = new Map();

  constructor(customPath?: string) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      const configDir = path.join(os.homedir(), '.config', 'nova-assistant');
      if (!fs.existsSync(configDir)) {
        try {
          fs.mkdirSync(configDir, { recursive: true });
        } catch {
          // Fallback to home dir or temp
        }
      }
      this.filePath = path.join(configDir, 'memory.json');
    }
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const items: MemoryItem[] = JSON.parse(raw);
        for (const item of items) {
          this.data.set(`${item.category}:${item.key}`, item);
        }
      } else {
        this.seedDefaults();
      }
    } catch (err) {
      console.error('Error loading memory store, using defaults:', err);
      this.seedDefaults();
    }
  }

  private seedDefaults(): void {
    const home = os.homedir();
    this.set('frequent_paths', 'home', home, 'User home directory');
    this.set('frequent_paths', 'projects', path.join(home, 'Projects'), 'Standard projects folder');
    this.set('projects', 'companion robot', path.join(home, 'Projects', 'Companion Robot'), 'Companion Robot project directory');
    this.set('assistant_preferences', 'wake_word', 'hey nova', 'Configured wake word');
    this.save();
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const items = Array.from(this.data.values());
      fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save memory store:', err);
    }
  }

  get<T = unknown>(category: MemoryCategory, key: string): T | undefined {
    const item = this.data.get(`${category}:${key.toLowerCase().trim()}`);
    return item ? (item.value as T) : undefined;
  }

  set(category: MemoryCategory, key: string, value: unknown, description?: string): void {
    const cleanKey = key.toLowerCase().trim();
    const item: MemoryItem = {
      category,
      key: cleanKey,
      value,
      description,
      updatedAt: Date.now(),
    };
    this.data.set(`${category}:${cleanKey}`, item);
    this.save();
  }

  delete(category: MemoryCategory, key: string): boolean {
    const cleanKey = key.toLowerCase().trim();
    const result = this.data.delete(`${category}:${cleanKey}`);
    if (result) this.save();
    return result;
  }

  list(category: MemoryCategory): MemoryItem[] {
    const result: MemoryItem[] = [];
    for (const item of this.data.values()) {
      if (item.category === category) {
        result.push(item);
      }
    }
    return result;
  }

  getAll(): Record<MemoryCategory, MemoryItem[]> {
    const categories: MemoryCategory[] = [
      'user_preferences',
      'projects',
      'frequent_paths',
      'applications',
      'contacts',
      'assistant_preferences',
      'conversation_context',
    ];
    const grouped = categories.reduce(
      (acc, cat) => {
        acc[cat] = [];
        return acc;
      },
      {} as Record<MemoryCategory, MemoryItem[]>
    );

    for (const item of this.data.values()) {
      if (grouped[item.category]) {
        grouped[item.category].push(item);
      }
    }
    return grouped;
  }

  clear(category?: MemoryCategory): void {
    if (category) {
      for (const [key, item] of this.data.entries()) {
        if (item.category === category) {
          this.data.delete(key);
        }
      }
    } else {
      this.data.clear();
    }
    this.save();
  }

  resolveShortcut(text: string): string {
    const lower = text.toLowerCase().trim();
    // Check projects
    for (const item of this.data.values()) {
      if (item.category === 'projects' || item.category === 'frequent_paths') {
        if (lower.includes(item.key) && typeof item.value === 'string') {
          return item.value;
        }
      }
    }
    return text;
  }

  getSystemPromptContext(): string {
    const lines: string[] = ['### Stored Memory & Known Locations:'];
    for (const item of this.data.values()) {
      if (typeof item.value === 'string' || typeof item.value === 'number') {
        lines.push(`- [${item.category}] "${item.key}": "${item.value}" (${item.description || ''})`);
      }
    }
    return lines.join('\n');
  }
}
