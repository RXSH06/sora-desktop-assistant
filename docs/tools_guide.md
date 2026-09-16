# Nova Assistant: Tool Registry & Developer Guide

## 1. Built-in Tools

### Filesystem
- `search_files({ query: string, directory?: string, maxResults?: number })`
- `read_file({ path: string, maxBytes?: number })`
- `copy_file({ source: string, destination: string })`
- `move_file({ source: string, destination: string })`
- `rename_file({ path: string, newName: string })`
- `delete_file({ path: string })` *(Requires CONFIRM)*
- `create_folder({ path: string })` *(Requires CONFIRM)*
- `get_file_info({ path: string })`

### Application Control
- `open_application({ appName: string, filePath?: string })`: Controlled launch through safe allowlist (VS Code, KiCad, Chrome, Firefox, Files, Terminal, Calc).
- `close_application({ appName: string })` *(Requires CONFIRM)*
- `focus_application({ appName: string })`
- `list_running_applications()`

### Browser Automation (Playwright)
- `browser_open({ url: string })`
- `browser_search({ query: string })`
- `browser_click({ selector: string })` *(Requires CONFIRM)*
- `browser_type({ selector: string, text: string })` *(Requires CONFIRM)*
- `browser_read_page()`
- `browser_screenshot()`
- `browser_go_back()`
- `browser_close()`

### Gmail & Google Drive
- `search_email({ query: string, maxResults?: number })`
- `read_email({ messageId: string })`
- `list_email_attachments({ messageId: string })`
- `download_email_attachment({ messageId, attachmentId, destinationFolder, filename })` *(Requires CONFIRM)*
- `create_email_draft({ to, subject, body })` *(Requires CONFIRM)*
- `send_email({ to, subject, body })` *(Requires CONFIRM)*
- `drive_search({ query: string, maxResults?: number })`
- `drive_download({ fileId: string, destinationPath: string })` *(Requires CONFIRM)*
- `drive_upload({ localPath: string, driveFolderId?: string })` *(Requires CONFIRM)*
- `drive_create_folder({ name: string, parentFolderId?: string })` *(Requires CONFIRM)*
- `drive_move({ fileId, newParentFolderId })` *(Requires CONFIRM)*
- `drive_copy({ fileId, newName? })` *(Requires CONFIRM)*

### Clipboard & Computer Control
- `get_clipboard()`
- `set_clipboard({ text: string })` *(Requires CONFIRM)*
- `screenshot({ outputPath?: string })`
- `mouse_move({ x: number, y: number })` *(RESTRICTED)*
- `mouse_click({ button?: string, x?: number, y?: number })` *(Requires CONFIRM)*
- `mouse_double_click({ x?: number, y?: number })` *(Requires CONFIRM)*
- `keyboard_type({ text: string, delayMs?: number })` *(Requires CONFIRM)*
- `keyboard_press({ key: string })` *(Requires CONFIRM)*
- `scroll({ direction: 'up' | 'down', clicks?: number })` *(Requires CONFIRM)*

---

## 2. Adding a New Custom Tool

To add a new tool to Nova Assistant, implement the `AssistantTool` interface:

```typescript
import { AssistantTool, ToolResult } from '@assistant/tools';

export const myCustomTool: AssistantTool = {
  name: 'my_custom_tool',
  description: 'Explain what this tool does so Gemini can choose it intelligently',
  permissionLevel: 'CONFIRM', // or 'SAFE', 'RESTRICTED', 'BLOCKED'
  parameters: {
    type: 'object',
    properties: {
      parameterOne: { type: 'string', description: 'Description of parameter' },
    },
    required: ['parameterOne'],
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const val = String(args.parameterOne);
      // Perform operation
      return { success: true, output: { result: `Processed ${val}` } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};
```

Register it in `toolRegistry.register(myCustomTool)` inside `apps/desktop/src/main/index.ts`.
The tool is automatically declared to Gemini Live, rendered in the permissions configuration table, and subjected to audit logging and user approval dialogs.
