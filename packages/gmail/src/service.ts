import fs from 'node:fs';
import path from 'node:path';
import { google, gmail_v1 } from 'googleapis';
import { GoogleAuthService } from './auth.js';

export interface EmailSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  hasAttachments: boolean;
}

export class GmailService {
  private authService: GoogleAuthService;

  constructor(authService: GoogleAuthService) {
    this.authService = authService;
  }

  private getGmail(): gmail_v1.Gmail {
    return google.gmail({ version: 'v1', auth: this.authService.getClient() as any });
  }

  async searchEmail(query: string, maxResults: number = 10): Promise<EmailSummary[]> {
    const gmail = this.getGmail();
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    const messages = res.data.messages || [];
    const summaries: EmailSummary[] = [];

    for (const msg of messages) {
      if (!msg.id) continue;
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        });

        const headers = detail.data.payload?.headers || [];
        const getHeader = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        summaries.push({
          id: msg.id,
          threadId: msg.threadId || '',
          subject: getHeader('Subject'),
          from: getHeader('From'),
          date: getHeader('Date'),
          snippet: detail.data.snippet || '',
          hasAttachments: (detail.data.payload?.parts || []).some((p) => !!p.filename),
        });
      } catch (err) {
        console.error(`Failed to get details for message ${msg.id}:`, err);
      }
    }

    return summaries;
  }

  async readEmail(messageId: string): Promise<{
    id: string;
    subject: string;
    from: string;
    to: string;
    date: string;
    body: string;
    attachments: Array<{ filename: string; mimeType: string; attachmentId: string; size: number }>;
  }> {
    const gmail = this.getGmail();
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const headers = res.data.payload?.headers || [];
    const getHeader = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    let body = '';
    const attachments: Array<{ filename: string; mimeType: string; attachmentId: string; size: number }> = [];

    function parseParts(parts: gmail_v1.Schema$MessagePart[] = []) {
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.filename && part.body?.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType || 'application/octet-stream',
            attachmentId: part.body.attachmentId,
            size: part.body.size || 0,
          });
        }
        if (part.parts) {
          parseParts(part.parts);
        }
      }
    }

    if (res.data.payload?.parts) {
      parseParts(res.data.payload.parts);
    } else if (res.data.payload?.body?.data) {
      body = Buffer.from(res.data.payload.body.data, 'base64').toString('utf-8');
    }

    return {
      id: messageId,
      subject: getHeader('Subject'),
      from: getHeader('From'),
      to: getHeader('To'),
      date: getHeader('Date'),
      body: body.trim(),
      attachments,
    };
  }

  async listAttachments(messageId: string): Promise<Array<{ filename: string; mimeType: string; attachmentId: string; size: number }>> {
    const email = await this.readEmail(messageId);
    return email.attachments;
  }

  async downloadAttachment(
    messageId: string,
    attachmentId: string,
    destinationFolder: string,
    filename: string
  ): Promise<{ savedPath: string; sizeBytes: number }> {
    const gmail = this.getGmail();
    const res = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    const data = res.data.data;
    if (!data) {
      throw new Error('No attachment data found');
    }

    if (!fs.existsSync(destinationFolder)) {
      fs.mkdirSync(destinationFolder, { recursive: true });
    }

    const savedPath = path.join(destinationFolder, filename);
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(savedPath, buffer);

    return {
      savedPath,
      sizeBytes: buffer.length,
    };
  }

  async createDraft(to: string, subject: string, body: string): Promise<{ draftId: string }> {
    const gmail = this.getGmail();
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `To: ${to}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      body,
    ];
    const rawMessage = messageParts.join('\n');
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedMessage,
        },
      },
    });

    return { draftId: res.data.id || '' };
  }

  async sendEmail(to: string, subject: string, body: string): Promise<{ messageId: string }> {
    const gmail = this.getGmail();
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `To: ${to}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      body,
    ];
    const rawMessage = messageParts.join('\n');
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return { messageId: res.data.id || '' };
  }
}
