import { existsSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer';
import { AppError } from '../middleware/errors.js';

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];
const POOL_IDLE_MS = 5 * 60 * 1000;

let pooledBrowser: Browser | null = null;
let poolExpiresAt = 0;
let browserLaunch: Promise<Browser> | null = null;

function systemBrowserCandidates() {
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env['ProgramFiles(x86)'];

  return [
    programFiles ? join(programFiles, 'Google/Chrome/Application/chrome.exe') : null,
    programFilesX86 ? join(programFilesX86, 'Google/Chrome/Application/chrome.exe') : null,
    localAppData ? join(localAppData, 'Google/Chrome/Application/chrome.exe') : null,
    programFiles ? join(programFiles, 'Microsoft/Edge/Application/msedge.exe') : null,
    programFilesX86 ? join(programFilesX86, 'Microsoft/Edge/Application/msedge.exe') : null,
  ].filter((path): path is string => Boolean(path));
}

async function resolveExecutablePath(): Promise<string | undefined> {
  const configured = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (configured) {
    if (!existsSync(configured)) {
      throw new AppError(
        503,
        `PUPPETEER_EXECUTABLE_PATH points to a missing file: ${configured}`,
        'PDF_BROWSER_MISSING'
      );
    }
    return configured;
  }

  try {
    const bundled = await puppeteer.executablePath();
    if (bundled && existsSync(bundled)) return bundled;
  } catch {
    // Puppeteer's managed Chrome is not installed yet.
  }

  for (const candidate of systemBrowserCandidates()) {
    if (existsSync(candidate)) return candidate;
  }

  return undefined;
}

async function launchPdfBrowser(): Promise<Browser> {
  const executablePath = await resolveExecutablePath();

  if (!executablePath) {
    throw new AppError(
      503,
      'PDF export requires Chrome. From safe-start-api run: npx puppeteer browsers install chrome',
      'PDF_BROWSER_MISSING'
    );
  }

  return puppeteer.launch({
    headless: true,
    executablePath,
    args: LAUNCH_ARGS,
  });
}

function touchPoolExpiry() {
  poolExpiresAt = Date.now() + POOL_IDLE_MS;
}

function isPooledBrowserUsable() {
  return Boolean(pooledBrowser?.connected && Date.now() < poolExpiresAt);
}

/** Reuse a warm headless browser between PDF exports (idle timeout 5 min). */
export async function acquirePdfBrowser(): Promise<Browser> {
  if (isPooledBrowserUsable()) {
    touchPoolExpiry();
    return pooledBrowser!;
  }

  if (pooledBrowser) {
    await pooledBrowser.close().catch(() => {});
    pooledBrowser = null;
  }

  if (!browserLaunch) {
    browserLaunch = launchPdfBrowser()
      .then((browser) => {
        pooledBrowser = browser;
        touchPoolExpiry();
        browserLaunch = null;
        return browser;
      })
      .catch((err) => {
        browserLaunch = null;
        throw err;
      });
  }

  return browserLaunch;
}

/** Keep the pooled browser alive for the idle window after a PDF finishes. */
export function releasePdfBrowser() {
  if (pooledBrowser?.connected) {
    touchPoolExpiry();
  }
}

export async function closePdfBrowserPool() {
  browserLaunch = null;
  if (!pooledBrowser) return;
  await pooledBrowser.close().catch(() => {});
  pooledBrowser = null;
  poolExpiresAt = 0;
}

export async function renderPdfFromHtml(html: string) {
  const browser = await acquirePdfBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '16mm', bottom: '20mm', left: '16mm' },
    });
  } finally {
    await page.close().catch(() => {});
    releasePdfBrowser();
  }
}
