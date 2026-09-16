import React, { useState, useEffect } from 'react';
import { History, X, Activity, CheckCircle, AlertTriangle, ShieldX } from 'lucide-react';
import { AuditLogEntry } from '@assistant/permissions';
import { getAssistantAPI } from '../api.js';

const api = getAssistantAPI();

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
      const interval = setInterval(loadLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const loadLogs = async () => {
    try {
      const audit = await api.getAuditLogs();
      setLogs(audit);
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <div className="w-[420px] max-h-[580px] bg-gray-900/98 border border-gray-700 text-gray-200 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden animate-fadeIn app-no-drag">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/50">
        <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-sm">
          <Activity size={16} />
          <span>Activity & Tool Audit Log</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
        {logs.length === 0 ? (
          <div className="text-center text-gray-500 py-12 italic">
            No tool actions recorded yet.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="bg-gray-950/40 p-2.5 rounded-lg border border-gray-800/80 hover:border-gray-700 transition-colors space-y-1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  {log.status === 'APPROVED' || log.status === 'AUTO_APPROVED' ? (
                    <CheckCircle size={13} className="text-emerald-400" />
                  ) : log.status === 'DENIED' || log.status === 'BLOCKED' ? (
                    <ShieldX size={13} className="text-rose-400" />
                  ) : (
                    <AlertTriangle size={13} className="text-amber-400" />
                  )}
                  <span className="font-mono text-gray-200 font-semibold">{log.toolName}</span>
                </div>
                <span className="text-[10px] text-gray-500">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-400">
                  Level: <code className="text-indigo-300 font-mono">{log.permissionLevel}</code>
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    log.status === 'APPROVED' || log.status === 'AUTO_APPROVED'
                      ? 'bg-emerald-950/70 text-emerald-300'
                      : log.status === 'DENIED'
                      ? 'bg-rose-950/70 text-rose-300'
                      : 'bg-amber-950/70 text-amber-300'
                  }`}
                >
                  {log.status}
                </span>
              </div>

              {log.reason && (
                <div className="text-[10px] text-gray-500 italic">
                  Note: {log.reason}
                </div>
              )}

              {log.parameters && Object.keys(log.parameters).length > 0 && (
                <pre className="text-[10px] font-mono text-gray-400 bg-gray-900/60 p-1.5 rounded overflow-x-auto">
                  {JSON.stringify(log.parameters)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
