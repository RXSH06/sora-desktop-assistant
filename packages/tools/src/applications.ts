import { spawn, execFile } from 'node:child_process';
import util from 'node:util';
import { AssistantTool, ToolResult } from './types.js';

const execFileAsync = util.promisify(execFile);

// Controlled application allowlist mapping application names to executable binary/desktop commands
const KNOWN_APPLICATIONS: Record<string, { bin: string; defaultArgs?: string[]; description: string }> = {
  'vs code': { bin: 'code', description: 'Visual Studio Code Editor' },
  'vscode': { bin: 'code', description: 'Visual Studio Code Editor' },
  'code': { bin: 'code', description: 'Visual Studio Code Editor' },
  'kicad': { bin: 'kicad', description: 'KiCad EDA Suite' },
  'chrome': { bin: 'google-chrome', description: 'Google Chrome Browser' },
  'google-chrome': { bin: 'google-chrome', description: 'Google Chrome Browser' },
  'firefox': { bin: 'firefox', description: 'Mozilla Firefox Browser' },
  'files': { bin: 'nautilus', description: 'GNOME File Manager' },
  'nautilus': { bin: 'nautilus', description: 'GNOME File Manager' },
  'terminal': { bin: 'gnome-terminal', description: 'GNOME Terminal' },
  'calculator': { bin: 'gnome-calculator', description: 'GNOME Calculator' },
  'text editor': { bin: 'gedit', description: 'Text Editor' },
  'gedit': { bin: 'gedit', description: 'Text Editor' },
  'settings': { bin: 'gnome-control-center', description: 'System Settings' },
  'libreoffice': { bin: 'libreoffice', description: 'LibreOffice Suite' },
  'calc': { bin: 'libreoffice', defaultArgs: ['--calc'], description: 'LibreOffice Calc (Spreadsheets)' },
  'writer': { bin: 'libreoffice', defaultArgs: ['--writer'], description: 'LibreOffice Writer (Documents)' },
};

export const openApplicationTool: AssistantTool = {
  name: 'open_application',
  description: 'Launch an approved desktop application safely (e.g. VS Code, Chrome, Terminal, Calc). ONLY invoke this when the user explicitly commands to open or launch an application (e.g. "open Chrome", "start VS Code"). NEVER call this tool for inquiries, capabilities questions, or general conversation.',
  permissionLevel: 'SAFE',
  parameters: {
    type: 'object',
    properties: {
      appName: { type: 'string', description: 'Name of the application to launch (e.g. "VS Code", "KiCad", "Chrome", "Files")' },
      filePath: { type: 'string', description: 'Optional file or folder path to open with the application' },
    },
    required: ['appName'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const query = String(args.appName || '').toLowerCase().trim();
      const app = KNOWN_APPLICATIONS[query];

      if (!app) {
        const knownList = Object.keys(KNOWN_APPLICATIONS).join(', ');
        return {
          success: false,
          error: `Application '${query}' is not in the safe application allowlist. Approved applications: ${knownList}`,
        };
      }

      const launchArgs = [...(app.defaultArgs || [])];
      if (args.filePath && typeof args.filePath === 'string') {
        launchArgs.push(args.filePath);
      }

      const child = spawn(app.bin, launchArgs, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      return {
        success: true,
        output: {
          application: query,
          binary: app.bin,
          args: launchArgs,
          status: 'launched',
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

export const closeApplicationTool: AssistantTool = {
  name: 'close_application',
  description: 'Gracefully close or terminate a running application by name',
  permissionLevel: 'CONFIRM',
  parameters: {
    type: 'object',
    properties: {
      appName: { type: 'string', description: 'Name of the application or binary to close' },
    },
    required: ['appName'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const query = String(args.appName || '').toLowerCase().trim();
      const app = KNOWN_APPLICATIONS[query];
      const binaryToKill = app ? app.bin : query;

      // Safe kill using killall
      await execFileAsync('killall', [binaryToKill]);
      return {
        success: true,
        output: {
          application: query,
          targetBinary: binaryToKill,
          status: 'closed',
        },
      };
    } catch (err: any) {
      return { success: false, error: `Failed to close application: ${err.message || String(err)}` };
    }
  },
};

export const focusApplicationTool: AssistantTool = {
  name: 'focus_application',
  description: 'Bring a running application window to the foreground',
  permissionLevel: 'SAFE',
  parameters: {
    type: 'object',
    properties: {
      appName: { type: 'string', description: 'Name of the window or application to focus' },
    },
    required: ['appName'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const query = String(args.appName || '');
      // Try wmctrl if available
      try {
        await execFileAsync('wmctrl', ['-a', query]);
        return { success: true, output: { status: 'focused', appName: query } };
      } catch {
        // Fallback or warning
        return {
          success: true,
          output: {
            status: 'focus_requested',
            message: `Requested focus for ${query} (wmctrl not present or window not found)`,
          },
        };
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

export const listRunningApplicationsTool: AssistantTool = {
  name: 'list_running_applications',
  description: 'List user desktop applications currently active and running',
  permissionLevel: 'SAFE',
  parameters: {
    type: 'object',
    properties: {},
  },
  async execute(): Promise<ToolResult> {
    try {
      // Check wmctrl -l if X11, or ps aux filtering common user GUI binaries
      try {
        const { stdout } = await execFileAsync('wmctrl', ['-l']);
        const lines = stdout.split('\n').filter(Boolean);
        const windows = lines.map((l) => {
          const parts = l.split(/\s+/);
          return {
            windowId: parts[0],
            desktop: parts[1],
            host: parts[2],
            title: parts.slice(3).join(' '),
          };
        });
        return { success: true, output: { count: windows.length, windows } };
      } catch {
        // Fallback using ps
        const { stdout } = await execFileAsync('ps', ['-eo', 'comm']);
        const running = new Set(stdout.split('\n').map((s) => s.trim()));
        const matched = Object.entries(KNOWN_APPLICATIONS)
          .filter(([, v]) => running.has(v.bin))
          .map(([k, v]) => ({ name: k, binary: v.bin, description: v.description }));

        return {
          success: true,
          output: {
            count: matched.length,
            runningApplications: matched,
          },
        };
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

export const applicationTools: AssistantTool[] = [
  openApplicationTool,
  closeApplicationTool,
  focusApplicationTool,
  listRunningApplicationsTool,
];
