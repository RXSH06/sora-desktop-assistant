import fs from 'node:fs';
import path from 'node:path';
import { google, drive_v3 } from 'googleapis';
import { GoogleAuthService } from '@assistant/gmail';

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export class DriveService {
  private authService: GoogleAuthService;

  constructor(authService: GoogleAuthService) {
    this.authService = authService;
  }

  private getDrive(): drive_v3.Drive {
    return google.drive({ version: 'v3', auth: this.authService.getClient() as any });
  }

  async searchFiles(query: string, maxResults: number = 10): Promise<DriveFileInfo[]> {
    const drive = this.getDrive();
    const q = query ? `name contains '${query}' and trashed = false` : 'trashed = false';
    const res = await drive.files.list({
      q,
      pageSize: maxResults,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
    });

    return (res.data.files || []).map((f) => ({
      id: f.id || '',
      name: f.name || '',
      mimeType: f.mimeType || '',
      size: f.size || undefined,
      modifiedTime: f.modifiedTime || undefined,
      webViewLink: f.webViewLink || undefined,
    }));
  }

  async downloadFile(fileId: string, destinationPath: string): Promise<{ savedPath: string }> {
    const drive = this.getDrive();
    const destDir = path.dirname(destinationPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const destStream = fs.createWriteStream(destinationPath);
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

    return new Promise((resolve, reject) => {
      res.data
        .on('end', () => resolve({ savedPath: destinationPath }))
        .on('error', (err) => reject(err))
        .pipe(destStream);
    });
  }

  async uploadFile(localPath: string, driveFolderId?: string): Promise<DriveFileInfo> {
    const drive = this.getDrive();
    const fileName = path.basename(localPath);
    const fileMetadata: drive_v3.Schema$File = {
      name: fileName,
      parents: driveFolderId ? [driveFolderId] : undefined,
    };
    const media = {
      body: fs.createReadStream(localPath),
    };

    const res = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, name, mimeType, size, modifiedTime, webViewLink',
    });

    return {
      id: res.data.id || '',
      name: res.data.name || '',
      mimeType: res.data.mimeType || '',
      size: res.data.size || undefined,
      modifiedTime: res.data.modifiedTime || undefined,
      webViewLink: res.data.webViewLink || undefined,
    };
  }

  async createFolder(name: string, parentFolderId?: string): Promise<{ id: string; name: string }> {
    const drive = this.getDrive();
    const fileMetadata: drive_v3.Schema$File = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentFolderId ? [parentFolderId] : undefined,
    };

    const res = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, name',
    });

    return { id: res.data.id || '', name: res.data.name || '' };
  }

  async moveFile(fileId: string, newParentFolderId: string): Promise<{ success: boolean }> {
    const drive = this.getDrive();
    const file = await drive.files.get({ fileId, fields: 'parents' });
    const previousParents = (file.data.parents || []).join(',');

    await drive.files.update({
      fileId,
      addParents: newParentFolderId,
      removeParents: previousParents,
      fields: 'id, parents',
    });

    return { success: true };
  }

  async copyFile(fileId: string, newName?: string): Promise<DriveFileInfo> {
    const drive = this.getDrive();
    const res = await drive.files.copy({
      fileId,
      requestBody: newName ? { name: newName } : undefined,
      fields: 'id, name, mimeType, size, modifiedTime',
    });

    return {
      id: res.data.id || '',
      name: res.data.name || '',
      mimeType: res.data.mimeType || '',
      size: res.data.size || undefined,
      modifiedTime: res.data.modifiedTime || undefined,
    };
  }
}
