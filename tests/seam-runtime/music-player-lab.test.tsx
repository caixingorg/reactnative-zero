import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import type { MusicDriverStatus, MusicPlayerDriver } from '@/core/capabilities/music';
import { AppRuntimeProvider } from '@/core/runtime';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
import { CapabilitiesLabScreen } from '@/features/capabilities-lab';
import { appTranslationResources } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

function mountLab(options: { audioVideo?: boolean; loadError?: Error; pickError?: Error } = {}) {
  const calls: string[] = [];
  let emit: ((status: MusicDriverStatus) => void) | undefined;
  const pickDocument = jest.fn(async (_options?: { types?: string[] }) => {
    if (options.pickError) {
      throw options.pickError;
    }
    return { name: 'song.mp3', uri: 'file:///song.mp3' };
  });
  const driver: MusicPlayerDriver = {
    async load(uri, onStatus) {
      calls.push(`load:${uri}`);
      if (options.loadError) {
        throw options.loadError;
      }
      emit = onStatus;
    },
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    seekTo: async (seconds) => {
      calls.push(`seek:${seconds}`);
    },
    release: () => calls.push('release'),
  };
  const runtime = createTestRuntime({
    identity: {
      ...appIdentity,
      capabilities: { ...appIdentity.capabilities, audioVideo: options.audioVideo ?? true },
      compliance: { requirePrivacyConsent: false, requirePermissionRationale: false },
    },
    env: TEST_RUNTIME_ENV,
    translations: appTranslationResources,
    overrides: {
      secretStorage: createMemorySecretStorage(),
      keyValueStorage: createMemoryKeyValueStorage(),
      initialDeviceLocale: 'zh-CN',
      capabilities: {
        files: {
          pickDocument,
          writeSandboxTextFile: async () => '',
          readSandboxTextFile: async () => null,
          writeTextFileAndShare: async () => ({ fileUri: '', shared: false }),
        },
        musicDriver: driver,
      },
    },
  });
  const status = (partial: Partial<MusicDriverStatus>) =>
    act(() => {
      emit?.({
        playing: false,
        isLoaded: true,
        positionSec: 0,
        durationSec: 125,
        didJustFinish: false,
        ...partial,
      });
    });
  return { runtime, calls, status, pickDocument };
}

describe('Seam: local music player card in the Capabilities Lab', () => {
  it('asks the file picker for audio only, plays, shows the clock, pauses and skips', async () => {
    const user = userEvent.setup();
    const { runtime, calls, status, pickDocument } = mountLab();
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );

    await user.press(screen.getByTestId('music-pick'));
    expect(pickDocument).toHaveBeenCalledWith({ types: ['audio/*'] });
    expect(await screen.findByText('song.mp3')).toBeTruthy();
    expect(calls).toEqual(['load:file:///song.mp3', 'play']);

    await status({ playing: true, positionSec: 65 });
    expect(screen.getByTestId('music-clock').props.children).toBe('1:05 / 2:05');

    await user.press(screen.getByTestId('music-forward'));
    await user.press(screen.getByTestId('music-toggle'));
    expect(calls.slice(-2)).toEqual(['seek:75', 'pause']);
  });

  it('shows why a track cannot be played', async () => {
    const user = userEvent.setup();
    const { runtime } = mountLab({ loadError: new Error('Unsupported format') });
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );

    await user.press(screen.getByTestId('music-pick'));

    expect(await screen.findByText('无法播放：Unsupported format')).toBeTruthy();
  });

  it('hides the player when the audio and video capability is switched off', async () => {
    const { runtime } = mountLab({ audioVideo: false });
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );

    expect(screen.queryByTestId('music-pick')).toBeNull();
  });

  it('shows an error instead of an unhandled rejection when the file picker fails', async () => {
    const user = userEvent.setup();
    const { runtime } = mountLab({ pickError: new Error('Picker unavailable') });
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );

    await user.press(screen.getByTestId('music-pick'));

    expect(await screen.findByText('无法播放：Picker unavailable')).toBeTruthy();
  });
});
