import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { shouldRunAsCli } from '../src/index.js';

describe('CLI entrypoint guard', () => {
  it('runs only when imported as the executed file', () => {
    expect(shouldRunAsCli('file:///repo/dist/index.js', '/repo/dist/index.js')).toBe(true);
  });

  it('runs when npm executes the package through a symlinked bin shim', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-mcp-cli-'));

    try {
      const distDir = path.join(tempDir, 'dist');
      const binDir = path.join(tempDir, 'node_modules', '.bin');
      const targetPath = path.join(distDir, 'index.js');
      const symlinkPath = path.join(binDir, 'slack-mcp');

      fs.mkdirSync(distDir, { recursive: true });
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(targetPath, '#!/usr/bin/env node\n');
      fs.symlinkSync(targetPath, symlinkPath);

      expect(shouldRunAsCli(pathToFileURL(targetPath).href, symlinkPath)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('does not run when the module is imported by another file', () => {
    expect(shouldRunAsCli('file:///repo/dist/index.js', '/repo/dist/other.js')).toBe(false);
  });

  it('does not run when there is no argv entry', () => {
    expect(shouldRunAsCli('file:///repo/dist/index.js', undefined)).toBe(false);
  });
});
