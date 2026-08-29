import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('source guards', () => {
  it('does not reintroduce the abandoned PR 2 loading-state UI copy', () => {
    const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
    const styles = readFileSync(join(process.cwd(), 'app/styles.css'), 'utf8');

    expect(page).not.toContain('Analyzing photos and job details');
    expect(page).not.toContain('Still working');
    expect(styles).not.toContain('loadingDots');
  });
});
