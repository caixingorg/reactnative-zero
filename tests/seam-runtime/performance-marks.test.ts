import { createRingBufferLogger } from '@/core/observability/observability';
import { createPerformanceMarks } from '@/core/observability/performance-marks';

describe('Seam: lightweight performance marks', () => {
  it('records marks relative to module load, measures between them and keeps the first occurrence', () => {
    let clock = 120;
    const marks = createPerformanceMarks({ now: () => clock });

    expect(marks.mark('runtime:created')).toBe(0);
    clock = 480;
    expect(marks.mark('root-mounted')).toBe(360);
    clock = 900;
    expect(marks.mark('root-mounted')).toBe(360);

    expect(marks.measure('runtime:created', 'root-mounted')).toBe(360);
    expect(marks.measure('runtime:created')).toBe(780);
    expect(marks.measure('missing')).toBeNull();
    expect(marks.measure('runtime:created', 'missing')).toBeNull();
    expect(marks.getMarks()).toEqual({ 'runtime:created': 0, 'root-mounted': 360 });
  });

  it('writes marks only to the in-memory logger and never needs one', () => {
    const logger = createRingBufferLogger({ maxEntries: 10 });
    let clock = 100;
    const marks = createPerformanceMarks({ logger, now: () => clock });
    clock = 105;
    marks.mark('boot');
    expect(logger.getRecentEntries().map((entry) => entry.message)).toEqual(['[perf] boot @5ms']);

    expect(() => createPerformanceMarks({ now: () => 5 }).mark('boot')).not.toThrow();
  });
});
