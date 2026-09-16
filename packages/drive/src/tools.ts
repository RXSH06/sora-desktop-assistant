import { AssistantTool, ToolResult } from '@octo/tools';
import { DriveService } from './service.js';

export function createDriveTools(driveService: DriveService): AssistantTool[] {
  const driveSearchTool: AssistantTool = {
    name: 'drive_search',
    description: 'Search files and folders stored in your Google Drive',
    permissionLevel: 'SAFE',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name or keywords to search for' },
        maxResults: { type: 'number', description: 'Max items to return (default: 10)' },
      },
      required: ['query'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const query = String(args.query);
        const maxResults = Number(args.maxResults) || 10;
        const results = await driveService.searchFiles(query, maxResults);
        return { success: true, output: { query, count: results.length, files: results } };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const driveDownloadTool: AssistantTool = {
    name: 'drive_download',
    description: 'Download a file from Google Drive to a local file path',
    permissionLevel: 'CONFIRM',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Google Drive file ID' },
        destinationPath: { type: 'string', description: 'Local path where file should be saved' },
      },
      required: ['fileId', 'destinationPath'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const fileId = String(args.fileId);
        const dest = String(args.destinationPath);
        const result = await driveService.downloadFile(fileId, dest);
        return { success: true, output: { message: `Downloaded to ${result.savedPath}`, path: result.savedPath } };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const driveUploadTool: AssistantTool = {
    name: 'drive_upload',
    description: 'Upload a local file to Google Drive',
    permissionLevel: 'CONFIRM',
    parameters: {
      type: 'object',
      properties: {
        localPath: { type: 'string', description: 'Local path of the file to upload' },
        driveFolderId: { type: 'string', description: 'Optional ID of the Drive destination folder' },
      },
      required: ['localPath'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const localPath = String(args.localPath);
        const folderId = args.driveFolderId ? String(args.driveFolderId) : undefined;
        const result = await driveService.uploadFile(localPath, folderId);
        return { success: true, output: result };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const driveCreateFolderTool: AssistantTool = {
    name: 'drive_create_folder',
    description: 'Create a new folder in Google Drive',
    permissionLevel: 'CONFIRM',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Folder name' },
        parentFolderId: { type: 'string', description: 'Optional parent folder ID' },
      },
      required: ['name'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const name = String(args.name);
        const parentId = args.parentFolderId ? String(args.parentFolderId) : undefined;
        const result = await driveService.createFolder(name, parentId);
        return { success: true, output: result };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const driveMoveTool: AssistantTool = {
    name: 'drive_move',
    description: 'Move a file to a different folder in Google Drive',
    permissionLevel: 'CONFIRM',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Drive file ID' },
        newParentFolderId: { type: 'string', description: 'Target parent folder ID' },
      },
      required: ['fileId', 'newParentFolderId'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const fileId = String(args.fileId);
        const newFolderId = String(args.newParentFolderId);
        const result = await driveService.moveFile(fileId, newFolderId);
        return { success: true, output: result };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const driveCopyTool: AssistantTool = {
    name: 'drive_copy',
    description: 'Copy a file in Google Drive',
    permissionLevel: 'CONFIRM',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Drive file ID' },
        newName: { type: 'string', description: 'Optional new name for the copied file' },
      },
      required: ['fileId'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const fileId = String(args.fileId);
        const newName = args.newName ? String(args.newName) : undefined;
        const result = await driveService.copyFile(fileId, newName);
        return { success: true, output: result };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  return [
    driveSearchTool,
    driveDownloadTool,
    driveUploadTool,
    driveCreateFolderTool,
    driveMoveTool,
    driveCopyTool,
  ];
}
