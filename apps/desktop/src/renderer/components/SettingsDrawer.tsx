import React, { useState, useEffect } from 'react';
import { Settings, X, Shield, Key, Sparkles, Database, Mic, Globe, Check, AlertCircle } from 'lucide-react';
import { AppConfig } from '../../shared/ipc.js';
import { PermissionPolicy, PermissionLevel } from '@assistant/permissions';
import { MemoryItem, MemoryCategory } from '@assistant/memory';
import { getAssistantAPI } from '../api.js';

const api = getAssistantAPI();

interface SettingsDrawerProps {
  config: AppConfig;
  isOpen: boolean;
  onClose: () => void;
  onSaveConfig: (updated: Partial<AppConfig>) => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  config,
  isOpen,
  onClose,
  onSaveConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'gemini' | 'voice' | 'permissions' | 'memory' | 'google'>('general');
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [policies, setPolicies] = useState<PermissionPolicy[]>([]);
  const [memory, setMemory] = useState<Record<MemoryCategory, MemoryItem[]>>({} as any);
  const [newMemKey, setNewMemKey] = useState('');
  const [newMemVal, setNewMemVal] = useState('');
  const [newMemCat, setNewMemCat] = useState<MemoryCategory>('projects');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  useEffect(() => {
    if (isOpen) {
      loadPolicies();
      loadMemory();
    }
  }, [isOpen]);

  const loadPolicies = async () => {
    try {
      const pols = await api.getPolicies();
      setPolicies(pols);
    } catch {}
  };

  const loadMemory = async () => {
    try {
      const mem = await api.getMemory();
      setMemory(mem);
    } catch {}
  };

  const handleUpdatePolicy = async (toolName: string, level: PermissionLevel) => {
    await api.setPolicy(toolName, level);
    setPolicies((prev) =>
      prev.map((p) => (p.toolName === toolName ? { ...p, level } : p))
    );
  };

  const handleAddMemory = async () => {
    if (!newMemKey || !newMemVal) return;
    await api.setMemory(newMemCat, newMemKey, newMemVal);
    setNewMemKey('');
    setNewMemVal('');
    loadMemory();
  };

  const handleDeleteMemory = async (cat: MemoryCategory, key: string) => {
    await api.deleteMemory(cat, key);
    loadMemory();
  };

  const handleSaveAll = () => {
    onSaveConfig(localConfig);
    setStatusMsg('Settings saved!');
    setTimeout(() => setStatusMsg(''), 2500);
  };

  const handleStartGoogleAuth = async () => {
    try {
      const res = await api.startGoogleAuth();
      if (res.authUrl) {
        window.open(res.authUrl, '_blank');
      }
    } catch (err: any) {
      alert('Error initiating Google OAuth: ' + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-[420px] max-h-[580px] bg-gray-900/98 border border-gray-700 text-gray-200 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden animate-fadeIn app-no-drag">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/50">
        <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-sm">
          <Settings size={16} />
          <span>Sora Assistant Settings</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 bg-gray-950/30 text-xs font-medium px-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('general')}
          className={`py-2 px-2.5 border-b-2 transition-colors ${
            activeTab === 'general' ? 'border-indigo-500 text-indigo-400 font-semibold' : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          General
        </button>
        <button
          onClick={() => setActiveTab('gemini')}
          className={`py-2 px-2.5 border-b-2 transition-colors ${
            activeTab === 'gemini' ? 'border-indigo-500 text-indigo-400 font-semibold' : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Gemini
        </button>
        <button
          onClick={() => setActiveTab('voice')}
          className={`py-2 px-2.5 border-b-2 transition-colors ${
            activeTab === 'voice' ? 'border-indigo-500 text-indigo-400 font-semibold' : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Voice & Wake
        </button>
        <button
          onClick={() => setActiveTab('permissions')}
          className={`py-2 px-2.5 border-b-2 transition-colors ${
            activeTab === 'permissions' ? 'border-indigo-500 text-indigo-400 font-semibold' : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Permissions
        </button>
        <button
          onClick={() => setActiveTab('memory')}
          className={`py-2 px-2.5 border-b-2 transition-colors ${
            activeTab === 'memory' ? 'border-indigo-500 text-indigo-400 font-semibold' : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Memory
        </button>
        <button
          onClick={() => setActiveTab('google')}
          className={`py-2 px-2.5 border-b-2 transition-colors ${
            activeTab === 'google' ? 'border-indigo-500 text-indigo-400 font-semibold' : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Google OAuth
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
        {/* GENERAL TAB */}
        {activeTab === 'general' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-gray-200 font-medium block">Always on Top</label>
                <span className="text-[11px] text-gray-500">Keep assistant floating above other windows</span>
              </div>
              <input
                type="checkbox"
                checked={localConfig.alwaysOnTop}
                onChange={(e) => setLocalConfig({ ...localConfig, alwaysOnTop: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-800 border-gray-700"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-gray-200 font-medium block">Speech Bubbles</label>
                <span className="text-[11px] text-gray-500">Show floating dialogue bubbles when speaking</span>
              </div>
              <input
                type="checkbox"
                checked={localConfig.speechBubbleEnabled}
                onChange={(e) => setLocalConfig({ ...localConfig, speechBubbleEnabled: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-800 border-gray-700"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-gray-200 font-medium block">Launch on OS Boot</label>
                <span className="text-[11px] text-gray-500">Start Sora Assistant on Ubuntu login</span>
              </div>
              <input
                type="checkbox"
                checked={localConfig.autoStartOnBoot}
                onChange={(e) => setLocalConfig({ ...localConfig, autoStartOnBoot: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-800 border-gray-700"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-gray-200 font-medium">Window Opacity</label>
                <span className="text-gray-400">{Math.round(localConfig.opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1"
                step="0.05"
                value={localConfig.opacity}
                onChange={(e) => setLocalConfig({ ...localConfig, opacity: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-gray-200 font-medium">Character Size</label>
                <span className="text-gray-400">{localConfig.characterSize}px</span>
              </div>
              <input
                type="range"
                min="120"
                max="240"
                step="10"
                value={localConfig.characterSize}
                onChange={(e) => setLocalConfig({ ...localConfig, characterSize: parseInt(e.target.value, 10) })}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* GEMINI TAB */}
        {activeTab === 'gemini' && (
          <div className="space-y-3.5">
            <div>
              <label className="text-gray-200 font-medium block mb-1">Gemini API Key</label>
              <input
                type="password"
                value={localConfig.geminiApiKey}
                onChange={(e) => setLocalConfig({ ...localConfig, geminiApiKey: e.target.value })}
                placeholder="AIzaSy..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[10px] text-gray-500 mt-1 block">
                API Key is stored locally and never transmitted to untrusted third parties.
              </span>
            </div>

            <div>
              <label className="text-gray-200 font-medium block mb-1">Gemini Model</label>
              <select
                value={localConfig.geminiModel}
                onChange={(e) => setLocalConfig({ ...localConfig, geminiModel: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="models/gemini-2.0-flash-exp">models/gemini-2.0-flash-exp (Gemini Live Audio)</option>
                <option value="models/gemini-2.0-flash">models/gemini-2.0-flash</option>
                <option value="models/gemini-1.5-pro">models/gemini-1.5-pro</option>
              </select>
            </div>

            <div>
              <label className="text-gray-200 font-medium block mb-1">Assistant Voice</label>
              <select
                value={localConfig.geminiVoice}
                onChange={(e) => setLocalConfig({ ...localConfig, geminiVoice: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="Puck">Puck (Friendly & Lively)</option>
                <option value="Charon">Charon (Deep & Calm)</option>
                <option value="Kore">Kore (Warm & Clear)</option>
                <option value="Fenrir">Fenrir (Authoritative)</option>
                <option value="Aoede">Aoede (Bright & Melodic)</option>
              </select>
            </div>
          </div>
        )}

        {/* VOICE & WAKE WORD TAB */}
        {activeTab === 'voice' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-gray-200 font-medium block">Offline Wake Word</label>
                <span className="text-[11px] text-gray-500">Detect wake word locally without cloud streaming</span>
              </div>
              <input
                type="checkbox"
                checked={localConfig.wakeWordEnabled}
                onChange={(e) => setLocalConfig({ ...localConfig, wakeWordEnabled: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-800 border-gray-700"
              />
            </div>

            <div>
              <label className="text-gray-200 font-medium block mb-1">Wake Word Phrase</label>
              <input
                type="text"
                value={localConfig.wakeWord}
                onChange={(e) => setLocalConfig({ ...localConfig, wakeWord: e.target.value })}
                placeholder="hey sora"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-gray-200 font-medium">Detection Sensitivity</label>
                <span className="text-gray-400">{Math.round(localConfig.wakeWordSensitivity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="0.95"
                step="0.05"
                value={localConfig.wakeWordSensitivity}
                onChange={(e) => setLocalConfig({ ...localConfig, wakeWordSensitivity: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div className="bg-gray-800/60 p-3 rounded-lg border border-gray-700">
              <span className="text-indigo-300 font-medium block mb-1">Keyboard Shortcuts:</span>
              <p className="text-[11px] text-gray-400">
                <code className="text-indigo-400 font-mono">Ctrl + Space</code>: Activate Listening
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                <code className="text-rose-400 font-mono">Ctrl + Shift + Esc</code>: Global Emergency Stop
              </p>
            </div>
          </div>
        )}

        {/* PERMISSIONS TAB */}
        {activeTab === 'permissions' && (
          <div className="space-y-3">
            <p className="text-gray-400 text-[11px]">
              Configure which actions Sora can execute safely vs those that require explicit confirmation or are blocked.
            </p>

            <div className="divide-y divide-gray-800 max-h-[300px] overflow-y-auto pr-1">
              {policies.map((p) => (
                <div key={p.toolName} className="py-2 flex items-center justify-between">
                  <div className="pr-2">
                    <span className="font-mono text-gray-200 font-medium">{p.toolName}</span>
                    <span className="text-[10px] text-gray-500 block truncate max-w-[200px]">{p.description}</span>
                  </div>
                  <select
                    value={p.level}
                    onChange={(e) => handleUpdatePolicy(p.toolName, e.target.value as PermissionLevel)}
                    className={`text-[11px] rounded px-2 py-1 border font-semibold ${
                      p.level === 'SAFE'
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                        : p.level === 'CONFIRM'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                        : p.level === 'RESTRICTED'
                        ? 'bg-indigo-950/60 text-indigo-300 border-indigo-800'
                        : 'bg-rose-950/60 text-rose-300 border-rose-800'
                    }`}
                  >
                    <option value="SAFE">SAFE</option>
                    <option value="CONFIRM">CONFIRM</option>
                    <option value="RESTRICTED">RESTRICTED</option>
                    <option value="BLOCKED">BLOCKED</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MEMORY TAB */}
        {activeTab === 'memory' && (
          <div className="space-y-3">
            <p className="text-gray-400 text-[11px]">
              Stored paths, projects, and shortcuts that Sora references during tasks.
            </p>

            {/* Add memory form */}
            <div className="bg-gray-800/70 p-2.5 rounded-lg border border-gray-700 space-y-2">
              <span className="font-medium text-gray-200 block text-[11px]">Remember New Location or Preference:</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Key (e.g. robot project)"
                  value={newMemKey}
                  onChange={(e) => setNewMemKey(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
                />
                <select
                  value={newMemCat}
                  onChange={(e) => setNewMemCat(e.target.value as MemoryCategory)}
                  className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
                >
                  <option value="projects">Projects</option>
                  <option value="frequent_paths">Frequent Paths</option>
                  <option value="user_preferences">User Preferences</option>
                  <option value="applications">Applications</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="Value (e.g. ~/Projects/Companion Robot)"
                value={newMemVal}
                onChange={(e) => setNewMemVal(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs"
              />
              <button
                onClick={handleAddMemory}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-1 rounded transition-colors text-xs"
              >
                Save to Memory
              </button>
            </div>

            {/* List memory */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {Object.entries(memory).map(([cat, items]) => (
                <div key={cat} className="bg-gray-950/40 p-2 rounded border border-gray-800">
                  <span className="font-semibold text-indigo-400 uppercase text-[10px] tracking-wider block mb-1">
                    {cat.replace(/_/g, ' ')}
                  </span>
                  {items.length === 0 ? (
                    <span className="text-gray-600 text-[10px] italic">None stored</span>
                  ) : (
                    items.map((item) => (
                      <div key={item.key} className="flex items-center justify-between text-[11px] py-0.5">
                        <span className="text-gray-300 font-mono">"{item.key}":</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-400 truncate max-w-[140px]">{String(item.value)}</span>
                          <button
                            onClick={() => handleDeleteMemory(item.category, item.key)}
                            className="text-gray-500 hover:text-rose-400"
                            title="Delete"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GOOGLE OAUTH TAB */}
        {activeTab === 'google' && (
          <div className="space-y-3.5">
            <div>
              <label className="text-gray-200 font-medium block mb-1">Google Client ID</label>
              <input
                type="text"
                value={localConfig.googleClientId}
                onChange={(e) => setLocalConfig({ ...localConfig, googleClientId: e.target.value })}
                placeholder="xxxx.apps.googleusercontent.com"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-gray-200 font-medium block mb-1">Google Client Secret</label>
              <input
                type="password"
                value={localConfig.googleClientSecret}
                onChange={(e) => setLocalConfig({ ...localConfig, googleClientSecret: e.target.value })}
                placeholder="GOCSPX-..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-300 font-medium">OAuth Account Status:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  localConfig.hasGoogleAuth ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-gray-800 text-gray-400'
                }`}>
                  {localConfig.hasGoogleAuth ? 'CONNECTED' : 'NOT CONNECTED'}
                </span>
              </div>

              {localConfig.hasGoogleAuth ? (
                <button
                  onClick={async () => {
                    await api.disconnectGoogleAuth();
                    setLocalConfig({ ...localConfig, hasGoogleAuth: false });
                  }}
                  className="w-full bg-rose-600 hover:bg-rose-500 text-white font-medium py-1.5 rounded transition-colors text-xs"
                >
                  Disconnect Google Account
                </button>
              ) : (
                <button
                  onClick={handleStartGoogleAuth}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-1.5 rounded transition-colors text-xs flex items-center justify-center space-x-1.5"
                >
                  <Globe size={14} />
                  <span>Connect Gmail & Google Drive</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 bg-gray-950/60">
        <span className="text-xs text-emerald-400 font-medium">{statusMsg}</span>
        <div className="flex space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAll}
            className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow transition-colors flex items-center space-x-1"
          >
            <Check size={14} />
            <span>Apply Changes</span>
          </button>
        </div>
      </div>
    </div>
  );
};
