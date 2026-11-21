import {
  createMusicPlayer,
  type MusicDriverStatus,
  type MusicPlayerDriver,
} from '@/core/capabilities/music';

function createFakeDriver() {
  const calls: string[] = [];
  const listeners: ((status: MusicDriverStatus) => void)[] = [];
  let failLoad: Error | null = null;
  const driver: MusicPlayerDriver = {
    async load(uri, onStatus) {
      calls.push(`load:${uri}`);
      if (failLoad) {
        throw failLoad;
      }
      listeners.push(onStatus);
    },
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    seekTo: async (seconds) => {
      calls.push(`seek:${seconds}`);
    },
    release: () => calls.push('release'),
  };
  const emit = (index: number, partial: Partial<MusicDriverStatus>) =>
    listeners[index]?.({
      playing: false,
      isLoaded: true,
      positionSec: 0,
      durationSec: 100,
      didJustFinish: false,
      ...partial,
    });
  return {
    driver,
    calls,
    emit,
    setLoadFailure: (error: Error | null) => {
      failLoad = error;
    },
  };
}

const trackA = { uri: 'file:///a.mp3', name: 'a.mp3' };
const trackB = { uri: 'file:///b.mp3', name: 'b.mp3' };

describe('Seam: local music player state machine', () => {
  it('loads, starts playing and follows driver status updates', async () => {
    const fake = createFakeDriver();
    const player = createMusicPlayer(fake.driver);

    await player.loadAndPlay(trackA);
    expect(fake.calls).toEqual(['load:file:///a.mp3', 'play']);
    expect(player.store.getState().status).toBe('loading');

    fake.emit(0, { playing: true, positionSec: 12, durationSec: 200 });
    expect(player.store.getState()).toMatchObject({
      status: 'playing',
      positionSec: 12,
      durationSec: 200,
      track: trackA,
    });
  });

  it('toggles between pause and play', async () => {
    const fake = createFakeDriver();
    const player = createMusicPlayer(fake.driver);
    await player.loadAndPlay(trackA);
    fake.emit(0, { playing: true });

    player.togglePlayPause();
    fake.emit(0, { playing: false });
    expect(player.store.getState().status).toBe('paused');

    player.togglePlayPause();
    expect(fake.calls.slice(-2)).toEqual(['pause', 'play']);
  });

  it('clamps skipping into the track and ignores it when nothing is loaded', async () => {
    const fake = createFakeDriver();
    const player = createMusicPlayer(fake.driver);

    await player.skipBy(10);
    expect(fake.calls).toEqual([]);

    await player.loadAndPlay(trackA);
    fake.emit(0, { playing: true, positionSec: 95, durationSec: 100 });
    await player.skipBy(10);
    fake.emit(0, { playing: true, positionSec: 3, durationSec: 100 });
    await player.skipBy(-10);

    expect(fake.calls.filter((c) => c.startsWith('seek:'))).toEqual(['seek:100', 'seek:0']);
  });

  it('restarts from the beginning when play is pressed after the track ended', async () => {
    const fake = createFakeDriver();
    const player = createMusicPlayer(fake.driver);
    await player.loadAndPlay(trackA);

    fake.emit(0, { playing: false, didJustFinish: true, positionSec: 100 });
    expect(player.store.getState()).toMatchObject({ status: 'ended', positionSec: 100 });

    player.togglePlayPause();
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.calls.slice(-2)).toEqual(['seek:0', 'play']);
  });

  it('ignores status callbacks from a track that was replaced', async () => {
    const fake = createFakeDriver();
    const player = createMusicPlayer(fake.driver);
    await player.loadAndPlay(trackA);
    await player.loadAndPlay(trackB);

    fake.emit(0, { playing: true, positionSec: 50 });
    expect(player.store.getState()).toMatchObject({ status: 'loading', track: trackB });

    fake.emit(1, { playing: true, positionSec: 1 });
    expect(player.store.getState()).toMatchObject({ status: 'playing', track: trackB });
  });

  it('reports a load failure with the track kept so the UI can name it', async () => {
    const fake = createFakeDriver();
    fake.setLoadFailure(new Error('Unsupported format'));
    const player = createMusicPlayer(fake.driver);

    await player.loadAndPlay(trackA);

    expect(player.store.getState()).toMatchObject({
      status: 'error',
      errorMessage: 'Unsupported format',
      track: trackA,
    });
    expect(fake.calls).not.toContain('play');
  });

  it('release stops the driver, resets the state and drops late callbacks', async () => {
    const fake = createFakeDriver();
    const player = createMusicPlayer(fake.driver);
    await player.loadAndPlay(trackA);

    player.release();
    fake.emit(0, { playing: true, positionSec: 9 });

    expect(fake.calls).toContain('release');
    expect(player.store.getState()).toMatchObject({ status: 'idle', track: null, positionSec: 0 });
  });

  it('seeks relative to the position when the duration is not known yet', async () => {
    const fake = createFakeDriver();
    const player = createMusicPlayer(fake.driver);
    await player.loadAndPlay(trackA);
    fake.emit(0, { playing: true, positionSec: 30, durationSec: 0 });

    await player.skipBy(10);
    await player.skipBy(-10);

    expect(fake.calls.filter((c) => c.startsWith('seek:'))).toEqual(['seek:40', 'seek:20']);
  });

  it('does not flash the paused state before play has been issued', async () => {
    const fake = createFakeDriver();
    const seen: string[] = [];
    let player: ReturnType<typeof createMusicPlayer> | undefined;
    const driver: MusicPlayerDriver = {
      ...fake.driver,
      async load(uri, onStatus) {
        await fake.driver.load(uri, onStatus);
        // 驱动在 play() 之前就回报一次"未播放"
        onStatus({
          playing: false,
          isLoaded: true,
          positionSec: 0,
          durationSec: 80,
          didJustFinish: false,
        });
        seen.push(player?.store.getState().status ?? 'none');
      },
    };
    player = createMusicPlayer(driver);

    await player.loadAndPlay(trackA);

    expect(seen).toEqual(['loading']);
    expect(player.store.getState().durationSec).toBe(80);
  });

  it('moves to the error state when restarting an ended track fails, and ignores a double tap', async () => {
    const fake = createFakeDriver();
    let seekCount = 0;
    const failing: MusicPlayerDriver = {
      ...fake.driver,
      seekTo: async () => {
        seekCount += 1;
        throw new Error('seek failed');
      },
    };
    const player = createMusicPlayer(failing);
    await player.loadAndPlay(trackA);
    fake.emit(0, { playing: false, didJustFinish: true, positionSec: 100 });

    player.togglePlayPause();
    player.togglePlayPause();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seekCount).toBe(1);
    expect(player.store.getState()).toMatchObject({ status: 'error', errorMessage: 'seek failed' });
  });
});
