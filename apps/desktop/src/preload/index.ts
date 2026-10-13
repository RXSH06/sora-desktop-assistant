import { contextBridge, ipcRenderer } from 'electron';
import { SoraAPI, AppConfig } from '../shared/ipc.js';
import { CharacterEvent, ConfirmationRequest } from '@assistant/character';
import { PermissionLevel } from '@assistant/permissions';
import { MemoryCategory } from '@assistant/memory';

const api: SoraAPI = {
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config: Partial<AppConfig>) => ipcRenderer.invoke('update-config', config),

  sendPrompt: (prompt: string) => ipcRenderer.invoke('send-prompt', prompt),
  interrupt: () => ipcRenderer.invoke('interrupt'),
  emergencyStop: () => ipcRenderer.invoke('emergency-stop'),
  resetEmergencyStop: () => ipcRenderer.invoke('reset-emergency-stop'),
  setMicMuted: (muted: boolean) => ipcRenderer.invoke('set-mic-muted', muted),

  sendAudioChunk: (base64Chunk: string) => ipcRenderer.invoke('send-audio-chunk', base64Chunk),
  notifyPlaybackComplete: () => ipcRenderer.invoke('audio-playback-complete'),

  resolveConfirmation: (id: string, approved: boolean) =>
    ipcRenderer.invoke('resolve-confirmation', id, approved),

  getPolicies: () => ipcRenderer.invoke('get-policies'),
  setPolicy: (toolName: string, level: PermissionLevel) =>
    ipcRenderer.invoke('set-policy', toolName, level),
  getAuditLogs: () => ipcRenderer.invoke('get-audit-logs'),

  getMemory: () => ipcRenderer.invoke('get-memory'),
  setMemory: (category: MemoryCategory, key: string, value: unknown, description?: string) =>
    ipcRenderer.invoke('set-memory', category, key, value, description),
  deleteMemory: (category: MemoryCategory, key: string) =>
    ipcRenderer.invoke('delete-memory', category, key),
  clearMemory: (category?: MemoryCategory) => ipcRenderer.invoke('clear-memory', category),

  startGoogleAuth: () => ipcRenderer.invoke('start-google-auth'),
  disconnectGoogleAuth: () => ipcRenderer.invoke('disconnect-google-auth'),

  onCharacterEvent: (callback: (event: CharacterEvent) => void) => {
    const handler = (_event: any, data: CharacterEvent) => callback(data);
    ipcRenderer.on('character-event', handler);
    return () => {
      ipcRenderer.removeListener('character-event', handler);
    };
  },

  onAudioOutput: (callback: (pcm24Base64: string) => void) => {
    const handler = (_event: any, pcm: string) => callback(pcm);
    ipcRenderer.on('audio-output', handler);
    return () => {
      ipcRenderer.removeListener('audio-output', handler);
    };
  },

  onAudioInterrupt: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('audio-interrupt', handler);
    return () => {
      ipcRenderer.removeListener('audio-interrupt', handler);
    };
  },

  onConfirmationRequired: (callback: (request: ConfirmationRequest) => void) => {
    const handler = (_event: any, req: ConfirmationRequest) => callback(req);
    ipcRenderer.on('confirmation-required', handler);
    return () => {
      ipcRenderer.removeListener('confirmation-required', handler);
    };
  },

  onLogsUpdated: (callback: (logs: any[]) => void) => {
    const handler = (_event: any, logs: any[]) => callback(logs);
    ipcRenderer.on('logs-updated', handler);
    return () => {
      ipcRenderer.removeListener('logs-updated', handler);
    };
  },

  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  toggleDrawer: (open: boolean) => ipcRenderer.invoke('toggle-drawer', open),
};

contextBridge.exposeInMainWorld('assistantAPI', api);
