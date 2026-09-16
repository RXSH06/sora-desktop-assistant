import {
  PermissionLevel,
  AuditLogEntry,
  PermissionPolicy,
  PermissionManagerConfig,
  PermissionManager,
} from './types.js';

export type ConfirmationHandler = (
  id: string,
  toolName: string,
  description: string,
  params: Record<string, unknown>
) => Promise<boolean>;

const DEFAULT_TOOL_POLICIES: Record<string, { level: PermissionLevel; description: string }> = {
  // Filesystem Tools
  search_files: { level: 'SAFE', description: 'Search files and folders on the filesystem' },
  read_file: { level: 'SAFE', description: 'Read text or metadata of a file' },
  get_file_info: { level: 'SAFE', description: 'Inspect file attributes and metadata' },
  copy_file: { level: 'CONFIRM', description: 'Copy a file or directory to another path' },
  move_file: { level: 'CONFIRM', description: 'Move a file or directory to another path' },
  rename_file: { level: 'CONFIRM', description: 'Rename a file or directory' },
  delete_file: { level: 'CONFIRM', description: 'Delete a file or directory' },
  create_folder: { level: 'CONFIRM', description: 'Create a new folder' },

  // Application Control
  open_application: { level: 'SAFE', description: 'Launch a safe desktop application' },
  close_application: { level: 'CONFIRM', description: 'Terminate a running application' },
  focus_application: { level: 'SAFE', description: 'Focus a running application window' },
  list_running_applications: { level: 'SAFE', description: 'List currently open user applications' },

  // Clipboard
  get_clipboard: { level: 'SAFE', description: 'Read current clipboard content' },
  set_clipboard: { level: 'CONFIRM', description: 'Write content to clipboard' },

  // Browser Automation
  browser_open: { level: 'SAFE', description: 'Launch browser navigation' },
  browser_search: { level: 'SAFE', description: 'Search the web using browser' },
  browser_read_page: { level: 'SAFE', description: 'Extract page text and title' },
  browser_screenshot: { level: 'SAFE', description: 'Capture screenshot of web page' },
  browser_go_back: { level: 'SAFE', description: 'Navigate backward in browser' },
  browser_close: { level: 'SAFE', description: 'Close active browser instance' },
  browser_click: { level: 'CONFIRM', description: 'Click an element on the webpage' },
  browser_type: { level: 'CONFIRM', description: 'Type text into a webpage input' },

  // Gmail
  search_email: { level: 'SAFE', description: 'Search emails in Gmail inbox' },
  read_email: { level: 'SAFE', description: 'Read email content' },
  list_email_attachments: { level: 'SAFE', description: 'List email attachments' },
  download_email_attachment: { level: 'CONFIRM', description: 'Download attachment to disk' },
  create_email_draft: { level: 'CONFIRM', description: 'Create a draft email in Gmail' },
  send_email: { level: 'CONFIRM', description: 'Send an email directly via Gmail' },

  // Google Drive
  drive_search: { level: 'SAFE', description: 'Search Google Drive files' },
  drive_download: { level: 'CONFIRM', description: 'Download file from Drive to local disk' },
  drive_upload: { level: 'CONFIRM', description: 'Upload local file to Drive' },
  drive_create_folder: { level: 'CONFIRM', description: 'Create folder in Drive' },
  drive_move: { level: 'CONFIRM', description: 'Move file in Drive' },
  drive_copy: { level: 'CONFIRM', description: 'Copy file in Drive' },

  // Computer Control (OS Automation)
  screenshot: { level: 'SAFE', description: 'Take a desktop screenshot' },
  mouse_move: { level: 'RESTRICTED', description: 'Move mouse cursor on desktop' },
  mouse_click: { level: 'CONFIRM', description: 'Click mouse at coordinates' },
  mouse_double_click: { level: 'CONFIRM', description: 'Double click mouse at coordinates' },
  keyboard_type: { level: 'CONFIRM', description: 'Type keystrokes on active window' },
  keyboard_press: { level: 'CONFIRM', description: 'Press specific keyboard keys' },
  scroll: { level: 'CONFIRM', description: 'Scroll window' },

  // Destructive / Blocked
  execute_shell_command: { level: 'BLOCKED', description: 'Unrestricted shell command execution' },
  modify_security_settings: { level: 'BLOCKED', description: 'Modify system security/passwords' },
};

export class DefaultPermissionManager implements PermissionManager {
  private policies: Map<string, { level: PermissionLevel; description: string }> = new Map();
  private auditLogs: AuditLogEntry[] = [];
  private emergencyStopped: boolean = false;
  private confirmationHandler?: ConfirmationHandler;
  private sessionApprovals: Set<string> = new Set();

  constructor(
    config?: PermissionManagerConfig,
    confirmationHandler?: ConfirmationHandler
  ) {
    this.confirmationHandler = confirmationHandler;

    // Load defaults
    for (const [tool, val] of Object.entries(DEFAULT_TOOL_POLICIES)) {
      this.policies.set(tool, { ...val });
    }

    // Apply custom overrides
    if (config?.customPolicies) {
      for (const [tool, level] of Object.entries(config.customPolicies)) {
        const existing = this.policies.get(tool);
        this.policies.set(tool, {
          level,
          description: existing?.description || `Custom policy for ${tool}`,
        });
      }
    }
  }

  setConfirmationHandler(handler: ConfirmationHandler): void {
    this.confirmationHandler = handler;
  }

  getToolLevel(toolName: string): PermissionLevel {
    return this.policies.get(toolName)?.level || 'CONFIRM';
  }

  setToolLevel(toolName: string, level: PermissionLevel): void {
    const existing = this.policies.get(toolName);
    this.policies.set(toolName, {
      level,
      description: existing?.description || `Policy for ${toolName}`,
    });
  }

  getAllPolicies(): PermissionPolicy[] {
    return Array.from(this.policies.entries()).map(([toolName, val]) => ({
      toolName,
      level: val.level,
      description: val.description,
    }));
  }

  triggerEmergencyStop(): void {
    this.emergencyStopped = true;
    this.recordAudit({
      toolName: 'system',
      parameters: { action: 'EMERGENCY_STOP' },
      permissionLevel: 'BLOCKED',
      status: 'EMERGENCY_ABORTED',
      reason: 'User or system triggered emergency stop (Ctrl+Shift+Esc)',
    });
  }

  isEmergencyStopped(): boolean {
    return this.emergencyStopped;
  }

  resetEmergencyStop(): void {
    this.emergencyStopped = false;
  }

  async checkPermission(
    toolName: string,
    params: Record<string, unknown>,
    description: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (this.emergencyStopped) {
      this.recordAudit({
        toolName,
        parameters: params,
        permissionLevel: 'BLOCKED',
        status: 'EMERGENCY_ABORTED',
        reason: 'Execution blocked due to active Emergency Stop',
      });
      return { allowed: false, reason: 'Assistant is in Emergency Stop state. Reset before continuing.' };
    }

    const level = this.getToolLevel(toolName);

    if (level === 'BLOCKED') {
      const reason = `Tool '${toolName}' is permanently BLOCKED by security policy.`;
      this.recordAudit({
        toolName,
        parameters: params,
        permissionLevel: 'BLOCKED',
        status: 'BLOCKED',
        reason,
      });
      return { allowed: false, reason };
    }

    if (level === 'SAFE') {
      this.recordAudit({
        toolName,
        parameters: params,
        permissionLevel: 'SAFE',
        status: 'AUTO_APPROVED',
      });
      return { allowed: true };
    }

    // Check if previously approved in session
    const sessionKey = `${toolName}:${JSON.stringify(params)}`;
    if (this.sessionApprovals.has(sessionKey)) {
      this.recordAudit({
        toolName,
        parameters: params,
        permissionLevel: level,
        status: 'APPROVED',
        reason: 'Session-cached user approval',
      });
      return { allowed: true };
    }

    // CONFIRM or RESTRICTED requires explicit user authorization
    if (!this.confirmationHandler) {
      const reason = `Confirmation required for '${toolName}' but no confirmation handler registered.`;
      this.recordAudit({
        toolName,
        parameters: params,
        permissionLevel: level,
        status: 'DENIED',
        reason,
      });
      return { allowed: false, reason };
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const approved = await this.confirmationHandler(
      requestId,
      toolName,
      description,
      params
    );

    if (approved) {
      this.recordAudit({
        toolName,
        parameters: params,
        permissionLevel: level,
        status: 'APPROVED',
        reason: 'Explicitly approved by user',
      });
      return { allowed: true };
    } else {
      this.recordAudit({
        toolName,
        parameters: params,
        permissionLevel: level,
        status: 'DENIED',
        reason: 'Denied by user',
      });
      return { allowed: false, reason: 'Action denied by user.' };
    }
  }

  recordAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    const log: AuditLogEntry = {
      ...entry,
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };
    this.auditLogs.unshift(log);
    if (this.auditLogs.length > 500) {
      this.auditLogs.pop();
    }
  }

  getAuditLogs(limit: number = 50): AuditLogEntry[] {
    return this.auditLogs.slice(0, limit);
  }
}
