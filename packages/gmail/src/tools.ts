import os from 'node:os';
import path from 'node:path';
import { AssistantTool, ToolResult } from '@octo/tools';
import { GmailService } from './service.js';

export function createGmailTools(gmailService: GmailService): AssistantTool[] {
  const searchEmailTool: AssistantTool = {
    name: 'search_email',
    description: 'Search emails in Gmail using queries like "from:Rahul PCB", "is:unread", etc.',
    permissionLevel: 'SAFE',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query string' },
        maxResults: { type: 'number', description: 'Maximum emails to retrieve (default: 10)' },
      },
      required: ['query'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const query = String(args.query);
        const maxResults = Number(args.maxResults) || 10;
        const results = await gmailService.searchEmail(query, maxResults);
        return { success: true, output: { query, count: results.length, emails: results } };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const readEmailTool: AssistantTool = {
    name: 'read_email',
    description: 'Read the full subject, body, sender, and attachment list of an email by ID',
    permissionLevel: 'SAFE',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The unique Gmail message ID' },
      },
      required: ['messageId'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const messageId = String(args.messageId);
        const result = await gmailService.readEmail(messageId);
        return { success: true, output: result };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const listEmailAttachmentsTool: AssistantTool = {
    name: 'list_email_attachments',
    description: 'List all file attachments for a specific Gmail email',
    permissionLevel: 'SAFE',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The unique Gmail message ID' },
      },
      required: ['messageId'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const messageId = String(args.messageId);
        const attachments = await gmailService.listAttachments(messageId);
        return { success: true, output: { messageId, count: attachments.length, attachments } };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const downloadEmailAttachmentTool: AssistantTool = {
    name: 'download_email_attachment',
    description: 'Download an attachment from an email and save it to a destination folder on your computer',
    permissionLevel: 'CONFIRM',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The Gmail message ID' },
        attachmentId: { type: 'string', description: 'The attachment ID' },
        destinationFolder: { type: 'string', description: 'Local directory to save the file into (e.g. ~/Downloads or ~/Projects/Companion Robot)' },
        filename: { type: 'string', description: 'The name to save the file as (e.g. BOM.xlsx)' },
      },
      required: ['messageId', 'attachmentId', 'filename'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const messageId = String(args.messageId);
        const attachmentId = String(args.attachmentId);
        const filename = String(args.filename);
        let dest = String(args.destinationFolder || path.join(os.homedir(), 'Downloads'));
        if (dest.startsWith('~')) {
          dest = path.join(os.homedir(), dest.slice(1));
        }

        const result = await gmailService.downloadAttachment(messageId, attachmentId, dest, filename);
        return {
          success: true,
          output: {
            message: `Attachment saved to ${result.savedPath}`,
            path: result.savedPath,
            sizeBytes: result.sizeBytes,
          },
        };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const createEmailDraftTool: AssistantTool = {
    name: 'create_email_draft',
    description: 'Create a draft email in your Gmail without sending it immediately',
    permissionLevel: 'CONFIRM',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body text' },
      },
      required: ['to', 'subject', 'body'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const to = String(args.to);
        const subject = String(args.subject);
        const body = String(args.body);
        const result = await gmailService.createDraft(to, subject, body);
        return { success: true, output: { draftId: result.draftId, message: 'Draft created in Gmail' } };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const sendEmailTool: AssistantTool = {
    name: 'send_email',
    description: 'Send an email directly via your Gmail account',
    permissionLevel: 'CONFIRM',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body content' },
      },
      required: ['to', 'subject', 'body'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const to = String(args.to);
        const subject = String(args.subject);
        const body = String(args.body);
        const result = await gmailService.sendEmail(to, subject, body);
        return { success: true, output: { messageId: result.messageId, status: 'sent' } };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  return [
    searchEmailTool,
    readEmailTool,
    listEmailAttachmentsTool,
    downloadEmailAttachmentTool,
    createEmailDraftTool,
    sendEmailTool,
  ];
}
