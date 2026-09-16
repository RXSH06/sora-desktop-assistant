import { AssistantTool, ToolResult } from '@octo/tools';
import { BrowserService } from './service.js';

export function createBrowserTools(browserService: BrowserService): AssistantTool[] {
  const browserOpenTool: AssistantTool = {
    name: 'browser_open',
    description: 'Open a webpage URL in the controlled browser',
    permissionLevel: 'SAFE',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to open' },
      },
      required: ['url'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const url = String(args.url);
        const result = await browserService.open(url);
        return { success: true, output: result };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const browserSearchTool: AssistantTool = {
    name: 'browser_search',
    description: 'Perform a web search in the browser for a given query',
    permissionLevel: 'SAFE',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query to search for on Google' },
      },
      required: ['query'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const query = String(args.query);
        const result = await browserService.search(query);
        return { success: true, output: result };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const browserClickTool: AssistantTool = {
    name: 'browser_click',
    description: 'Click an element matching a CSS or text selector on the current webpage',
    permissionLevel: 'CONFIRM',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or text (e.g. "button:has-text(\'Submit\')")' },
      },
      required: ['selector'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const selector = String(args.selector);
        const result = await browserService.click(selector);
        return { success: true, output: result };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const browserTypeTool: AssistantTool = {
    name: 'browser_type',
    description: 'Type text into an input element on the current webpage',
    permissionLevel: 'CONFIRM',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'Selector of the input element' },
        text: { type: 'string', description: 'Text string to fill in' },
      },
      required: ['selector', 'text'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const selector = String(args.selector);
        const text = String(args.text);
        const result = await browserService.type(selector, text);
        return { success: true, output: result };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const browserReadPageTool: AssistantTool = {
    name: 'browser_read_page',
    description: 'Extract and read the text content and title from the active webpage',
    permissionLevel: 'SAFE',
    parameters: {
      type: 'object',
      properties: {},
    },
    async execute(): Promise<ToolResult> {
      try {
        const result = await browserService.readPage();
        return { success: true, output: result };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const browserScreenshotTool: AssistantTool = {
    name: 'browser_screenshot',
    description: 'Capture a screenshot of the currently open webpage',
    permissionLevel: 'SAFE',
    parameters: {
      type: 'object',
      properties: {},
    },
    async execute(): Promise<ToolResult> {
      try {
        const base64 = await browserService.screenshot();
        return {
          success: true,
          output: {
            format: 'image/png;base64',
            preview: base64.slice(0, 100) + '...',
            length: base64.length,
          },
        };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const browserGoBackTool: AssistantTool = {
    name: 'browser_go_back',
    description: 'Navigate back to the previous page in history',
    permissionLevel: 'SAFE',
    parameters: {
      type: 'object',
      properties: {},
    },
    async execute(): Promise<ToolResult> {
      try {
        const result = await browserService.goBack();
        return { success: true, output: result };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  const browserCloseTool: AssistantTool = {
    name: 'browser_close',
    description: 'Close the browser instance',
    permissionLevel: 'SAFE',
    parameters: {
      type: 'object',
      properties: {},
    },
    async execute(): Promise<ToolResult> {
      try {
        await browserService.close();
        return { success: true, output: { status: 'closed' } };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };

  return [
    browserOpenTool,
    browserSearchTool,
    browserClickTool,
    browserTypeTool,
    browserReadPageTool,
    browserScreenshotTool,
    browserGoBackTool,
    browserCloseTool,
  ];
}
