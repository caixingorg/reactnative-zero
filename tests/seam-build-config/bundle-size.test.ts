import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareBundleSize, parseBaseline } from '@root/scripts/lib/bundle-size-core';

describe('Seam: bundle size guard', () => {
  const baseline = { androidHermesBytes: 1_000_000, thresholdPercent: 5 };

  it('passes up to the threshold and fails beyond it', () => {
    expect(compareBundleSize(1_000_000, baseline)).toMatchObject({ ok: true, deltaBytes: 0 });
    expect(compareBundleSize(1_050_000, baseline).ok).toBe(true);
    const over = compareBundleSize(1_050_001, baseline);
    expect(over.ok).toBe(false);
    expect(over.deltaPercent).toBe(5);
    expect(compareBundleSize(900_000, baseline)).toMatchObject({ ok: true, deltaBytes: -100_000 });
  });

  it('fails when a large dependency is added', () => {
    expect(compareBundleSize(1_000_000 + 300_000, baseline).ok).toBe(false);
  });

  it('rejects a malformed baseline and accepts the committed one', () => {
    for (const bad of [
      null,
      {},
      { androidHermesBytes: 0, thresholdPercent: 5 },
      { androidHermesBytes: 10.5, thresholdPercent: 5 },
      { androidHermesBytes: 10, thresholdPercent: 0 },
    ]) {
      expect(() => parseBaseline(bad)).toThrow(/Invalid bundle size baseline/);
    }
    const committed = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'config', 'bundle-size-baseline.json'), 'utf8'),
    ) as unknown;
    expect(parseBaseline(committed).thresholdPercent).toBe(5);
  });
});
