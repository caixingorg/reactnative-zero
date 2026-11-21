import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAppRuntime } from '../../runtime';
import {
  createMusicPlayer,
  createNativeMusicPlayerDriver,
  type MusicPlayer,
  type MusicPlayerDriver,
  type MusicState,
} from './music-player';

export {
  createMusicPlayer,
  type MusicDriverStatus,
  type MusicPlayer,
  type MusicPlayerDriver,
  type MusicState,
  type MusicStatus,
  type MusicTrack,
} from './music-player';

declare module '../../runtime/app-runtime' {
  interface CapabilityOverrideMap {
    musicDriver?: MusicPlayerDriver;
  }
}

export interface MusicCapability {
  readonly enabled: boolean;
  readonly player: MusicPlayer;
  readonly state: MusicState;
}

// 原因：沿用音视频能力的 audioVideo 开关，不新增清单权限；本地文件由文件选择器提供，无需任何存储权限
export function useMusicCapability(): MusicCapability {
  const { identity, capabilityOverrides } = useAppRuntime();
  const driverOverride = capabilityOverrides?.musicDriver;

  const player = useMemo(
    () => createMusicPlayer(driverOverride ?? createNativeMusicPlayerDriver()),
    [driverOverride],
  );

  useEffect(() => () => player.release(), [player]);

  const state = useSyncExternalStore(player.store.subscribe, player.store.getState);

  return { enabled: identity.capabilities.audioVideo, player, state };
}
