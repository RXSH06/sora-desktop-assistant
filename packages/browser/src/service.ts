import { chromium, Browser, BrowserContext, Page } from 'playwright';

export interface BrowserConfig {
  headless?: boolean;
  viewport?: { width: number; height: number };
}

export class BrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: BrowserConfig;

  constructor(config: BrowserConfig = { headless: false, viewport: { width: 1280, height: 720 } }) {
    this.config = config;
  }

  async getPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.config.headless ?? false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }

    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: this.config.viewport || { width: 1280, height: 720 },
      });
    }

    this.page = await this.context.newPage();
    return this.page;
  }

  async open(url: string): Promise<{ title: string; url: string }> {
    const page = await this.getPage();
    const formattedUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
    await page.goto(formattedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await page.title();
    return { title, url: page.url() };
  }

  async search(query: string): Promise<{ title: string; url: string }> {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    return await this.open(searchUrl);
  }

  async click(selector: string): Promise<{ clicked: string }> {
    const page = await this.getPage();
    await page.click(selector, { timeout: 10000 });
    return { clicked: selector };
  }

  async type(selector: string, text: string): Promise<{ typed: string; selector: string }> {
    const page = await this.getPage();
    await page.fill(selector, text, { timeout: 10000 });
    return { typed: text, selector };
  }

  async readPage(): Promise<{ title: string; url: string; textContent: string }> {
    const page = await this.getPage();
    const title = await page.title();
    const url = page.url();
    const bodyText = await page.evaluate(() => {
      // Clean visible text from DOM
      const scripts = document.querySelectorAll('script, style, noscript');
      scripts.forEach((s) => s.remove());
      return document.body?.innerText || '';
    });
    // Return first 5000 characters to keep context clean
    return {
      title,
      url,
      textContent: bodyText.slice(0, 5000),
    };
  }

  async screenshot(): Promise<string> {
    const page = await this.getPage();
    const buffer = await page.screenshot({ fullPage: false });
    return buffer.toString('base64');
  }

  async goBack(): Promise<{ title: string; url: string }> {
    const page = await this.getPage();
    await page.goBack({ timeout: 10000 });
    return { title: await page.title(), url: page.url() };
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
