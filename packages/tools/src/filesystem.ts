import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AssistantTool, ToolResult } from './types.js';

export function resolveUserPath(inputPath: string): string {
  if (!inputPath) return os.homedir();
  if (inputPath.startsWith('~')) {
    return path.join(os.homedir(), inputPath.slice(1));
  }
  return path.resolve(inputPath);
}

// 1. search_files
export const searchFilesTool: AssistantTool = {
  name: 'search_files',
  description: 'Search for existing files or directories by name within a target directory. ONLY call this tool when the user explicitly asks to find, locate, or search for files (e.g. "find report.pdf", "search for resume"). NEVER invoke this tool for general conversation, greetings, capabilities questions, or "what can you do".',
  permissionLevel: 'SAFE',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'File name or substring to search for' },
      directory: { type: 'string', description: 'Directory to search within (e.g. ~/Projects, defaults to home)' },
      maxResults: { type: 'number', description: 'Maximum number of results to return (default: 20)' },
    },
    required: ['query'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const query = String(args.query || '').toLowerCase();
      const targetDir = resolveUserPath(String(args.directory || '~'));
      const maxResults = Number(args.maxResults) || 20;

      if (!fs.existsSync(targetDir)) {
        return { success: false, error: `Directory not found: ${targetDir}` };
      }

      const results: Array<{ name: string; path: string; isDirectory: boolean; size: number }> = [];

      function walk(currentDir: string, depth: number) {
        if (depth > 5 || results.length >= maxResults) return;
        try {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            if (results.length >= maxResults) break;
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

            const fullPath = path.join(currentDir, entry.name);
            if (entry.name.toLowerCase().includes(query)) {
              let size = 0;
              try {
                if (!entry.isDirectory()) {
                  size = fs.statSync(fullPath).size;
                }
              } catch {
                // Ignore stat errors
              }
              results.push({
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
                size,
              });
            }

            if (entry.isDirectory()) {
              walk(fullPath, depth + 1);
            }
          }
        } catch {
          // Ignore read errors
        }
      }

      walk(targetDir, 0);
      return {
        success: true,
        output: {
          query,
          searchedDirectory: targetDir,
          matchCount: results.length,
          matches: results,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

// 2. read_file
export const readFileTool: AssistantTool = {
  name: 'read_file',
  description: 'Read the contents of a text file (limited to first 32KB by default)',
  permissionLevel: 'SAFE',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Full path to file to read' },
      maxBytes: { type: 'number', description: 'Max bytes to read (default: 32768)' },
    },
    required: ['path'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const targetPath = resolveUserPath(String(args.path));
      if (!fs.existsSync(targetPath)) {
        return { success: false, error: `File not found: ${targetPath}` };
      }
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        return { success: false, error: `Path is a directory, not a file: ${targetPath}` };
      }

      const maxBytes = Number(args.maxBytes) || 32768;
      const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
      const fd = fs.openSync(targetPath, 'r');
      fs.readSync(fd, buffer, 0, buffer.length, 0);
      fs.closeSync(fd);

      return {
        success: true,
        output: {
          path: targetPath,
          sizeBytes: stat.size,
          truncated: stat.size > maxBytes,
          content: buffer.toString('utf-8'),
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

// 3. copy_file
export const copyFileTool: AssistantTool = {
  name: 'copy_file',
  description: 'Copy a file or directory from source to destination path',
  permissionLevel: 'CONFIRM',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Source file or folder path' },
      destination: { type: 'string', description: 'Destination file or folder path' },
    },
    required: ['source', 'destination'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const src = resolveUserPath(String(args.source));
      let dest = resolveUserPath(String(args.destination));

      if (!fs.existsSync(src)) {
        return { success: false, error: `Source does not exist: ${src}` };
      }

      // If destination is an existing directory, copy inside it
      if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
        dest = path.join(dest, path.basename(src));
      } else {
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
      }

      fs.cpSync(src, dest, { recursive: true });
      return {
        success: true,
        output: {
          source: src,
          destination: dest,
          message: `Successfully copied from ${src} to ${dest}`,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

// 4. move_file
export const moveFileTool: AssistantTool = {
  name: 'move_file',
  description: 'Move a file or directory from source to destination path',
  permissionLevel: 'CONFIRM',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Source path' },
      destination: { type: 'string', description: 'Destination path' },
    },
    required: ['source', 'destination'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const src = resolveUserPath(String(args.source));
      let dest = resolveUserPath(String(args.destination));

      if (!fs.existsSync(src)) {
        return { success: false, error: `Source does not exist: ${src}` };
      }

      if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
        dest = path.join(dest, path.basename(src));
      } else {
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
      }

      fs.renameSync(src, dest);
      return {
        success: true,
        output: {
          source: src,
          destination: dest,
          message: `Successfully moved ${src} to ${dest}`,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

// 5. rename_file
export const renameFileTool: AssistantTool = {
  name: 'rename_file',
  description: 'Rename a file or folder in place to a new name',
  permissionLevel: 'CONFIRM',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to existing file or folder' },
      newName: { type: 'string', description: 'New name (just filename, not full path)' },
    },
    required: ['path', 'newName'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const target = resolveUserPath(String(args.path));
      const newName = path.basename(String(args.newName));
      if (!fs.existsSync(target)) {
        return { success: false, error: `File not found: ${target}` };
      }
      const dir = path.dirname(target);
      const newPath = path.join(dir, newName);

      fs.renameSync(target, newPath);
      return {
        success: true,
        output: {
          oldPath: target,
          newPath,
          message: `Renamed to ${newName}`,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

// 6. delete_file
export const deleteFileTool: AssistantTool = {
  name: 'delete_file',
  description: 'Delete a file or folder permanently',
  permissionLevel: 'CONFIRM',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path of file or folder to delete' },
    },
    required: ['path'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const target = resolveUserPath(String(args.path));
      if (!fs.existsSync(target)) {
        return { success: false, error: `Path does not exist: ${target}` };
      }

      // Safety protection against root or critical system directories
      if (['/', '/home', '/etc', '/var', '/usr', '/bin', os.homedir()].includes(target)) {
        return { success: false, error: `Safety Violation: Cannot delete root or critical system directory: ${target}` };
      }

      fs.rmSync(target, { recursive: true, force: true });
      return {
        success: true,
        output: {
          deletedPath: target,
          message: `Successfully deleted ${target}`,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

// 7. create_folder
export const createFolderTool: AssistantTool = {
  name: 'create_folder',
  description: 'Create a new directory recursively',
  permissionLevel: 'CONFIRM',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path of folder to create' },
    },
    required: ['path'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const target = resolveUserPath(String(args.path));
      fs.mkdirSync(target, { recursive: true });
      return {
        success: true,
        output: {
          path: target,
          message: `Folder created at ${target}`,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

// 8. get_file_info
export const getFileInfoTool: AssistantTool = {
  name: 'get_file_info',
  description: 'Get metadata and status information about a file or folder',
  permissionLevel: 'SAFE',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to inspect' },
    },
    required: ['path'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const target = resolveUserPath(String(args.path));
      if (!fs.existsSync(target)) {
        return { success: false, error: `Path does not exist: ${target}` };
      }
      const stat = fs.statSync(target);
      return {
        success: true,
        output: {
          path: target,
          name: path.basename(target),
          isDirectory: stat.isDirectory(),
          sizeBytes: stat.size,
          created: stat.birthtime,
          modified: stat.mtime,
          permissions: stat.mode.toString(8),
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
};

export const filesystemTools: AssistantTool[] = [
  searchFilesTool,
  readFileTool,
  copyFileTool,
  moveFileTool,
  renameFileTool,
  deleteFileTool,
  createFolderTool,
  getFileInfoTool,
];
