import React from 'react';
import { X } from 'lucide-react';

interface SpeechBubbleProps {
  text: string;
  statusText?: string;
  visible: boolean;
  onClose?: () => void;
}

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({
  text,
  statusText,
  visible,
  onClose,
}) => {
  if (!visible || (!text && !statusText)) return null;

  return (
    <div className="relative max-w-[280px] bg-gray-900/95 border border-indigo-500/40 text-gray-100 rounded-2xl p-3 shadow-2xl backdrop-blur-md transition-all duration-300 transform scale-100 animate-fadeIn app-no-drag">
      {/* Speech tail pointing towards character */}
      <div className="absolute -bottom-2 right-8 w-4 h-4 bg-gray-900 border-r border-b border-indigo-500/40 transform rotate-45" />

      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-1.5 right-1.5 p-1 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          title="Dismiss"
        >
          <X size={12} />
        </button>
      )}

      {/* Status indicator line if present */}
      {statusText && (
        <div className="flex items-center space-x-1.5 text-xs text-indigo-400 font-medium mb-1">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
          <span>{statusText}</span>
        </div>
      )}

      {/* Speech body text */}
      {text && (
        <div className="text-xs leading-relaxed text-gray-200 break-words max-h-36 overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  );
};
