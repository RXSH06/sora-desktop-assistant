import { execFile } from 'node:child_process';
import util from 'node:util';
import { AssistantTool, ToolResult } from './types.js';

const execFileAsync = util.promisify(execFile);

// Clipboard provider hook allowing Electron main process to supply native clipboard
let nativeClipboardProvider: {
  readText: () => string;
  writeText: (text: string) => void;
} | null = null;

export function setNativeClipboard(provider: {
  readText: () => string;
  writeText: (text: string) => void;
}) {
  nativeClipboardProvider = provider;
}

export const getClipboardTool: AssistantTool = {
  name: 'get_clipboard',
  description: 'Get the current text content from the system clipboard',
  permissionLevel: 'SAFE',
  parameters: {
    type: 'object',
    properties: {},
  },
  async execute(): Promise<ToolResult> {
    try {
      if (nativeClipboardProvider) {
        const text = nativeClipboardProvider.readText();
        return { success: true, output: { text } };
      }

      // Linux Wayland fallback: wl-paste
      try {
        const { stdout } = await execFileAsync('wl-paste', ['--no-newline']);
        return { success: true, output: { text: stdout } };
      } catch {
        // Linux X11 fallback: xclip
        try {
          const { stdout } = await execFileAsync('xclip', ['-selection', 'clipboard', '-o']);
          return { success: true, output: { text: stdout } };
        } catch (e: any) {
          return { success: false, error: 'Clipboard access unavailable (xclip or wl-clipboard not found)' };
        }
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

export const setClipboardTool: AssistantTool = {
  name: 'set_clipboard',
  description: 'Copy text to the system clipboard',
  permissionLevel: 'CONFIRM',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The text to write into the clipboard' },
    },
    required: ['text'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const text = String(args.text ?? '');
      if (nativeClipboardProvider) {
        nativeClipboardProvider.writeText(text);
        return { success: true, output: { message: 'Text copied to clipboard', length: text.length } };
      }

      // Wayland fallback
      try {
        const child = execFile('wl-copy', []);
        child.stdin?.write(text);
        child.stdin?.end();
        return { success: true, output: { message: 'Text copied to clipboard via wl-copy', length: text.length } };
      } catch {
        // X11 fallback
        try {
          const child = execFile('xclip', ['-selection', 'clipboard']);
          child.stdin?.write(text);
          child.stdin?.end();
          return { success: true, output: { message: 'Text copied to clipboard via xclip', length: text.length } };
        } catch (e: any) {
          return { success: false, error: 'Failed to write to clipboard: no clipboard utility found' };
        }
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

export const clipboardTools: AssistantTool[] = [getClipboardTool, setClipboardTool];
