import { execFile } from 'node:child_process';
import util from 'node:util';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { AssistantTool, ToolResult } from './types.js';

const execFileAsync = util.promisify(execFile);

let desktopScreenshotProvider: (() => Promise<string>) | null = null;

export function setDesktopScreenshotProvider(provider: () => Promise<string>) {
  desktopScreenshotProvider = provider;
}

export const screenshotTool: AssistantTool = {
  name: 'screenshot',
  description: 'Capture a screenshot of the primary desktop screen. ONLY invoke this when the user explicitly asks for a desktop screenshot (e.g. "take a screenshot", "capture my screen"). NEVER call this tool for general questions or conversations.',
  permissionLevel: 'SAFE',
  parameters: {
    type: 'object',
    properties: {
      outputPath: { type: 'string', description: 'Optional path where to save the screenshot PNG' },
    },
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const targetPath = args.outputPath
        ? String(args.outputPath)
        : path.join(os.tmpdir(), `screenshot_${Date.now()}.png`);

      if (desktopScreenshotProvider) {
        const base64 = await desktopScreenshotProvider();
        fs.writeFileSync(targetPath, Buffer.from(base64, 'base64'));
        return { success: true, output: { path: targetPath, base64Preview: base64.slice(0, 100) + '...' } };
      }

      // Try scrot or gnome-screenshot or grim (Wayland)
      try {
        await execFileAsync('grim', [targetPath]);
        return { success: true, output: { path: targetPath, method: 'grim (Wayland)' } };
      } catch {
        try {
          await execFileAsync('scrot', [targetPath]);
          return { success: true, output: { path: targetPath, method: 'scrot (X11)' } };
        } catch {
          try {
            await execFileAsync('gnome-screenshot', ['-f', targetPath]);
            return { success: true, output: { path: targetPath, method: 'gnome-screenshot' } };
          } catch (e: any) {
            return {
              success: false,
              error: 'Screenshot utility not available (install grim, scrot, or gnome-screenshot)',
            };
          }
        }
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

export const mouseMoveTool: AssistantTool = {
  name: 'mouse_move',
  description: 'Move mouse cursor to specific (x, y) coordinates on the desktop screen',
  permissionLevel: 'RESTRICTED',
  parameters: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'X coordinate in pixels' },
      y: { type: 'number', description: 'Y coordinate in pixels' },
    },
    required: ['x', 'y'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const x = Number(args.x);
      const y = Number(args.y);
      try {
        await execFileAsync('xdotool', ['mousemove', String(x), String(y)]);
        return { success: true, output: { x, y, message: `Mouse moved to (${x}, ${y})` } };
      } catch {
        try {
          await execFileAsync('ydotool', ['mousemove', '--absolute', '-x', String(x), '-y', String(y)]);
          return { success: true, output: { x, y, message: `Mouse moved via ydotool to (${x}, ${y})` } };
        } catch (e: any) {
          return { success: false, error: 'Mouse movement failed: xdotool or ydotool daemon required' };
        }
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

export const mouseClickTool: AssistantTool = {
  name: 'mouse_click',
  description: 'Perform a mouse click (left, right, or middle button)',
  permissionLevel: 'CONFIRM',
  parameters: {
    type: 'object',
    properties: {
      button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button to click (default: left)' },
      x: { type: 'number', description: 'Optional X coordinate to click at' },
      y: { type: 'number', description: 'Optional Y coordinate to click at' },
    },
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const buttonMap: Record<string, string> = { left: '1', middle: '2', right: '3' };
      const btn = buttonMap[String(args.button || 'left')] || '1';

      if (args.x !== undefined && args.y !== undefined) {
        await mouseMoveTool.execute({ x: args.x, y: args.y });
      }

      try {
        await execFileAsync('xdotool', ['click', btn]);
        return { success: true, output: { clicked: args.button || 'left' } };
      } catch {
        try {
          const ydoBtn = btn === '1' ? '0xC0' : btn === '3' ? '0xC1' : '0xC2';
          await execFileAsync('ydotool', ['click', ydoBtn]);
          return { success: true, output: { clicked: args.button || 'left', backend: 'ydotool' } };
        } catch {
          return { success: false, error: 'Click failed: xdotool or ydotool required' };
        }
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

export const mouseDoubleClickTool: AssistantTool = {
  name: 'mouse_double_click',
  description: 'Perform a double click with the mouse',
  permissionLevel: 'CONFIRM',
  parameters: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'Optional X coordinate to double click at' },
      y: { type: 'number', description: 'Optional Y coordinate to double click at' },
    },
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      if (args.x !== undefined && args.y !== undefined) {
        await mouseMoveTool.execute({ x: args.x, y: args.y });
      }
      try {
        await execFileAsync('xdotool', ['click', '--repeat', '2', '--delay', '100', '1']);
        return { success: true, output: { message: 'Double clicked' } };
      } catch {
        return { success: false, error: 'Double click failed: xdotool required' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

export const keyboardTypeTool: AssistantTool = {
  name: 'keyboard_type',
  description: 'Type a string of text into the currently active desktop window',
  permissionLevel: 'CONFIRM',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The text string to type' },
      delayMs: { type: 'number', description: 'Delay between keystrokes in ms (default: 12)' },
    },
    required: ['text'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const text = String(args.text || '');
      const delay = Number(args.delayMs) || 12;
      try {
        await execFileAsync('xdotool', ['type', '--delay', String(delay), text]);
        return { success: true, output: { typedChars: text.length } };
      } catch {
        try {
          await execFileAsync('ydotool', ['type', text]);
          return { success: true, output: { typedChars: text.length, backend: 'ydotool' } };
        } catch {
          return { success: false, error: 'Keystroke typing failed: xdotool or ydotool required' };
        }
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

export const keyboardPressTool: AssistantTool = {
  name: 'keyboard_press',
  description: 'Press a special key or key combination (e.g. Return, Escape, ctrl+c, alt+Tab)',
  permissionLevel: 'CONFIRM',
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Key name (e.g. Return, Tab, BackSpace, ctrl+s)' },
    },
    required: ['key'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const key = String(args.key || '');
      try {
        await execFileAsync('xdotool', ['key', key]);
        return { success: true, output: { pressedKey: key } };
      } catch {
        try {
          await execFileAsync('ydotool', ['key', key]);
          return { success: true, output: { pressedKey: key, backend: 'ydotool' } };
        } catch {
          return { success: false, error: 'Key press failed: xdotool or ydotool required' };
        }
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

export const scrollTool: AssistantTool = {
  name: 'scroll',
  description: 'Scroll up or down on the active window',
  permissionLevel: 'CONFIRM',
  parameters: {
    type: 'object',
    properties: {
      direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
      clicks: { type: 'number', description: 'Number of scroll steps (default: 3)' },
    },
    required: ['direction'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const dir = String(args.direction) === 'down' ? '5' : '4'; // xdotool button 4 is up, 5 is down
      const clicks = Number(args.clicks) || 3;
      try {
        await execFileAsync('xdotool', ['click', '--repeat', String(clicks), dir]);
        return { success: true, output: { direction: args.direction, clicks } };
      } catch {
        return { success: false, error: 'Scroll failed: xdotool required' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

export const computerTools: AssistantTool[] = [
  screenshotTool,
  mouseMoveTool,
  mouseClickTool,
  mouseDoubleClickTool,
  keyboardTypeTool,
  keyboardPressTool,
  scrollTool,
];
