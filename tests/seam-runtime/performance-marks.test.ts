import { createRingBufferLogger } from '@/core/observability/observability';
import { createPerformanceMarks } from '@/core/observability/performance-marks';

describe('Seam: lightweight performance marks', () => {
  it('records marks from process start, measures between them and keeps the first occurrence', () => {
    let clock = 120;
    const marks = createPerformanceMarks({ now: () => clock });

    expect(marks.mark('runtime:created')).toBe(120);
    clock = 480;
    expect(marks.mark('first-interactive')).toBe(480);
    clock = 900;
    expect(marks.mark('first-interactive')).toBe(480);

    expect(marks.measure('runtime:created', 'first-interactive')).toBe(360);
    expect(marks.measure('runtime:created')).toBe(780);
    expect(marks.measure('missing')).toBeNull();
    expect(marks.measure('runtime:created', 'missing')).toBeNull();
    expect(marks.getMarks()).toEqual({ 'runtime:created': 120, 'first-interactive': 480 });
  });

  it('writes marks only to the in-memory logger and never needs one', () => {
    const logger = createRingBufferLogger({ maxEntries: 10 });
    createPerformanceMarks({ logger, now: () => 5 }).mark('boot');
    expect(logger.getRecentEntries().map((entry) => entry.message)).toEqual(['[perf] boot @5ms']);

    expect(() => createPerformanceMarks({ now: () => 5 }).mark('boot')).not.toThrow();
  });
});
