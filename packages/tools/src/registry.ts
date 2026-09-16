import { PermissionManager } from '@assistant/permissions';
import { AssistantTool, ToolResult, AgentContext, GeminiFunctionDeclaration } from './types.js';
import { filesystemTools } from './filesystem.js';
import { applicationTools } from './applications.js';
import { clipboardTools } from './clipboard.js';
import { computerTools } from './computer.js';

export class ToolRegistry {
  private tools: Map<string, AssistantTool> = new Map();
  private permissionManager: PermissionManager;

  constructor(permissionManager: PermissionManager) {
    this.permissionManager = permissionManager;
    this.registerDefaults();
  }

  private registerDefaults(): void {
    for (const tool of filesystemTools) {
      this.register(tool);
    }
    for (const tool of applicationTools) {
      this.register(tool);
    }
    for (const tool of clipboardTools) {
      this.register(tool);
    }
    for (const tool of computerTools) {
      this.register(tool);
    }
  }

  register(tool: AssistantTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AssistantTool | undefined {
    return this.tools.get(name);
  }

  getAll(): AssistantTool[] {
    return Array.from(this.tools.values());
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    context?: AgentContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found in registry.` };
    }

    // Check permissions
    const permission = await this.permissionManager.checkPermission(
      name,
      args,
      tool.description
    );

    if (!permission.allowed) {
      return {
        success: false,
        error: `Permission Denied: ${permission.reason || 'Action was rejected.'}`,
      };
    }

    try {
      return await tool.execute(args, context);
    } catch (err: any) {
      return {
        success: false,
        error: `Execution error in ${name}: ${err.message || String(err)}`,
      };
    }
  }

  getGeminiFunctionDeclarations(): GeminiFunctionDeclaration[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'OBJECT',
        properties: tool.parameters.properties as Record<string, unknown>,
        required: tool.parameters.required || [],
      },
    }));
  }
}
