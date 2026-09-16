import { PermissionLevel } from '@assistant/permissions';

export interface ToolParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
  permissionLevel: PermissionLevel;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: string;
}

export interface AgentContext {
  cwd?: string;
  resolvePath?: (p: string) => string;
  signal?: AbortSignal;
}

export interface AssistantTool extends ToolDefinition {
  execute(args: Record<string, unknown>, context?: AgentContext): Promise<ToolResult>;
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}
