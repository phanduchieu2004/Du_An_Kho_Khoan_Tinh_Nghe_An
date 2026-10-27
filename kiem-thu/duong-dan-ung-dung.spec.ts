import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getProjectRoot } from '../src/tien-ich/duong-dan-ung-dung.js';

describe('getProjectRoot', () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(testDirectory, '..');

  it.each(['src', 'dist'])('resolves the project root from %s', (directory) => {
    const moduleUrl = pathToFileURL(
      resolve(projectRoot, directory, 'main.js'),
    ).href;

    expect(getProjectRoot(moduleUrl)).toBe(projectRoot);
  });
});
