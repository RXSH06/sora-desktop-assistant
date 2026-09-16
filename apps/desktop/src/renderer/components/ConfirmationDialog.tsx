import React from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';
import { ConfirmationRequest } from '@octo/character';

interface ConfirmationDialogProps {
  request: ConfirmationRequest | null;
  onConfirm: (id: string) => void;
  onDeny: (id: string) => void;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  request,
  onConfirm,
  onDeny,
}) => {
  if (!request) return null;

  return (
    <div className="w-[320px] bg-gray-900/95 border-2 border-amber-500/70 text-gray-100 rounded-2xl p-4 shadow-2xl backdrop-blur-md animate-fadeIn app-no-drag">
      <div className="flex items-center space-x-2 text-amber-400 font-semibold text-sm mb-2">
        <ShieldAlert size={18} className="animate-pulse text-amber-400" />
        <span>Action Confirmation Required</span>
      </div>

      <div className="text-xs text-gray-300 mb-2 font-medium">
        Tool: <code className="bg-gray-800 px-1.5 py-0.5 rounded text-amber-300 font-mono">{request.toolName}</code>
      </div>

      <p className="text-xs text-gray-300 leading-relaxed mb-3">
        {request.description || 'This action requires your confirmation before proceeding.'}
      </p>

      {request.details && Object.keys(request.details).length > 0 && (
        <div className="bg-gray-950/80 rounded-lg p-2 mb-3 text-[11px] font-mono text-gray-400 max-h-24 overflow-y-auto border border-gray-800">
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(request.details, null, 2)}
          </pre>
        </div>
      )}

      <div className="flex items-center space-x-2">
        <button
          onClick={() => onConfirm(request.id)}
          className="flex-1 flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors shadow-md"
        >
          <Check size={14} />
          <span>Allow</span>
        </button>
        <button
          onClick={() => onDeny(request.id)}
          className="flex-1 flex items-center justify-center space-x-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors shadow-md"
        >
          <X size={14} />
          <span>Deny</span>
        </button>
      </div>

      <div className="text-[10px] text-gray-500 text-center mt-2">
        You can also say <span className="text-emerald-400">"Yes"</span> or <span className="text-rose-400">"No"</span>
      </div>
    </div>
  );
};
