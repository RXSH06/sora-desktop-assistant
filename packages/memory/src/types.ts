export type MemoryCategory =
  | 'user_preferences'
  | 'projects'
  | 'frequent_paths'
  | 'applications'
  | 'contacts'
  | 'assistant_preferences'
  | 'conversation_context';

export interface MemoryItem {
  category: MemoryCategory;
  key: string;
  value: unknown;
  description?: string;
  updatedAt: number;
}

export interface MemoryStore {
  get<T = unknown>(category: MemoryCategory, key: string): T | undefined;
  set(category: MemoryCategory, key: string, value: unknown, description?: string): void;
  delete(category: MemoryCategory, key: string): boolean;
  list(category: MemoryCategory): MemoryItem[];
  getAll(): Record<MemoryCategory, MemoryItem[]>;
  clear(category?: MemoryCategory): void;
  resolveShortcut(text: string): string;
  getSystemPromptContext(): string;
}
