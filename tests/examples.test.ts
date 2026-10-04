import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateRecording } from '@webweaver/workflow-schema';

const EXAMPLES_DIR = resolve(import.meta.dirname, '../examples');

describe('example recordings', () => {
  const files = readdirSync(EXAMPLES_DIR).filter((name) => name.endsWith('.recording.json'));

  it('exist', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s is valid against the current schema', (file) => {
    const result = validateRecording(JSON.parse(readFileSync(join(EXAMPLES_DIR, file), 'utf8')));
    expect(result.valid ? [] : result.errors).toEqual([]);
  });
});
