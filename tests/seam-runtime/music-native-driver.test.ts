import { createNativeMusicPlayerDriver } from '@/core/capabilities/music/music-player';

const created: { removed: boolean }[] = [];
let releaseAudioMode: (() => void) | null = null;

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(
    () =>
      new Promise<void>((resolve) => {
        releaseAudioMode = resolve;
      }),
  ),
  createAudioPlayer: jest.fn(() => {
    const record = { removed: false };
    created.push(record);
    return {
      addListener: () => ({ remove: () => undefined }),
      remove: () => {
        record.removed = true;
      },
      play: () => undefined,
      pause: () => undefined,
      seekTo: async () => undefined,
    };
  }),
}));

describe('Seam: native music driver load supersession', () => {
  beforeEach(() => {
    created.length = 0;
    releaseAudioMode = null;
  });

  it('does not create a native player when the driver is released while loading', async () => {
    const driver = createNativeMusicPlayerDriver();
    const loading = driver.load('file:///a.mp3', () => undefined);

    driver.release();
    releaseAudioMode?.();
    await loading;

    expect(created).toHaveLength(0);
  });

  it('does not leak the first player when a second load starts before the first resumes', async () => {
    const driver = createNativeMusicPlayerDriver();
    const first = driver.load('file:///a.mp3', () => undefined);
    const resumeFirst = releaseAudioMode;
    const second = driver.load('file:///b.mp3', () => undefined);
    const resumeSecond = releaseAudioMode;

    resumeFirst?.();
    resumeSecond?.();
    await Promise.all([first, second]);

    expect(created).toHaveLength(1);
    expect(created.every((p) => !p.removed)).toBe(true);
  });
});
