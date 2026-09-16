import { describe, it, expect, afterAll } from 'vitest';
import { BrowserService, createBrowserTools } from '../packages/browser/src/index.js';

describe('Browser Automation QA Suite', () => {
  const browserService = new BrowserService({ headless: true });
  const tools = createBrowserTools(browserService);

  const getTool = (name: string) => tools.find((t) => t.name === name)!;

  afterAll(async () => {
    await browserService.close();
  });

  it('navigates to an HTML page and extracts page title & url', async () => {
    const html = encodeURIComponent(`
      <!DOCTYPE html>
      <html>
        <head><title>Sora QA Test Page</title></head>
        <body>
          <h1>Welcome to Sora QA</h1>
          <p id="desc">Automated browser control verified.</p>
          <input id="test-input" type="text" placeholder="Type here" />
          <button id="test-btn" onclick="document.getElementById('desc').innerText = 'Clicked Successfully!'">Submit</button>
        </body>
      </html>
    `);
    const dataUrl = `data:text/html;charset=utf-8,${html}`;

    const openTool = getTool('browser_open');
    const res = await openTool.execute({ url: dataUrl });

    expect(res.success).toBe(true);
    expect((res.output as any).title).toBe('Sora QA Test Page');
  });

  it('reads page content correctly with browser_read_page', async () => {
    const readTool = getTool('browser_read_page');
    const res = await readTool.execute({});

    expect(res.success).toBe(true);
    expect((res.output as any).title).toBe('Sora QA Test Page');
    expect((res.output as any).textContent).toContain('Welcome to Sora QA');
    expect((res.output as any).textContent).toContain('Automated browser control verified.');
  });

  it('types text into input elements with browser_type', async () => {
    const typeTool = getTool('browser_type');
    const res = await typeTool.execute({
      selector: '#test-input',
      text: 'XIAO ESP32-S3 Sense',
    });

    expect(res.success).toBe(true);
    expect((res.output as any).typed).toBe('XIAO ESP32-S3 Sense');
  });

  it('clicks elements and triggers DOM updates with browser_click', async () => {
    const clickTool = getTool('browser_click');
    const res = await clickTool.execute({ selector: '#test-btn' });

    expect(res.success).toBe(true);
    expect((res.output as any).clicked).toBe('#test-btn');

    // Verify DOM updated
    const readTool = getTool('browser_read_page');
    const readRes = await readTool.execute({});
    expect((readRes.output as any).textContent).toContain('Clicked Successfully!');
  });

  it('captures screenshots in base64 format with browser_screenshot', async () => {
    const screenshotTool = getTool('browser_screenshot');
    const res = await screenshotTool.execute({});

    expect(res.success).toBe(true);
    expect((res.output as any).format).toBe('image/png;base64');
    expect((res.output as any).length).toBeGreaterThan(100);
  });

  it('gracefully closes the browser with browser_close', async () => {
    const closeTool = getTool('browser_close');
    const res = await closeTool.execute({});

    expect(res.success).toBe(true);
    expect((res.output as any).status).toBe('closed');
  });
});
