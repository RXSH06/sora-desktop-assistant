import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
  createFolderTool,
  getFileInfoTool,
  searchFilesTool,
  readFileTool,
  copyFileTool,
  renameFileTool,
  deleteFileTool,
} from '../packages/tools/src/index.js';

describe('Filesystem Tools', () => {
  const testDir = path.join(os.tmpdir(), `nova_fs_test_${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('creates folders recursively', async () => {
    const subFolder = path.join(testDir, 'nested', 'project');
    const res = await createFolderTool.execute({ path: subFolder });
    expect(res.success).toBe(true);
    expect(fs.existsSync(subFolder)).toBe(true);
  });

  it('reads file content and inspects metadata', async () => {
    const filePath = path.join(testDir, 'sample.txt');
    fs.writeFileSync(filePath, 'Hello Nova AI Assistant!', 'utf-8');

    const readRes = await readFileTool.execute({ path: filePath });
    expect(readRes.success).toBe(true);
    expect((readRes.output as any).content).toBe('Hello Nova AI Assistant!');

    const infoRes = await getFileInfoTool.execute({ path: filePath });
    expect(infoRes.success).toBe(true);
    expect((infoRes.output as any).sizeBytes).toBeGreaterThan(0);
  });

  it('searches for files by query substring', async () => {
    const esp32File = path.join(testDir, 'esp32_firmware.bin');
    fs.writeFileSync(esp32File, 'firmware data', 'utf-8');

    const searchRes = await searchFilesTool.execute({
      query: 'esp32',
      directory: testDir,
    });
    expect(searchRes.success).toBe(true);
    expect((searchRes.output as any).matches.length).toBeGreaterThan(0);
    expect((searchRes.output as any).matches[0].name).toBe('esp32_firmware.bin');
  });

  it('copies, renames, and deletes files safely', async () => {
    const src = path.join(testDir, 'original.txt');
    const dest = path.join(testDir, 'copied.txt');
    fs.writeFileSync(src, 'data', 'utf-8');

    // 1. Copy
    const copyRes = await copyFileTool.execute({ source: src, destination: dest });
    expect(copyRes.success).toBe(true);
    expect(fs.existsSync(dest)).toBe(true);

    // 2. Rename
    const renameRes = await renameFileTool.execute({ path: dest, newName: 'renamed.txt' });
    expect(renameRes.success).toBe(true);
    const renamedPath = path.join(testDir, 'renamed.txt');
    expect(fs.existsSync(renamedPath)).toBe(true);

    // 3. Delete
    const deleteRes = await deleteFileTool.execute({ path: renamedPath });
    expect(deleteRes.success).toBe(true);
    expect(fs.existsSync(renamedPath)).toBe(false);
  });

  it('refuses to delete critical system paths', async () => {
    const deleteRes = await deleteFileTool.execute({ path: '/' });
    expect(deleteRes.success).toBe(false);
    expect(deleteRes.error).toContain('Safety Violation');
  });
});
