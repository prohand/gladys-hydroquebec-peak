// -----------------------------------------------------------------------------
// A small JSON memory under /data.
//
// The container rootfs is read-only: /data is the one writable volume, and it
// survives restarts and updates. The integration keeps there which peaks it
// already announced and which transitions it already fired, so a restart does
// not announce the whole winter again.
//
// Losing it is never fatal: a missing, unreadable or unwritable file only
// means the memory starts empty (and stays in RAM). Writes go to a temporary
// file renamed over the real one, so a container killed mid-write leaves the
// previous memory, never half a JSON document.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

/** Where the memory lives: /data in the container, overridable for local runs. */
export const DEFAULT_STATE_FILE = join(process.env.DATA_DIR ?? '/data', 'state.json');

export class JsonStore {
  /**
   * @param {string} [file]
   */
  constructor(file = DEFAULT_STATE_FILE) {
    this.file = file;
    this.warned = false;
  }

  /** @returns {Promise<object>} the saved object, `{}` when there is none */
  async load() {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        logger.warn(`Memory ${this.file} unreadable, starting empty: ${err.message}`);
      }
      return {};
    }
  }

  /** @param {object} data */
  async save(data) {
    const temporary = `${this.file}.tmp`;
    try {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(temporary, JSON.stringify(data));
      await rename(temporary, this.file);
      this.warned = false;
    } catch (err) {
      // Once per failure streak: a read-only /data would otherwise log every minute.
      if (!this.warned) {
        logger.warn(`Memory ${this.file} not saved (kept in memory only): ${err.message}`);
        this.warned = true;
      }
    }
  }
}

/** A store that keeps nothing: tests, and runs that must not touch the disk. */
export class MemoryStore {
  constructor(initial = {}) {
    this.data = structuredClone(initial);
  }

  async load() {
    return structuredClone(this.data);
  }

  async save(data) {
    this.data = structuredClone(data);
  }
}
