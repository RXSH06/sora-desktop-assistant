const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config) => ipcRenderer.invoke('update-config', config),

  sendPrompt: (prompt) => ipcRenderer.invoke('send-prompt', prompt),
  interrupt: () => ipcRenderer.invoke('interrupt'),
  emergencyStop: () => ipcRenderer.invoke('emergency-stop'),
  resetEmergencyStop: () => ipcRenderer.invoke('reset-emergency-stop'),
  setMicMuted: (muted) => ipcRenderer.invoke('set-mic-muted', muted),

  sendAudioChunk: (base64Chunk) => ipcRenderer.invoke('send-audio-chunk', base64Chunk),

  resolveConfirmation: (id, approved) =>
    ipcRenderer.invoke('resolve-confirmation', id, approved),

  getPolicies: () => ipcRenderer.invoke('get-policies'),
  setPolicy: (toolName, level) =>
    ipcRenderer.invoke('set-policy', toolName, level),
  getAuditLogs: () => ipcRenderer.invoke('get-audit-logs'),

  getMemory: () => ipcRenderer.invoke('get-memory'),
  setMemory: (category, key, value, description) =>
    ipcRenderer.invoke('set-memory', category, key, value, description),
  deleteMemory: (category, key) =>
    ipcRenderer.invoke('delete-memory', category, key),
  clearMemory: (category) => ipcRenderer.invoke('clear-memory', category),

  startGoogleAuth: () => ipcRenderer.invoke('start-google-auth'),
  disconnectGoogleAuth: () => ipcRenderer.invoke('disconnect-google-auth'),

  onCharacterEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('character-event', handler);
    return () => {
      ipcRenderer.removeListener('character-event', handler);
    };
  },

  onAudioOutput: (callback) => {
    const handler = (_event, pcm) => callback(pcm);
    ipcRenderer.on('audio-output', handler);
    return () => {
      ipcRenderer.removeListener('audio-output', handler);
    };
  },

  onAudioInterrupt: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('audio-interrupt', handler);
    return () => {
      ipcRenderer.removeListener('audio-interrupt', handler);
    };
  },

  onConfirmationRequired: (callback) => {
    const handler = (_event, req) => callback(req);
    ipcRenderer.on('confirmation-required', handler);
    return () => {
      ipcRenderer.removeListener('confirmation-required', handler);
    };
  },

  onLogsUpdated: (callback) => {
    const handler = (_event, logs) => callback(logs);
    ipcRenderer.on('logs-updated', handler);
    return () => {
      ipcRenderer.removeListener('logs-updated', handler);
    };
  },

  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  toggleDrawer: (open) => ipcRenderer.invoke('toggle-drawer', open),
};

try {
  contextBridge.exposeInMainWorld('assistantAPI', api);
  console.log('✓ Sora assistantAPI successfully exposed via contextBridge');
} catch (err) {
  console.error('Failed to expose assistantAPI via contextBridge:', err);
}
