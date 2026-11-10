import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from '../src/store.js';

test('the memory round-trips through the file', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hq-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new JsonStore(join(dir, 'sub', 'state.json'));
  assert.deepEqual(await store.load(), {});
  await store.save({ fired: { a: 1 } });
  assert.deepEqual(await store.load(), { fired: { a: 1 } });
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'sub', 'state.json'), 'utf8')), {
    fired: { a: 1 },
  });
});

test('a corrupted or unwritable memory is never fatal', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hq-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'state.json');
  await writeFile(file, '{ half a document');
  assert.deepEqual(await new JsonStore(file).load(), {});
  // A directory where the file should be: the write fails, quietly.
  const blocked = new JsonStore(dir);
  await blocked.save({ x: 1 });
  assert.equal(blocked.warned, true);
});
