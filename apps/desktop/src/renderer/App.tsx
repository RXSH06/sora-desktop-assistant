import React, { useState, useEffect } from 'react';
import { CharacterState, ConfirmationRequest } from '@assistant/character';
import { AppConfig } from '../shared/ipc.js';
import { Character } from './components/Character.js';
import { SpeechBubble } from './components/SpeechBubble.js';
import { ConfirmationDialog } from './components/ConfirmationDialog.js';
import { SettingsDrawer } from './components/SettingsDrawer.js';
import { HistoryDrawer } from './components/HistoryDrawer.js';
import { AudioController } from './components/AudioController.js';
import { Mic, MicOff, Settings, History, OctagonAlert, Send, Minus, GripHorizontal } from 'lucide-react';

export const App: React.FC = () => {
  const [characterState, setCharacterState] = useState<CharacterState>('IDLE');
  const [speechText, setSpeechText] = useState<string>('');
  const [statusText, setStatusText] = useState<string>('');
  const [confirmationReq, setConfirmationReq] = useState<ConfirmationRequest | null>(null);

  const [config, setConfig] = useState<AppConfig>({
    geminiApiKey: '',
    geminiModel: 'models/gemini-2.0-flash-exp',
    geminiVoice: 'Puck',
    wakeWord: 'hey nova',
    wakeWordEnabled: true,
    wakeWordSensitivity: 0.6,
    alwaysOnTop: true,
    opacity: 0.96,
    characterSize: 180,
    speechBubbleEnabled: true,
    autoStartOnBoot: false,
    googleClientId: '',
    googleClientSecret: '',
    hasGoogleAuth: false,
  });

  const [isMuted, setIsMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<'settings' | 'history' | null>(null);

  useEffect(() => {
    // Load configuration
    window.assistantAPI.getConfig().then((cfg) => {
      if (cfg) setConfig(cfg);
    });

    // Subscribe to Character Events
    const unsubChar = window.assistantAPI.onCharacterEvent((event) => {
      setCharacterState(event.state);
      if (event.type === 'speech') {
        setSpeechText(event.text || '');
      } else if (event.type === 'status') {
        setStatusText(event.statusText || '');
      }
    });

    // Subscribe to Confirmation Requests
    const unsubConf = window.assistantAPI.onConfirmationRequired((req) => {
      setConfirmationReq(req);
    });

    return () => {
      unsubChar();
      unsubConf();
    };
  }, []);

  const handleToggleDrawer = (drawer: 'settings' | 'history') => {
    const next = activeDrawer === drawer ? null : drawer;
    setActiveDrawer(next);
    window.assistantAPI.toggleDrawer(next !== null);
  };

  const handleCloseDrawers = () => {
    setActiveDrawer(null);
    window.assistantAPI.toggleDrawer(false);
  };

  const handleSendPrompt = async () => {
    if (!textInput.trim()) return;
    const prompt = textInput.trim();
    setTextInput('');
    setShowInput(false);
    await window.assistantAPI.sendPrompt(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendPrompt();
    }
  };

  const handleConfirm = async (id: string) => {
    setConfirmationReq(null);
    await window.assistantAPI.resolveConfirmation(id, true);
  };

  const handleDeny = async (id: string) => {
    setConfirmationReq(null);
    await window.assistantAPI.resolveConfirmation(id, false);
  };

  const handleSaveConfig = async (updated: Partial<AppConfig>) => {
    const newCfg = await window.assistantAPI.updateConfig(updated);
    setConfig(newCfg);
  };

  return (
    <div className="relative w-full h-full flex flex-col justify-end items-end p-2 select-none overflow-hidden font-sans">
      <AudioController isMuted={isMuted} onMicLevelChange={setMicLevel} />

      {/* Top Drag & Window Control Bar */}
      <div className="w-full flex items-center justify-between px-2 py-1 mb-1 text-gray-400 bg-gray-900/60 rounded-lg backdrop-blur-sm border border-gray-800/60 app-drag-region cursor-move">
        <div className="flex items-center space-x-1 text-[11px] font-medium tracking-wide">
          <GripHorizontal size={13} className="text-gray-500" />
          <span className="text-indigo-400 font-bold">NOVA</span>
          <span className="text-gray-500 text-[9px] uppercase">{characterState}</span>
        </div>

        <div className="flex items-center space-x-1 app-no-drag">
          <button
            onClick={() => window.assistantAPI.minimizeWindow()}
            className="p-1 hover:text-white hover:bg-gray-800 rounded transition-colors"
            title="Minimize"
          >
            <Minus size={12} />
          </button>
        </div>
      </div>

      {/* Drawers: Settings / History / Confirmation Modal */}
      {confirmationReq && (
        <div className="mb-2 z-50">
          <ConfirmationDialog
            request={confirmationReq}
            onConfirm={handleConfirm}
            onDeny={handleDeny}
          />
        </div>
      )}

      {activeDrawer === 'settings' && (
        <div className="mb-2 z-40">
          <SettingsDrawer
            config={config}
            isOpen={true}
            onClose={handleCloseDrawers}
            onSaveConfig={handleSaveConfig}
          />
        </div>
      )}

      {activeDrawer === 'history' && (
        <div className="mb-2 z-40">
          <HistoryDrawer isOpen={true} onClose={handleCloseDrawers} />
        </div>
      )}

      {/* Speech Bubble floating above character */}
      {config.speechBubbleEnabled && !confirmationReq && !activeDrawer && (
        <div className="mb-1 self-center z-30">
          <SpeechBubble
            text={speechText}
            statusText={statusText}
            visible={!!(speechText || statusText)}
            onClose={() => {
              setSpeechText('');
              setStatusText('');
            }}
          />
        </div>
      )}

      {/* Main Character Body and Controls Container */}
      <div className="flex flex-col items-center justify-center">
        <Character
          state={characterState}
          size={config.characterSize || 180}
          onClick={() => setShowInput(!showInput)}
        />

        {/* Text prompt quick input row */}
        {showInput && (
          <div className="flex items-center space-x-1 bg-gray-900/90 border border-gray-700 rounded-xl p-1 shadow-lg backdrop-blur-md mt-1 app-no-drag max-w-[280px]">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Say or type "Open Chrome", "Find ESP32"...'
              className="bg-transparent text-xs text-gray-100 placeholder-gray-500 px-2 py-1 outline-none w-full"
              autoFocus
            />
            <button
              onClick={handleSendPrompt}
              className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              title="Send"
            >
              <Send size={12} />
            </button>
          </div>
        )}

        {/* Floating Quick Action Toolbar */}
        <div className="flex items-center space-x-1.5 bg-gray-900/80 border border-gray-800 rounded-full px-3 py-1 shadow-lg backdrop-blur-md mt-2 app-no-drag">
          {/* Mute / Unmute Button */}
          <button
            onClick={() => {
              const next = !isMuted;
              setIsMuted(next);
              window.assistantAPI.setMicMuted(next);
            }}
            className={`p-1.5 rounded-full transition-colors ${
              isMuted ? 'text-rose-400 hover:bg-rose-950/50' : 'text-gray-300 hover:bg-gray-800'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
          </button>

          {/* Microphone level indicator */}
          {!isMuted && (
            <div className="w-8 h-1.5 bg-gray-800 rounded-full overflow-hidden flex items-center">
              <div
                className="h-full bg-indigo-500 transition-all duration-75 rounded-full"
                style={{ width: `${Math.round(micLevel * 100)}%` }}
              />
            </div>
          )}

          {/* Quick text input toggle button */}
          <button
            onClick={() => setShowInput(!showInput)}
            className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
              showInput ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Text
          </button>

          {/* History Drawer Toggle */}
          <button
            onClick={() => handleToggleDrawer('history')}
            className={`p-1.5 rounded-full transition-colors ${
              activeDrawer === 'history' ? 'text-indigo-400 bg-indigo-950/50' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
            title="Activity & History"
          >
            <History size={14} />
          </button>

          {/* Settings Drawer Toggle */}
          <button
            onClick={() => handleToggleDrawer('settings')}
            className={`p-1.5 rounded-full transition-colors ${
              activeDrawer === 'settings' ? 'text-indigo-400 bg-indigo-950/50' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
            title="Settings"
          >
            <Settings size={14} />
          </button>

          {/* Emergency Stop Button */}
          <button
            onClick={() => window.assistantAPI.emergencyStop()}
            className="p-1.5 text-rose-500 hover:text-rose-400 hover:bg-rose-950/60 rounded-full transition-colors"
            title="Emergency Stop (Ctrl+Shift+Esc)"
          >
            <OctagonAlert size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
