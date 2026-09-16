export type PermissionLevel = 'SAFE' | 'CONFIRM' | 'RESTRICTED' | 'BLOCKED';

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  toolName: string;
  parameters: Record<string, unknown>;
  permissionLevel: PermissionLevel;
  status: 'APPROVED' | 'DENIED' | 'AUTO_APPROVED' | 'BLOCKED' | 'FAILED' | 'EMERGENCY_ABORTED';
  reason?: string;
}

export interface PermissionPolicy {
  toolName: string;
  level: PermissionLevel;
  description: string;
}

export interface PermissionManagerConfig {
  defaultLevel?: PermissionLevel;
  customPolicies?: Record<string, PermissionLevel>;
  allowSessionBypass?: boolean;
}

export interface PermissionManager {
  checkPermission(
    toolName: string,
    params: Record<string, unknown>,
    description: string
  ): Promise<{ allowed: boolean; reason?: string }>;
  getToolLevel(toolName: string): PermissionLevel;
  setToolLevel(toolName: string, level: PermissionLevel): void;
  getAllPolicies(): PermissionPolicy[];
  getAuditLogs(limit?: number): AuditLogEntry[];
  recordAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void;
  triggerEmergencyStop(): void;
  isEmergencyStopped(): boolean;
  resetEmergencyStop(): void;
}
