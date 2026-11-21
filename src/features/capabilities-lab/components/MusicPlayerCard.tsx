import React from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFilesCapability } from '@/core/capabilities/files';
import { useMusicCapability } from '@/core/capabilities/music';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, Button, HStack, VStack } from '@/core/ui';

const SKIP_SECONDS = 10;

function formatClock(totalSec: number): string {
  const safe = Number.isFinite(totalSec) && totalSec > 0 ? Math.floor(totalSec) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// 原因：蓝牙音响由系统连接，声音自动走系统当前输出；这里只提供播放控制，不扫描、不配对，也不读取输出设备名
export function MusicPlayerCard(): React.JSX.Element {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();
  const files = useFilesCapability();
  const { player, state } = useMusicCapability();
  const [pickError, setPickError] = React.useState<string | null>(null);

  const handlePick = async (): Promise<void> => {
    setPickError(null);
    try {
      const doc = await files.pickDocument({ types: ['audio/*'] });
      if (doc) {
        await player.loadAndPlay({ uri: doc.uri, name: doc.name });
      }
    } catch (error) {
      // 原因：文件选择器本身失败时没有曲目可挂错误，直接显示在状态栏里
      setPickError(error instanceof Error ? error.message : String(error));
    }
  };

  const isActive = state.status === 'playing' || state.status === 'paused';
  const ratio = state.durationSec > 0 ? Math.min(1, state.positionSec / state.durationSec) : 0;

  return (
    <VStack gap="sm">
      <AppText variant="caption" tone="secondary">
        {Platform.OS === 'android' ? t('lab.musicBluetoothHint') : t('lab.musicBluetoothHintIos')}
      </AppText>
      {Platform.OS === 'android' ? (
        <Button
          testID="music-open-bluetooth"
          label={t('lab.musicOpenBluetoothAction')}
          variant="ghost"
          onPress={() => {
            void Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() => {
              void Linking.openSettings();
            });
          }}
        />
      ) : null}
      <Button
        testID="music-pick"
        label={t('lab.musicPickAction')}
        variant="outline"
        onPress={() => {
          void handlePick();
        }}
      />
      <AppText variant="bodySm" testID="music-track-name">
        {state.track?.name ?? t('lab.musicNoTrack')}
      </AppText>
      {pickError ? (
        <AppText variant="bodySm" tone="danger" testID="music-pick-error">
          {t('lab.musicError', { reason: pickError })}
        </AppText>
      ) : null}
      {state.status === 'loading' ? (
        <AppText variant="bodySm" tone="secondary">
          {t('lab.musicLoading')}
        </AppText>
      ) : null}
      {state.status === 'error' ? (
        <AppText variant="bodySm" tone="danger" testID="music-error">
          {t('lab.musicError', { reason: state.errorMessage ?? '' })}
        </AppText>
      ) : null}
      {state.status === 'ended' ? (
        <AppText variant="bodySm" tone="secondary" testID="music-ended">
          {t('lab.musicEnded')}
        </AppText>
      ) : null}
      {state.track && state.status !== 'error' ? (
        <VStack gap="xs">
          <View style={[styles.track, { backgroundColor: tokens.colors.surfaceMuted }]}>
            <View
              style={[
                styles.fill,
                { width: `${Math.round(ratio * 100)}%`, backgroundColor: tokens.colors.primary },
              ]}
            />
          </View>
          <AppText variant="caption" tone="secondary" testID="music-clock">
            {`${formatClock(state.positionSec)} / ${formatClock(state.durationSec)}`}
          </AppText>
          <HStack gap="sm">
            <View style={styles.flex}>
              <Button
                testID="music-back"
                label={t('lab.musicBackAction')}
                variant="ghost"
                disabled={!isActive}
                onPress={() => {
                  void player.skipBy(-SKIP_SECONDS);
                }}
              />
            </View>
            <View style={styles.flex}>
              <Button
                testID="music-toggle"
                label={
                  state.status === 'playing' ? t('lab.musicPauseAction') : t('lab.musicPlayAction')
                }
                variant="primary"
                disabled={state.status === 'loading'}
                onPress={() => player.togglePlayPause()}
              />
            </View>
            <View style={styles.flex}>
              <Button
                testID="music-forward"
                label={t('lab.musicForwardAction')}
                variant="ghost"
                disabled={!isActive}
                onPress={() => {
                  void player.skipBy(SKIP_SECONDS);
                }}
              />
            </View>
          </HStack>
        </VStack>
      ) : null}
    </VStack>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6 },
  flex: { flex: 1 },
});
