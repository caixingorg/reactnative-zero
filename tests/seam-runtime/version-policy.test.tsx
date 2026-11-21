import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { AppRuntimeProvider } from '@/core/runtime';
import {
  compareVersions,
  createVersionPolicyStore,
  ForceUpdateGate,
  type VersionPolicyAdapter,
  type VersionPolicyRequest,
  type VersionPolicyResponse,
} from '@/core/version-policy';
import { createTestRuntime } from '../helpers/create-test-runtime';

function adapterReturning(
  response: VersionPolicyResponse | Error,
  seen: VersionPolicyRequest[] = [],
): VersionPolicyAdapter {
  return {
    fetchPolicy: async (request) => {
      seen.push(request);
      if (response instanceof Error) {
        throw response;
      }
      return response;
    },
  };
}

const baseOptions = {
  currentVersion: '1.2.0',
  platform: 'android' as const,
  isConsentGranted: () => false,
};

describe('Seam: minimum version and kill-switch policy', () => {
  it('compares dotted versions numerically and rejects malformed ones', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0', '2.0.0')).toBe(0);
    expect(compareVersions('1.2.1', '1.2.0')).toBeGreaterThan(0);
    expect(compareVersions('1.2.x', '1.2.0')).toBeNull();
  });

  it('never sends identifiers before consent and only sends them after consent when the app supplies them', async () => {
    const seen: VersionPolicyRequest[] = [];
    let consent = false;
    const store = createVersionPolicyStore({
      ...baseOptions,
      adapter: adapterReturning({}, seen),
      isConsentGranted: () => consent,
      getIdentifiers: () => ({ installId: 'abc' }),
    });

    await store.getState().check();
    consent = true;
    await store.getState().check();

    expect(seen[0]).toEqual({ appVersion: '1.2.0', platform: 'android' });
    expect(seen[1]?.identifiers).toEqual({ installId: 'abc' });

    const noSource: VersionPolicyRequest[] = [];
    await createVersionPolicyStore({
      ...baseOptions,
      adapter: adapterReturning({}, noSource),
      isConsentGranted: () => true,
    })
      .getState()
      .check();
    expect(noSource[0]?.identifiers).toBeUndefined();
  });

  it('blocks the app below the minimum version and lets it through at or above it', async () => {
    const blocked = createVersionPolicyStore({
      ...baseOptions,
      adapter: adapterReturning({ minVersion: '1.3.0', updateUrl: 'https://example.com/app' }),
    });
    await blocked.getState().check();
    expect(blocked.getState()).toMatchObject({
      status: 'update-required',
      updateUrl: 'https://example.com/app',
    });

    await render(
      <AppRuntimeProvider runtime={createTestRuntime()}>
        <ForceUpdateGate store={blocked}>
          <Text>app content</Text>
        </ForceUpdateGate>
      </AppRuntimeProvider>,
    );
    expect(screen.queryByText('app content')).toBeNull();
    expect(screen.getByText('需要更新应用')).toBeTruthy();
    expect(screen.getByText('前往更新')).toBeTruthy();

    const allowed = createVersionPolicyStore({
      ...baseOptions,
      adapter: adapterReturning({ minVersion: '1.2.0' }),
    });
    await allowed.getState().check();
    expect(allowed.getState().status).toBe('ok');
  });

  it('starts normally when the request fails or times out, and keeps every switch off', async () => {
    const failed = createVersionPolicyStore({
      ...baseOptions,
      adapter: adapterReturning(new Error('network down')),
    });
    await failed.getState().check();
    expect(failed.getState().status).toBe('ok');
    expect(failed.getState().isKillSwitchOn('anything')).toBe(false);

    jest.useFakeTimers();
    try {
      const slow = createVersionPolicyStore({
        ...baseOptions,
        timeoutMs: 50,
        adapter: { fetchPolicy: () => new Promise<VersionPolicyResponse>(() => undefined) },
      });
      const pending = slow.getState().check();
      await act(async () => {
        jest.advanceTimersByTime(60);
        await pending;
      });
      expect(slow.getState().status).toBe('ok');
    } finally {
      jest.useRealTimers();
    }

    await render(
      <AppRuntimeProvider runtime={createTestRuntime()}>
        <ForceUpdateGate store={failed}>
          <Text>app content</Text>
        </ForceUpdateGate>
      </AppRuntimeProvider>,
    );
    expect(screen.getByText('app content')).toBeTruthy();
  });

  it('reads kill-switches and ignores malformed server data', async () => {
    const store = createVersionPolicyStore({
      ...baseOptions,
      adapter: adapterReturning({
        minVersion: 'not-a-version',
        updateUrl: 'http://insecure.example.com',
        killSwitches: { payments: true, chat: false, broken: 'yes' as unknown as boolean },
      }),
    });
    await store.getState().check();

    expect(store.getState().status).toBe('ok');
    expect(store.getState().updateUrl).toBeUndefined();
    expect(store.getState().isKillSwitchOn('payments')).toBe(true);
    expect(store.getState().isKillSwitchOn('chat')).toBe(false);
    expect(store.getState().isKillSwitchOn('broken')).toBe(false);
  });

  it('does nothing without an adapter', async () => {
    const store = createVersionPolicyStore(baseOptions);
    await store.getState().check();
    expect(store.getState()).toMatchObject({ status: 'ok', killSwitches: {} });
  });
});
