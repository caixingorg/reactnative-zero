/**
 * @module core/capabilities/music/music-player
 * 职责：本地音乐播放的状态机（加载、播放、暂停、跳转、播放结束、出错），与具体音频库解耦。
 * 边界：只负责播放；蓝牙音响由系统连接，声音会自动走系统当前的输出设备，本模块不扫描、不配对、不读取输出设备名。
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

export type MusicStatus = 'idle' | 'loading' | 'paused' | 'playing' | 'ended' | 'error';

export interface MusicTrack {
  uri: string;
  name: string;
}

export interface MusicState {
  status: MusicStatus;
  track: MusicTrack | null;
  positionSec: number;
  durationSec: number;
  errorMessage: string | null;
}

/** 驱动层向状态机汇报的原始播放状态 */
export interface MusicDriverStatus {
  playing: boolean;
  isLoaded: boolean;
  positionSec: number;
  durationSec: number;
  didJustFinish: boolean;
}

export interface MusicPlayerDriver {
  /** 加载并准备播放；之后每次状态变化都通过 onStatus 回调，替换曲目时旧回调不再触发 */
  load(uri: string, onStatus: (status: MusicDriverStatus) => void): Promise<void>;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  release(): void;
}

export interface MusicPlayer {
  readonly store: StoreApi<MusicState>;
  loadAndPlay(track: MusicTrack): Promise<void>;
  togglePlayPause(): void;
  skipBy(deltaSec: number): Promise<void>;
  release(): void;
}

const INITIAL_STATE: MusicState = {
  status: 'idle',
  track: null,
  positionSec: 0,
  durationSec: 0,
  errorMessage: null,
};

export function createMusicPlayer(driver: MusicPlayerDriver): MusicPlayer {
  const store = createStore<MusicState>(() => INITIAL_STATE);
  // 原因：连续选择多首歌时，慢返回的旧曲目回调不能覆盖新曲目的状态，用代数号丢弃过期回调
  let generation = 0;
  // 原因：驱动在 play() 之前就会回报一次"未播放"，此时不能把界面切到"已暂停"，否则播放按钮会闪一下
  let playIssued = false;

  function applyDriverStatus(token: number, status: MusicDriverStatus): void {
    if (token !== generation) {
      return;
    }
    store.setState((prev) => {
      if (prev.status === 'error' || !status.isLoaded) {
        return prev;
      }
      if (prev.status === 'loading' && !playIssued && !status.playing && !status.didJustFinish) {
        return { ...prev, durationSec: status.durationSec };
      }
      let nextStatus: MusicStatus = status.playing ? 'playing' : 'paused';
      if (status.didJustFinish) {
        nextStatus = 'ended';
      } else if (prev.status === 'ended' && !status.playing) {
        nextStatus = 'ended';
      }
      return {
        ...prev,
        status: nextStatus,
        positionSec: status.didJustFinish ? status.durationSec : status.positionSec,
        durationSec: status.durationSec,
      };
    });
  }

  return {
    store,

    async loadAndPlay(track) {
      generation += 1;
      const token = generation;
      playIssued = false;
      store.setState({ ...INITIAL_STATE, status: 'loading', track });
      try {
        await driver.load(track.uri, (status) => applyDriverStatus(token, status));
        if (token !== generation) {
          return;
        }
        playIssued = true;
        driver.play();
      } catch (error) {
        if (token !== generation) {
          return;
        }
        store.setState({
          ...INITIAL_STATE,
          status: 'error',
          track,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    },

    togglePlayPause() {
      const { status } = store.getState();
      if (status === 'playing') {
        driver.pause();
      } else if (status === 'paused') {
        driver.play();
      } else if (status === 'ended') {
        // 原因：播放结束后再点播放应从头开始；先切到暂停态避免连点触发两次跳转，跳转失败要进入出错态而不是未处理的异常
        const token = generation;
        store.setState((prev) => ({ ...prev, status: 'paused', positionSec: 0 }));
        driver
          .seekTo(0)
          .then(() => {
            if (token === generation) {
              driver.play();
            }
          })
          .catch((error: unknown) => {
            if (token === generation) {
              store.setState((prev) => ({
                ...prev,
                status: 'error',
                errorMessage: error instanceof Error ? error.message : String(error),
              }));
            }
          });
      }
    },

    async skipBy(deltaSec) {
      const { status, positionSec, durationSec } = store.getState();
      if (status !== 'playing' && status !== 'paused') {
        return;
      }
      // 原因：时长未知（为 0）时不能把上界当成 0，否则前进和后退都会跳到开头
      const upper = durationSec > 0 ? durationSec : Number.POSITIVE_INFINITY;
      const target = Math.min(Math.max(positionSec + deltaSec, 0), upper);
      await driver.seekTo(target);
    },

    release() {
      generation += 1;
      driver.release();
      store.setState(INITIAL_STATE);
    },
  };
}

export function createNativeMusicPlayerDriver(): MusicPlayerDriver {
  let player: import('expo-audio').AudioPlayer | null = null;
  let subscription: { remove(): void } | null = null;
  let loadToken = 0;

  function dispose(): void {
    subscription?.remove();
    subscription = null;
    player?.remove();
    player = null;
  }

  return {
    async load(uri, onStatus) {
      const Audio = require('expo-audio') as typeof import('expo-audio');
      loadToken += 1;
      const token = loadToken;
      dispose();
      // 原因：iOS 静音拨片打开时默认不出声，音乐播放必须显式允许；后台播放由模板的 backgroundAudio 开关与原生配置决定，这里不强开
      await Audio.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' });
      // 原因：等待期间如果又加载了别的曲目或已释放，就不能再创建播放器，否则原生对象泄漏
      if (token !== loadToken) {
        return;
      }
      const next = Audio.createAudioPlayer(uri, { updateInterval: 500 });
      player = next;
      subscription = next.addListener('playbackStatusUpdate', (status) => {
        onStatus({
          playing: status.playing,
          isLoaded: status.isLoaded,
          positionSec: status.currentTime,
          durationSec: status.duration,
          didJustFinish: status.didJustFinish,
        });
      });
    },
    play() {
      player?.play();
    },
    pause() {
      player?.pause();
    },
    async seekTo(seconds) {
      await player?.seekTo(seconds);
    },
    release() {
      loadToken += 1;
      dispose();
    },
  };
}
