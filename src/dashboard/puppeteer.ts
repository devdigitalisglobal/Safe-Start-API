import { existsSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer';
import { AppError } from '../middleware/errors.js';

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];

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

/** Launch headless Chrome/Edge for dashboard PDF rendering. */
export async function launchPdfBrowser(): Promise<Browser> {
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
