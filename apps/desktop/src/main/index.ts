import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, globalShortcut, clipboard, desktopCapturer } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

import { DefaultCharacterController } from '@assistant/character';
import { DefaultPermissionManager } from '@assistant/permissions';
import { FileMemoryStore } from '@assistant/memory';
import { ToolRegistry, setNativeClipboard, setDesktopScreenshotProvider } from '@assistant/tools';
import { BrowserService, createBrowserTools } from '@assistant/browser';
import { GoogleAuthService, GmailService, createGmailTools } from '@assistant/gmail';
import { DriveService, createDriveTools } from '@assistant/drive';
import { AudioPlaybackQueue, base64ToInt16 } from '@assistant/audio';
import { createWakeWordEngine } from '@assistant/wakeword';
import { GeminiLiveClient } from '@assistant/gemini';
import { AgentOrchestrator } from '@assistant/agent';
import { AppConfig } from '../shared/ipc.js';

// Load environment variables from .env if present
const rootEnvPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let orchestrator: AgentOrchestrator | null = null;
let characterController: DefaultCharacterController | null = null;
let permissionManager: DefaultPermissionManager | null = null;
let memoryStore: FileMemoryStore | null = null;
let toolRegistry: ToolRegistry | null = null;
let browserService: BrowserService | null = null;
let googleAuthService: GoogleAuthService | null = null;
let gmailService: GmailService | null = null;
let driveService: DriveService | null = null;
let audioQueue: AudioPlaybackQueue | null = null;
let geminiClient: GeminiLiveClient | null = null;
let wakeWordEngine: any = null;

let isMuted = false;

// Persistent configuration state
let appConfig: AppConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'models/gemini-2.0-flash-exp',
  geminiVoice: process.env.GEMINI_VOICE || 'Puck',
  wakeWord: process.env.WAKE_WORD || 'hey sora',
  wakeWordEnabled: process.env.WAKE_WORD_ENABLED !== 'false',
  wakeWordSensitivity: parseFloat(process.env.WAKE_WORD_SENSITIVITY || '0.6'),
  alwaysOnTop: process.env.APP_ALWAYS_ON_TOP !== 'false',
  opacity: parseFloat(process.env.APP_OPACITY || '0.96'),
  characterSize: parseInt(process.env.CHARACTER_SIZE || '180', 10),
  speechBubbleEnabled: process.env.SPEECH_BUBBLE_ENABLED !== 'false',
  autoStartOnBoot: process.env.AUTOSTART_ON_BOOT === 'true',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  hasGoogleAuth: false,
};

function saveConfigToDisk() {
  try {
    const configDir = path.join(os.homedir(), '.config', 'sora-assistant');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(appConfig, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist config:', err);
  }
}

function loadConfigFromDisk() {
  try {
    const filePath = path.join(os.homedir(), '.config', 'sora-assistant', 'config.json');
    if (fs.existsSync(filePath)) {
      const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      appConfig = { ...appConfig, ...saved };
    }
  } catch (err) {
    console.error('Failed to load saved config:', err);
  }
}

function createWindow() {
  loadConfigFromDisk();

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const initialWidth = 380;
  const initialHeight = 440;
  // Position in bottom-right corner with 24px margin
  const initialX = Math.round(screenWidth - initialWidth - 24);
  const initialY = Math.round(screenHeight - initialHeight - 24);

  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: initialX,
    y: initialY,
    transparent: true,
    frame: false,
    alwaysOnTop: appConfig.alwaysOnTop,
    resizable: true,
    skipTaskbar: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  mainWindow.setOpacity(appConfig.opacity);

  // Setup bridge hooks for native clipboard and desktop capture
  setNativeClipboard({
    readText: () => clipboard.readText(),
    writeText: (t: string) => clipboard.writeText(t),
  });

  setDesktopScreenshotProvider(async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
    if (sources.length > 0) {
      return sources[0].thumbnail.toPNG().toString('base64');
    }
    throw new Error('No screen captured');
  });

  // Load URL
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // Production dist
    const candidatePaths = [
      path.join(__dirname, '../../dist-renderer/index.html'),
      path.join(__dirname, '../dist-renderer/index.html'),
    ];
    const indexPath = candidatePaths.find((p) => fs.existsSync(p));
    if (indexPath) {
      mainWindow.loadFile(indexPath);
    } else {
      mainWindow.loadURL('http://localhost:5173');
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initializeAssistant() {
  // 1. Character Controller
  characterController = new DefaultCharacterController();
  characterController.subscribe((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('character-event', event);
    }
  });

  // 2. Permission Manager
  permissionManager = new DefaultPermissionManager({}, async (id, toolName, description, params) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    return new Promise<boolean>((resolve) => {
      mainWindow!.webContents.send('confirmation-required', {
        id,
        toolName,
        description,
        details: params,
        createdAt: Date.now(),
      });

      const onResponse = (_e: any, respId: string, approved: boolean) => {
        if (respId === id) {
          ipcMain.removeListener('resolve-confirmation', onResponse);
          resolve(approved);
        }
      };
      ipcMain.on('resolve-confirmation', onResponse);
    });
  });

  // 3. Memory
  memoryStore = new FileMemoryStore();

  // 4. Tool Registry
  toolRegistry = new ToolRegistry(permissionManager);

  // 5. Browser Automation
  browserService = new BrowserService({ headless: false });
  const browserTools = createBrowserTools(browserService);
  for (const t of browserTools) {
    toolRegistry.register(t);
  }

  // 6. Google Services (Gmail & Drive)
  googleAuthService = new GoogleAuthService();
  if (appConfig.googleClientId && appConfig.googleClientSecret) {
    googleAuthService.setCredentials(appConfig.googleClientId, appConfig.googleClientSecret);
  }
  appConfig.hasGoogleAuth = googleAuthService.isAuthenticated();

  gmailService = new GmailService(googleAuthService);
  const gmailTools = createGmailTools(gmailService);
  for (const t of gmailTools) {
    toolRegistry.register(t);
  }

  driveService = new DriveService(googleAuthService);
  const driveTools = createDriveTools(driveService);
  for (const t of driveTools) {
    toolRegistry.register(t);
  }

  // 7. Audio Queue
  audioQueue = new AudioPlaybackQueue({
    sampleRate: 24000,
    onPlaybackStart: () => {
      characterController?.setState('SPEAKING');
    },
    onPlaybackEnd: () => {
      if (characterController?.getState() === 'SPEAKING') {
        characterController?.setState('IDLE');
      }
    },
  });

  // 8. Wake Word Engine
  wakeWordEngine = createWakeWordEngine({
    wakeWord: appConfig.wakeWord,
    enabled: appConfig.wakeWordEnabled,
    sensitivity: appConfig.wakeWordSensitivity,
  });
  wakeWordEngine.start();

  // 9. Gemini Live Client
  geminiClient = new GeminiLiveClient({
    apiKey: appConfig.geminiApiKey,
    model: appConfig.geminiModel,
    voice: appConfig.geminiVoice as any,
    systemInstruction: `You are Sora, a helpful, proactive, and charming desktop AI companion living on Ubuntu Linux.
You have access to safe desktop tools to help the user manage files, control applications, search emails in Gmail, automate web browser actions, and interact with the system.
Be concise, polite, natural, and helpful. Always confirm before deleting or sending emails.
${memoryStore.getSystemPromptContext()}`,
    tools: toolRegistry.getGeminiFunctionDeclarations(),
    responseModalities: ['AUDIO', 'TEXT'],
  });

  geminiClient.subscribe((event) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (event.type === 'audio') {
      mainWindow.webContents.send('audio-output', event.pcm24Base64);
    } else if (event.type === 'interrupted') {
      mainWindow.webContents.send('audio-interrupt');
    }
  });

  // 10. Agent Orchestrator
  orchestrator = new AgentOrchestrator({
    character: characterController,
    permissions: permissionManager,
    tools: toolRegistry,
    memory: memoryStore,
    gemini: geminiClient,
    audioQueue,
    wakeWord: wakeWordEngine,
  });
}

function setupTray() {
  // Create a clean 24x24 robot tray icon programmatically
  const size = 24;
  const iconCanvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // Draw a friendly robot head shape
      if (x >= 4 && x <= 19 && y >= 5 && y <= 19) {
        iconCanvas[idx] = 99; // B
        iconCanvas[idx + 1] = 102; // G
        iconCanvas[idx + 2] = 241; // R (Indigo)
        iconCanvas[idx + 3] = 255; // Alpha
      }
    }
  }
  const trayIcon = nativeImage.createFromBuffer(iconCanvas, { width: size, height: size });
  tray = new Tray(trayIcon);
  tray.setToolTip('Sora Desktop Assistant');

  const updateMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Sora AI Assistant', enabled: false },
      { type: 'separator' },
      {
        label: isMuted ? 'Unmute Microphone' : 'Mute Microphone',
        click: () => {
          isMuted = !isMuted;
          updateMenu();
        },
      },
      {
        label: appConfig.wakeWordEnabled ? 'Disable Wake Word' : 'Enable Wake Word',
        click: () => {
          appConfig.wakeWordEnabled = !appConfig.wakeWordEnabled;
          wakeWordEngine?.updateConfig({ enabled: appConfig.wakeWordEnabled });
          saveConfigToDisk();
          updateMenu();
        },
      },
      {
        label: 'Open Settings',
        click: () => {
          mainWindow?.show();
          mainWindow?.webContents.send('open-settings');
        },
      },
      {
        label: 'Conversation History',
        click: () => {
          mainWindow?.show();
          mainWindow?.webContents.send('open-history');
        },
      },
      {
        label: 'Permissions Manager',
        click: () => {
          mainWindow?.show();
          mainWindow?.webContents.send('open-permissions');
        },
      },
      {
        label: 'Restart Gemini Session',
        click: () => {
          geminiClient?.disconnect();
          geminiClient?.connect().catch((err) => console.error('Restart failed:', err));
        },
      },
      { type: 'separator' },
      {
        label: 'Emergency Stop (Ctrl+Shift+Esc)',
        click: () => {
          orchestrator?.emergencyStop();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]);
    tray?.setContextMenu(contextMenu);
  };

  updateMenu();
}

function registerShortcuts() {
  // Global Shortcut 1: Ctrl+Space -> Activate / Listen
  try {
    globalShortcut.register('CommandOrControl+Space', () => {
      orchestrator?.handleWakeWordTrigger();
      mainWindow?.show();
    });
  } catch (err) {
    console.warn('Could not register Ctrl+Space shortcut:', err);
  }

  // Global Shortcut 2: Ctrl+Shift+Escape -> Emergency Stop
  try {
    globalShortcut.register('CommandOrControl+Shift+Escape', () => {
      orchestrator?.emergencyStop();
    });
  } catch (err) {
    console.warn('Could not register Ctrl+Shift+Esc shortcut:', err);
  }
}

function setupIpcHandlers() {
  ipcMain.handle('get-config', () => appConfig);

  ipcMain.handle('update-config', (_e, newConfig: Partial<AppConfig>) => {
    appConfig = { ...appConfig, ...newConfig };
    if (newConfig.alwaysOnTop !== undefined) {
      mainWindow?.setAlwaysOnTop(newConfig.alwaysOnTop);
    }
    if (newConfig.opacity !== undefined) {
      mainWindow?.setOpacity(newConfig.opacity);
    }
    if (newConfig.wakeWordEnabled !== undefined || newConfig.wakeWord || newConfig.wakeWordSensitivity) {
      wakeWordEngine?.updateConfig({
        wakeWord: appConfig.wakeWord,
        enabled: appConfig.wakeWordEnabled,
        sensitivity: appConfig.wakeWordSensitivity,
      });
    }
    if (newConfig.geminiApiKey || newConfig.geminiModel || newConfig.geminiVoice) {
      geminiClient?.updateConfig({
        apiKey: appConfig.geminiApiKey,
        model: appConfig.geminiModel,
        voice: appConfig.geminiVoice as any,
      });
    }
    if (newConfig.googleClientId && newConfig.googleClientSecret) {
      googleAuthService?.setCredentials(appConfig.googleClientId, appConfig.googleClientSecret);
      appConfig.hasGoogleAuth = googleAuthService?.isAuthenticated() || false;
    }
    saveConfigToDisk();
    return appConfig;
  });

  ipcMain.handle('send-prompt', async (_e, prompt: string) => {
    await orchestrator?.processUserTextPrompt(prompt);
  });

  ipcMain.handle('interrupt', () => {
    orchestrator?.handleInterruption();
  });

  ipcMain.handle('emergency-stop', () => {
    orchestrator?.emergencyStop();
  });

  ipcMain.handle('reset-emergency-stop', () => {
    orchestrator?.resetEmergencyStop();
  });

  ipcMain.handle('set-mic-muted', (_e, muted: boolean) => {
    isMuted = muted;
  });

  ipcMain.handle('send-audio-chunk', (_e, base64Chunk: string) => {
    if (isMuted) return;

    // Convert chunk for local wake word engine
    const int16 = base64ToInt16(base64Chunk);
    wakeWordEngine?.processAudioChunk(int16);

    // If Gemini session is actively listening, stream chunk
    if (characterController?.getState() === 'LISTENING') {
      geminiClient?.sendAudioChunk(base64Chunk);
    }
  });

  ipcMain.handle('get-policies', () => permissionManager?.getAllPolicies() || []);
  ipcMain.handle('set-policy', (_e, toolName: string, level: any) => {
    permissionManager?.setToolLevel(toolName, level);
  });
  ipcMain.handle('get-audit-logs', () => permissionManager?.getAuditLogs(100) || []);

  ipcMain.handle('get-memory', () => memoryStore?.getAll() || {});
  ipcMain.handle('set-memory', (_e, cat: any, k: string, v: any, d?: string) => {
    memoryStore?.set(cat, k, v, d);
  });
  ipcMain.handle('delete-memory', (_e, cat: any, k: string) => {
    return memoryStore?.delete(cat, k);
  });
  ipcMain.handle('clear-memory', (_e, cat?: any) => {
    memoryStore?.clear(cat);
  });

  ipcMain.handle('start-google-auth', async () => {
    if (!googleAuthService) throw new Error('Google Auth not initialized');
    const flow = await googleAuthService.startLocalOAuthFlow();
    flow.waitForCompletion().then((success) => {
      appConfig.hasGoogleAuth = success;
      mainWindow?.webContents.send('auth-status-changed', success);
    });
    return { authUrl: flow.authUrl };
  });

  ipcMain.handle('disconnect-google-auth', () => {
    googleAuthService?.logout();
    appConfig.hasGoogleAuth = false;
  });

  ipcMain.handle('minimize-window', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('toggle-drawer', (_e, open: boolean) => {
    if (!mainWindow) return;
    const [currWidth, currHeight] = mainWindow.getSize();
    const [currX, currY] = mainWindow.getPosition();

    const targetWidth = open ? 460 : 380;
    const targetHeight = open ? 640 : 440;

    // Adjust position so window bottom-right remains anchored
    const deltaW = targetWidth - currWidth;
    const deltaH = targetHeight - currHeight;
    mainWindow.setBounds({
      x: currX - deltaW,
      y: currY - deltaH,
      width: targetWidth,
      height: targetHeight,
    });
  });
}

app.whenReady().then(() => {
  createWindow();
  initializeAssistant();
  setupTray();
  registerShortcuts();
  setupIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  wakeWordEngine?.stop();
  browserService?.close().catch(() => {});
  geminiClient?.disconnect();
});
