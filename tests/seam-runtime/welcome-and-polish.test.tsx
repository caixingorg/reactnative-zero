import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { AppRuntimeProvider } from '@/core/runtime';
import { DiscoverScreen } from '@/features/discover';
import { FeedDetailScreen } from '@/features/home';
import { SettingsScreen } from '@/features/settings';
import { WelcomeScreen } from '@/features/shell';
import { createMockHttpTransport, type MockListRecord } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

function createRuntime() {
  return createTestRuntime({
    identity: {
      ...appIdentity,
      compliance: {
        ...appIdentity.compliance,
        requirePrivacyConsent: false,
      },
    },
    env: TEST_RUNTIME_ENV,
    overrides: {
      httpTransport: createMockHttpTransport(),
    },
  });
}

describe('Seam: WelcomeScreen and persisted onboarding preference', () => {
  it('steps through all 3 slides and completes onboarding', async () => {
    const runtime = createRuntime();
    let completed = 0;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <WelcomeScreen
          onComplete={() => {
            completed += 1;
            runtime.preferencesStore.getState().completeWelcome();
          }}
        />
      </AppRuntimeProvider>,
    );

    expect(runtime.preferencesStore.getState().hasCompletedWelcome).toBe(false);
    expect(screen.getByText('清晰的三层应用骨架')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('welcome-next-btn'));
    expect(screen.getByText('丝滑的异步分页体验')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('welcome-next-btn'));
    expect(screen.getByText('统一视觉与自由换肤')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('welcome-start-btn'));
    expect(completed).toBe(1);
    expect(runtime.preferencesStore.getState().hasCompletedWelcome).toBe(true);

    runtime.preferencesStore.getState().resetWelcome();
    expect(runtime.preferencesStore.getState().hasCompletedWelcome).toBe(false);
  });

  it('allows skipping onboarding immediately', async () => {
    const runtime = createRuntime();
    let skipped = 0;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <WelcomeScreen
          onComplete={() => {
            skipped += 1;
          }}
        />
      </AppRuntimeProvider>,
    );

    await fireEvent.press(screen.getByTestId('welcome-skip-btn'));
    expect(skipped).toBe(1);
  });
});

describe('Seam: Unified DetailTemplate on FeedDetailScreen and async paginated sub-tabs', () => {
  it('renders FeedDetailScreen inside DetailTemplate with bottom action bar', async () => {
    const runtime = createRuntime();
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <FeedDetailScreen itemId="feed-101" onBack={() => undefined} />
      </AppRuntimeProvider>,
    );

    expect(await screen.findByTestId('detail-action-like')).toBeTruthy();
    expect(screen.getByTestId('detail-action-favorite')).toBeTruthy();
    expect(screen.getByTestId('detail-action-share')).toBeTruthy();
  });

  it('loads async paginated records on DiscoverScreen and invokes onSelectRecord on tap', async () => {
    const runtime = createRuntime();
    const selected: MockListRecord[] = [];

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <DiscoverScreen onSelectRecord={(record) => selected.push(record)} />
      </AppRuntimeProvider>,
    );

    const firstItem = await screen.findByText('移动架构设计');
    await fireEvent.press(firstItem);
    expect(selected.length).toBe(1);
    expect(selected[0]?.title).toBe('移动架构设计');

    await fireEvent.press(screen.getByRole('button', { name: '加载更多' }));
    await waitFor(() => {
      expect(screen.getByText('移动架构设计 · 第 2 页')).toBeTruthy();
    });
  });

  it('supports replaying welcome guide from SettingsScreen', async () => {
    const runtime = createRuntime();
    let replayed = 0;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <SettingsScreen
          onReplayWelcome={() => {
            replayed += 1;
          }}
        />
      </AppRuntimeProvider>,
    );

    await fireEvent.press(screen.getByTestId('settings-replay-welcome-btn'));
    expect(replayed).toBe(1);
  });
});
