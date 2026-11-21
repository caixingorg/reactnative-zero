import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAppRuntime } from '../../runtime';
import { useAppTheme } from '../../theme/theme-context';

export interface AudioPlaybackResult {
  playing: boolean;
  sourceUri: string;
}

export interface VideoSurfaceRenderProps {
  sourceUri: string;
  height: number;
  borderRadius: number;
  backgroundColor: string;
}

export interface AudioVideoCapabilityDriver {
  playSampleAudio(sourceUri: string): Promise<AudioPlaybackResult>;
  releaseAudio?(): void;
  renderVideoSurface?: (props: VideoSurfaceRenderProps) => React.JSX.Element;
}

declare module '../../runtime/app-runtime' {
  interface CapabilityOverrideMap {
    audioVideo?: AudioVideoCapabilityDriver;
  }
}

export interface AudioVideoCapability {
  readonly enabled: boolean;
  playSampleAudio(sourceUri?: string): Promise<AudioPlaybackResult | null>;
  releaseAudio(): void;
}

const DEFAULT_SAMPLE_AUDIO_URI = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

// 原因：复用或及时释放上一个原生 AudioPlayer 句柄，防止多次触发音频播放或组件卸载后产生底层原生句柄泄漏
function createNativeAudioVideoDriver(): AudioVideoCapabilityDriver {
  let activePlayer: { play(): void; remove(): void } | null = null;

  return {
    async playSampleAudio(sourceUri: string): Promise<AudioPlaybackResult> {
      const { createAudioPlayer } = require('expo-audio') as typeof import('expo-audio');
      activePlayer?.remove();
      const player = createAudioPlayer(sourceUri);
      activePlayer = player;
      player.play();
      return {
        playing: true,
        sourceUri,
      };
    },
    releaseAudio(): void {
      activePlayer?.remove();
      activePlayer = null;
    },
  };
}

// 原因：遵循 ADR-0005，标准音视频播放独立封装于自包含能力子目录，按需启用或物理删除
export function createAudioVideoCapability(options: {
  enabled: boolean;
  driver?: AudioVideoCapabilityDriver;
}): AudioVideoCapability {
  const activeDriver = options.driver ?? createNativeAudioVideoDriver();

  return {
    enabled: options.enabled,
    async playSampleAudio(sourceUri = DEFAULT_SAMPLE_AUDIO_URI) {
      if (!options.enabled) {
        return null;
      }
      return activeDriver.playSampleAudio(sourceUri);
    },
    releaseAudio() {
      activeDriver.releaseAudio?.();
    },
  };
}

export function useAudioVideoCapability(): AudioVideoCapability {
  const { identity, capabilityOverrides } = useAppRuntime();
  const driverOverride = capabilityOverrides?.audioVideo;

  const capability = useMemo(
    () =>
      createAudioVideoCapability({
        enabled: identity.capabilities.audioVideo,
        driver: driverOverride,
      }),
    [driverOverride, identity.capabilities.audioVideo],
  );

  useEffect(() => {
    return () => {
      capability.releaseAudio();
    };
  }, [capability]);

  return capability;
}

export interface StandardVideoPlayerProps {
  sourceUri: string;
  height?: number;
}

function MountedNativeVideoView({
  sourceUri,
  height,
  borderRadius,
}: {
  sourceUri: string;
  height: number;
  borderRadius: number;
}): React.JSX.Element {
  const { VideoView, useVideoPlayer } = require('expo-video') as typeof import('expo-video');
  const player = useVideoPlayer(sourceUri);

  return (
    <View style={[styles.frame, { height, borderRadius }]}>
      <VideoView style={styles.fill} player={player} nativeControls />
    </View>
  );
}

export function StandardVideoPlayer({
  sourceUri,
  height = 180,
}: StandardVideoPlayerProps): React.JSX.Element | null {
  const { tokens } = useAppTheme();
  const { capabilityOverrides } = useAppRuntime();
  const driverOverride = capabilityOverrides?.audioVideo;
  const capability = useAudioVideoCapability();

  if (!capability.enabled) {
    return null;
  }

  if (driverOverride?.renderVideoSurface) {
    return driverOverride.renderVideoSurface({
      sourceUri,
      height,
      borderRadius: tokens.radii.md,
      backgroundColor: tokens.colors.surfaceMuted,
    });
  }

  return (
    <MountedNativeVideoView sourceUri={sourceUri} height={height} borderRadius={tokens.radii.md} />
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
});
