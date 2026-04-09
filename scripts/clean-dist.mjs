/**
 * Remove files from dist/ that exceed Cloudflare Workers' 25 MB asset limit.
 * Large binaries are hosted externally and should not be deployed to Workers.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');
const publicDir = path.resolve(__dirname, '..', 'public');
const MAX_SIZE = 25 * 1024 * 1024;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

const files = await walk(distDir);
let removed = 0;

for (const file of files) {
  const stat = await fs.stat(file);
  if (stat.size > MAX_SIZE) {
    await fs.rm(file);
    const rel = path.relative(distDir, file);
    const mb = (stat.size / 1024 / 1024).toFixed(1);
    console.log(`[clean-dist] removed ${rel} (${mb} MB)`);
    removed++;
  }
}

async function pruneEmpty(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await pruneEmpty(path.join(dir, entry.name));
    }
  }

  const after = await fs.readdir(dir);
  if (after.length === 0 && dir !== distDir) {
    await fs.rmdir(dir);
  }
}

await pruneEmpty(distDir);
await fs.copyFile(path.join(publicDir, '_headers'), path.join(distDir, '_headers'));

console.log(`[clean-dist] done — ${removed} file(s) removed`);
