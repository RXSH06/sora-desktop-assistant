import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { google } from 'googleapis';

type OAuth2Client = any;

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive',
];

export class GoogleAuthService {
  private oauth2Client: OAuth2Client | null = null;
  private tokenPath: string;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8089/oauth2callback';

    const configDir = path.join(os.homedir(), '.config', 'sora-assistant');
    if (!fs.existsSync(configDir)) {
      try {
        fs.mkdirSync(configDir, { recursive: true });
      } catch {}
    }
    this.tokenPath = path.join(configDir, 'google_tokens.enc');

    this.initClient();
  }

  private initClient(): void {
    if (this.clientId && this.clientSecret) {
      this.oauth2Client = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        this.redirectUri
      );
      this.loadTokens();
    }
  }

  setCredentials(clientId: string, clientSecret: string): void {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.initClient();
  }

  isAuthenticated(): boolean {
    return !!(this.oauth2Client && this.oauth2Client.credentials && this.oauth2Client.credentials.access_token);
  }

  getClient(): OAuth2Client {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth Client not initialized. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in settings or environment.');
    }
    return this.oauth2Client;
  }

  generateAuthUrl(): string {
    if (!this.oauth2Client) {
      throw new Error('Google OAuth Client not initialized.');
    }
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GMAIL_SCOPES,
    });
  }

  async startLocalOAuthFlow(): Promise<{ authUrl: string; waitForCompletion: () => Promise<boolean> }> {
    const authUrl = this.generateAuthUrl();

    const waitForCompletion = () =>
      new Promise<boolean>((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
          try {
            const reqUrl = new URL(req.url || '', 'http://localhost:8089');
            if (reqUrl.pathname === '/oauth2callback') {
              const code = reqUrl.searchParams.get('code');
              if (code && this.oauth2Client) {
                const { tokens } = await this.oauth2Client.getToken(code);
                this.oauth2Client.setCredentials(tokens);
                this.saveTokens(tokens);

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                  <div style="font-family:sans-serif; text-align:center; padding:50px;">
                    <h2 style="color:#10b981;">Authentication Successful!</h2>
                    <p>You can close this tab and return to Sora Assistant.</p>
                  </div>
                `);
                server.close();
                resolve(true);
                return;
              }
            }
            res.writeHead(400);
            res.end('Authentication callback error');
          } catch (err) {
            server.close();
            reject(err);
          }
        });

        server.listen(8089, () => {
          // Server listening
        });

        server.on('error', (err) => {
          reject(err);
        });

        // 3 minute timeout
        setTimeout(() => {
          server.close();
          resolve(false);
        }, 180000);
      });

    return { authUrl, waitForCompletion };
  }

  private getEncryptionKey(): Buffer {
    // Generate machine/user specific salt key
    const machineId = os.hostname() + os.userInfo().username;
    return crypto.scryptSync(machineId, 'sora-salt', 32);
  }

  private saveTokens(tokens: any): void {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', this.getEncryptionKey(), iv);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf-8'), cipher.final()]);
      const payload = JSON.stringify({
        iv: iv.toString('hex'),
        data: encrypted.toString('hex'),
      });
      fs.writeFileSync(this.tokenPath, payload, 'utf-8');
    } catch (err) {
      console.error('Failed to encrypt and save Google OAuth tokens:', err);
    }
  }

  private loadTokens(): void {
    try {
      if (fs.existsSync(this.tokenPath) && this.oauth2Client) {
        const raw = fs.readFileSync(this.tokenPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const iv = Buffer.from(parsed.iv, 'hex');
        const encrypted = Buffer.from(parsed.data, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.getEncryptionKey(), iv);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        const tokens = JSON.parse(decrypted.toString('utf-8'));
        this.oauth2Client.setCredentials(tokens);
      }
    } catch (err) {
      console.error('Failed to load Google OAuth tokens:', err);
    }
  }

  logout(): void {
    if (fs.existsSync(this.tokenPath)) {
      fs.unlinkSync(this.tokenPath);
    }
    if (this.oauth2Client) {
      this.oauth2Client.revokeCredentials().catch(() => {});
      this.oauth2Client.setCredentials({});
    }
  }
}
