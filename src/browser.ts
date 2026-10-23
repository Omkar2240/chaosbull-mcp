import { chromium, Browser, BrowserContext, Page } from 'playwright';

export interface WithPageOptions {
  viewport?: { width: number; height: number };
  headless?: boolean;
  keepBrowserOpen?: boolean;
  previewDelayMs?: number;
  apiHealthCheckUrl?: string;
}

let currentBrowser: Browser | null = null;
let currentHeadless: boolean | null = null;

async function checkApiHealth(url: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok && res.status >= 500) {
      throw new Error(`Server returned HTTP ${res.status} (${res.statusText})`);
    }
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      throw new Error(
        `Backend is not started or connection was refused at ${url}. Please start your local backend server before running chaos tests.`
      );
    }
    throw new Error(
      `Backend health check failed at ${url}: ${msg}. Please resolve backend errors before running chaos testing.`
    );
  }
}

async function getBrowser(headless: boolean = false): Promise<Browser> {
  if (currentBrowser && currentBrowser.isConnected()) {
    if (currentHeadless === headless) {
      return currentBrowser;
    }
    await currentBrowser.close().catch(() => null);
    currentBrowser = null;
  }

  currentBrowser = await chromium.launch({
    headless,
    args: [
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  currentHeadless = headless;
  return currentBrowser;
}

export async function withPage<T>(
  url: string,
  viewportOrOptions: { width: number; height: number } | WithPageOptions | undefined,
  setup: (page: Page) => Promise<void>,
  fn: (page: Page) => Promise<T>
): Promise<T> {
  const isDirectViewport =
    viewportOrOptions &&
    'width' in viewportOrOptions &&
    typeof viewportOrOptions.width === 'number';

  const viewport = isDirectViewport
    ? (viewportOrOptions as { width: number; height: number })
    : ((viewportOrOptions as WithPageOptions)?.viewport ?? { width: 1280, height: 720 });

  const headless = isDirectViewport
    ? process.env.CHAOSBULL_HEADLESS === 'true'
    : ((viewportOrOptions as WithPageOptions)?.headless ??
      process.env.CHAOSBULL_HEADLESS === 'true');

  const keepBrowserOpen = isDirectViewport
    ? process.env.CHAOSBULL_KEEP_OPEN === 'true'
    : ((viewportOrOptions as WithPageOptions)?.keepBrowserOpen ??
      process.env.CHAOSBULL_KEEP_OPEN === 'true');

  const apiHealthCheckUrl = !isDirectViewport
    ? (viewportOrOptions as WithPageOptions)?.apiHealthCheckUrl
    : undefined;

  if (apiHealthCheckUrl) {
    await checkApiHealth(apiHealthCheckUrl);
  }

  const browser = await getBrowser(headless);
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.bringToFront().catch(() => {});

    await setup(page);

    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (response && response.status() >= 500) {
        throw new Error(
          `Application/Backend server returned HTTP ${response.status()} at ${url}. Please fix backend server errors before running chaos tests.`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('net::ERR_CONNECTION_REFUSED')) {
        throw new Error(
          `Backend server is not running or connection was refused at ${url}. If testing locally, make sure your backend is started. If using a hosted API, verify that the service is running.`
        );
      }
      if (
        msg.includes('net::ERR_NAME_NOT_RESOLVED') ||
        msg.includes('net::ERR_CONNECTION_FAILED')
      ) {
        throw new Error(
          `Target host is unreachable at ${url}. Please verify that your hosted API or local server address is correct and operational.`
        );
      }
      throw err;
    }

    await page.bringToFront().catch(() => {});

    return await fn(page);
  } finally {
    if (!keepBrowserOpen) {
      await context?.close().catch(() => null);
    }
  }
}

export async function closeBrowser(): Promise<void> {
  if (currentBrowser) {
    const b = currentBrowser;
    currentBrowser = null;
    currentHeadless = null;
    await b.close().catch(() => null);
  }
}
