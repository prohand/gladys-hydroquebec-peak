import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-hydroquebec-peak';

test('the first release moves Unreleased under its version', () => {
  const before = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Peaks.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const after = rollChangelog(before, '1.0.1', '2026-11-12');
  assert.match(after, /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-11-12\n\n### Added\n\n- Peaks\./);
  assert.match(after, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.1\\.\\.\\.HEAD`));
  assert.match(after, new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/releases/tag/v1\\.0\\.1`));
});

test('an empty Unreleased still names the release', () => {
  const after = rollChangelog('## [Unreleased]\n', '1.0.2', '2026-11-13');
  assert.match(after, /## \[1\.0\.2\] - 2026-11-13\n\n- Maintenance release/);
});

test('the changelog of this repository can be rolled', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(text, /^## \[Unreleased\]$/m);
  assert.match(text, new RegExp(`^\\[Unreleased\\]: ${REPO}/commits/main$`, 'm'));
  assert.notEqual(rollChangelog(text, '1.0.1', '2026-11-12'), text);
});
