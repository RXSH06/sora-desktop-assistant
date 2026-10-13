import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, globalShortcut, clipboard, desktopCapturer } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { spawn, ChildProcess } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { DefaultCharacterController } from '@assistant/character';
import { DefaultPermissionManager } from '@assistant/permissions';
import { FileMemoryStore } from '@assistant/memory';
import { ToolRegistry, setNativeClipboard, setDesktopScreenshotProvider } from '@assistant/tools';
import { BrowserService, createBrowserTools } from '@assistant/browser';
import { GoogleAuthService, GmailService, createGmailTools } from '@assistant/gmail';
import { DriveService, createDriveTools } from '@assistant/drive';
import { AudioPlaybackQueue, base64ToInt16, generateWakeChime } from '@assistant/audio';
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
  geminiModel: process.env.GEMINI_MODEL || 'models/gemini-3.8-live',
  geminiVoice: process.env.GEMINI_VOICE || 'Puck',
  wakeWord: process.env.WAKE_WORD || 'hey jarvis',
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

let micProcess: ChildProcess | null = null;
let nativeMicRunning = false;

let micMuteUntil = 0;
let userHasSpoken = false;
let silenceFrames = 0;
let consecutiveSpeechFrames = 0; // require sustained speech before accepting
let listeningTimeoutTimer: NodeJS.Timeout | null = null;

function resetListeningState() {
  userHasSpoken = false;
  silenceFrames = 0;
  consecutiveSpeechFrames = 0;
  if (listeningTimeoutTimer) {
    clearTimeout(listeningTimeoutTimer);
    listeningTimeoutTimer = null;
  }
}

function handleListeningAudioChunk(int16: Int16Array, base64Chunk: string) {
  if (characterController?.getState() !== 'LISTENING') return;
  if (Date.now() < micMuteUntil) return;

  // Always stream audio to Gemini Live continuously.
  geminiClient?.sendAudioChunk(base64Chunk);

  let sumSquares = 0;
  for (let i = 0; i < int16.length; i++) {
    const v = int16[i] / 32768;
    sumSquares += v * v;
  }
  const rms = Math.sqrt(sumSquares / int16.length);

  // Voice speech threshold (~0.008 captures normal room speech, 0.02 was too high)
  if (rms > 0.008) {
    consecutiveSpeechFrames++;
    if (consecutiveSpeechFrames >= 2 && !userHasSpoken) {
      userHasSpoken = true;
      console.log(`[Audio VAD] User speech confirmed (RMS: ${rms.toFixed(4)}) — clearing listening timeout.`);
      if (listeningTimeoutTimer) {
        clearTimeout(listeningTimeoutTimer);
        listeningTimeoutTimer = null;
      }
      orchestrator?.notifyUserSpeaking();
    }
    silenceFrames = 0;
  } else {
    consecutiveSpeechFrames = 0;
    if (userHasSpoken) {
      silenceFrames++;
      // After ~1.8s of silence (25 frames) after speaking, signal turn complete
      if (silenceFrames >= 25) {
        console.log('[Audio VAD] Silence detected after speech. Signaling turn complete to Gemini...');
        userHasSpoken = false;
        consecutiveSpeechFrames = 0;
        silenceFrames = 0;
        characterController?.setState('THINKING');
        characterController?.showStatus('Thinking...');
        geminiClient?.finishUserTurn();
      }
    }
  }
}

function onWakeWordTriggered(wakeWordName?: string) {
  resetListeningState();
  // Mute mic streaming for 750ms so the 350ms chime does not echo into Gemini Live
  micMuteUntil = Date.now() + 750;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    // Play pleasant greeting chime through speakers
    mainWindow.webContents.send('audio-output', generateWakeChime(24000));
  }
  orchestrator?.handleWakeWordTrigger();

  // If nothing spoken within 15s (increased from 10s), return to IDLE
  listeningTimeoutTimer = setTimeout(() => {
    if (characterController?.getState() === 'LISTENING' && !userHasSpoken) {
      console.log('[Listening Timeout] No speech detected in 15s, returning to IDLE.');
      characterController?.setState('IDLE');
      characterController?.hideStatus();
    }
  }, 15000);
}

function startNativeMicCapture() {
  if (micProcess || !appConfig.wakeWordEnabled) return;

  try {
    const useParec = fs.existsSync('/usr/bin/parec');
    const hasArecord = fs.existsSync('/usr/bin/arecord');
    if (!useParec && !hasArecord) {
      console.log('[Native Mic] Neither parec nor arecord found, falling back to Web Audio');
      return;
    }

    const bin = useParec ? '/usr/bin/parec' : '/usr/bin/arecord';
    const args = useParec
      ? ['--rate=16000', '--channels=1', '--format=s16le', '--raw']
      : ['-q', '-D', 'default', '-r', '16000', '-c', '1', '-f', 'S16_LE', '-t', 'raw'];

    micProcess = spawn(bin, args);

    nativeMicRunning = true;
    console.log(`[Native Mic] ${useParec ? 'parec (PulseAudio/PipeWire active device, e.g. earbuds)' : 'arecord'} capture started for background wake word listening`);

    micProcess.stdout?.on('data', (chunk: Buffer) => {
      if (isMuted) return;

      const int16 = new Int16Array(
        chunk.buffer,
        chunk.byteOffset,
        Math.floor(chunk.length / 2)
      );

      // Feed chunk to neural wake word engine
      wakeWordEngine?.processAudioChunk(int16);

      // If active conversation listening is on, stream to Gemini Live with VAD turn detection
      if (characterController?.getState() === 'LISTENING') {
        handleListeningAudioChunk(int16, chunk.toString('base64'));
      }
    });

    micProcess.stderr?.on('data', (err) => {
      console.warn('[Native Mic arecord stderr]:', err.toString());
    });

    micProcess.on('error', (err) => {
      console.warn('[Native Mic arecord error]:', err.message);
      micProcess = null;
      nativeMicRunning = false;
    });

    micProcess.on('exit', () => {
      micProcess = null;
      nativeMicRunning = false;
    });
  } catch (err) {
    console.warn('[Native Mic] Could not start arecord:', err);
  }
}

function stopNativeMicCapture() {
  if (micProcess) {
    micProcess.kill('SIGINT');
    micProcess = null;
    nativeMicRunning = false;
    console.log('[Native Mic] arecord capture stopped');
  }
}

function createWindow() {
  loadConfigFromDisk();

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight, x: workAreaX, y: workAreaY } = primaryDisplay.workArea;

  const initialWidth = 380;
  const initialHeight = 440;
  // Position in bottom-right corner with 24px margin
  const initialX = Math.round(workAreaX + screenWidth - initialWidth - 24);
  const initialY = Math.round(workAreaY + screenHeight - initialHeight - 24);

  const preloadCandidates = [
    path.join(__dirname, '../preload/index.cjs'),
    path.join(__dirname, '../../src/preload/index.cjs'),
    path.join(process.cwd(), 'apps/desktop/src/preload/index.cjs'),
    path.join(process.cwd(), 'src/preload/index.cjs'),
  ];
  const preloadPath = preloadCandidates.find((p) => fs.existsSync(p)) || path.join(__dirname, '../preload/index.cjs');

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
      preload: preloadPath,
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
    if (event.type === 'state_change') {
      // Reset VAD state when entering LISTENING (fresh turn)
      if (event.state === 'LISTENING') {
        resetListeningState();
      }
      // Reset VAD state if conversation ends (back to IDLE without active session)
      if (event.state === 'IDLE') {
        resetListeningState();
      }
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('character-event', event);
    }
  });

  // 2. Permission Manager — uses a Map to track pending confirmations
  //    (resolved via ipcMain.handle('resolve-confirmation') in setupIpcHandlers)
  const pendingConfirmations = new Map<string, (approved: boolean) => void>();
  (globalThis as any).__pendingConfirmations = pendingConfirmations; // share with IPC handlers

  permissionManager = new DefaultPermissionManager({}, async (id, toolName, description, params) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    return new Promise<boolean>((resolve) => {
      pendingConfirmations.set(id, resolve);

      mainWindow!.webContents.send('confirmation-required', {
        id,
        toolName,
        description,
        details: params,
        createdAt: Date.now(),
      });

      // Auto-deny after 60s if no response
      setTimeout(() => {
        if (pendingConfirmations.has(id)) {
          pendingConfirmations.delete(id);
          resolve(false);
        }
      }, 60000);
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
      // Don't force IDLE if we're in an active live conversation —
      // the orchestrator's playback drain check will handle transitioning
      // back to LISTENING for multi-turn.
      if (characterController?.getState() === 'SPEAKING' && !orchestrator?.isLiveSessionActive()) {
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
  wakeWordEngine.onDetected((result: any) => {
    console.log(`[Wake Word Engine] Detected: "${result.wakeWord}" (score: ${result.score?.toFixed(2)})`);
    onWakeWordTriggered(result.wakeWord);
  });
  wakeWordEngine.start();
  if (appConfig.wakeWordEnabled) {
    startNativeMicCapture();
  }

  // 9. Gemini Live Client
  geminiClient = new GeminiLiveClient({
    apiKey: appConfig.geminiApiKey,
    model: appConfig.geminiModel,
    voice: appConfig.geminiVoice as any,
    systemInstruction: `You are Sora, a helpful, proactive, and charming desktop AI companion living on Ubuntu Linux.
Your primary mode is friendly, natural spoken conversation.

CRITICAL INSTRUCTIONS FOR TOOL CALLING:
- ONLY call tools when the user explicitly asks you to take an action or perform a command (e.g. "open chrome", "find invoice.pdf", "send an email to Alex", "take a screenshot").
- NEVER call tools for casual conversation, greetings, questions about yourself, jokes, general knowledge, inquiries, or conversational questions like "what can you do for me?", "what can you do?", "who are you?", "tell me a joke", or "how are you?".
- When the user asks "what can you do for me?", "what are your capabilities?", or asks about who you are, ANSWER DIRECTLY AND VERBALLY USING NATURAL SPOKEN VOICE. Verbally explain that you are Sora, a desktop companion that can help manage files, open applications, search the web, take screenshots, check emails, and navigate Ubuntu. DO NOT CALL ANY TOOLS!
- Always confirm before deleting files or sending emails.
- Keep spoken responses friendly, concise, and natural.

${memoryStore.getSystemPromptContext()}`,
    tools: toolRegistry.getGeminiFunctionDeclarations(),
    responseModalities: ['AUDIO'],
  });

  geminiClient.subscribe((event) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (event.type === 'audio') {
      mainWindow.webContents.send('audio-output', event.pcm24Base64);
    } else if (event.type === 'user_speech') {
      console.log(`[Assistant UI] Heard input: "${event.text}"`);
      characterController?.showStatus(`Heard: "${event.text}"`);
      mainWindow.webContents.send('character-event', {
        type: 'speech',
        state: characterController?.getState() || 'LISTENING',
        text: `You: "${event.text}"`,
        timestamp: Date.now(),
      });
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

  // Pre-connect to Gemini Live so first wake word query has zero connection latency
  if (appConfig.geminiApiKey) {
    geminiClient.connect().catch((err) => {
      console.warn('[GeminiLive] Initial pre-connect:', err.message);
    });
  }
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
          if (appConfig.wakeWordEnabled) {
            startNativeMicCapture();
          } else {
            stopNativeMicCapture();
          }
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
      console.log('[Shortcut] Ctrl+Space pressed: activating Sora');
      onWakeWordTriggered('manual shortcut');
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
      if (appConfig.wakeWordEnabled) {
        startNativeMicCapture();
      } else {
        stopNativeMicCapture();
      }
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

    // Fallback: if native arecord is not active, process chunk from renderer Web Audio
    if (!nativeMicRunning) {
      const int16 = base64ToInt16(base64Chunk);
      wakeWordEngine?.processAudioChunk(int16);

      // If Gemini session is actively listening, stream chunk with VAD turn completion
      if (characterController?.getState() === 'LISTENING') {
        handleListeningAudioChunk(int16, base64Chunk);
      }
    }
  });

  // Renderer reports that every audio chunk it was given has finished
  // playing. Without this the playback queue never drains, the character
  // stays stuck in SPEAKING, and the mic (gated on LISTENING) is never
  // streamed to Gemini again.
  ipcMain.handle('audio-playback-complete', () => {
    audioQueue?.markAllPlayed();
  });

  ipcMain.handle('resolve-confirmation', (_e, id: string, approved: boolean) => {
    const pendingConfirmations = (globalThis as any).__pendingConfirmations as Map<string, (approved: boolean) => void> | undefined;
    if (pendingConfirmations?.has(id)) {
      const resolve = pendingConfirmations.get(id)!;
      pendingConfirmations.delete(id);
      resolve(approved);
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
  stopNativeMicCapture();
  globalShortcut.unregisterAll();
  wakeWordEngine?.stop();
  browserService?.close().catch(() => {});
  geminiClient?.disconnect();
});
