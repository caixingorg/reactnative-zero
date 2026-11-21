import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { appIdentity } from '@root/app.identity';
import {
  clampDrawerProgress,
  createDrawerStore,
  DrawerHost,
  isInDrawerEdgeZone,
  resolveDrawerSnap,
  resolveDrawerWidth,
} from '@/core/ui';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';
import { AppRuntimeProvider } from '@/core/runtime';

// 原因：Jest 默认按 iOS 平台运行，BackHandler 在 iOS 上是空桩；这里替换成和 Android 一致的最小实现
// （后注册的先处理，返回 true 即视为已消费）
const mockBackHandlers = new Set<() => boolean | null | undefined>();
jest.mock('react-native/Libraries/Utilities/BackHandler', () => ({
  __esModule: true,
  default: {
    exitApp: () => undefined,
    addEventListener: (_event: string, handler: () => boolean | null | undefined) => {
      mockBackHandlers.add(handler);
      return { remove: () => mockBackHandlers.delete(handler) };
    },
  },
}));

function pressHardwareBack(): boolean {
  for (const handler of [...mockBackHandlers].reverse()) {
    if (handler()) {
      return true;
    }
  }
  return false;
}

describe('Seam: drawer pure logic', () => {
  it('snaps by velocity first, then by position', () => {
    expect(resolveDrawerSnap(0.1, 800)).toBe('open');
    expect(resolveDrawerSnap(0.9, -800)).toBe('closed');
    expect(resolveDrawerSnap(0.49, 0)).toBe('closed');
    expect(resolveDrawerSnap(0.5, 0)).toBe('open');
    expect(resolveDrawerSnap(0.9, 100)).toBe('open');
  });

  it('clamps the drag progress into 0..1 and tolerates a zero width', () => {
    expect(clampDrawerProgress(0, 150, 300)).toBe(0.5);
    expect(clampDrawerProgress(0.8, 200, 300)).toBe(1);
    expect(clampDrawerProgress(0.2, -200, 300)).toBe(0);
    expect(clampDrawerProgress(0.4, 50, 0)).toBe(0);
  });

  it('only treats the leftmost strip as the edge zone', () => {
    expect(isInDrawerEdgeZone(0)).toBe(true);
    expect(isInDrawerEdgeZone(20)).toBe(true);
    expect(isInDrawerEdgeZone(21)).toBe(false);
    expect(isInDrawerEdgeZone(-1)).toBe(false);
  });

  it('uses 62% of the window up to 236 points', () => {
    expect(resolveDrawerWidth(360)).toBe(223);
    expect(resolveDrawerWidth(390)).toBe(236);
    expect(resolveDrawerWidth(1000)).toBe(236);
  });
});

describe('Seam: drawer store', () => {
  it('opens, closes and toggles', () => {
    const store = createDrawerStore();
    store.getState().open();
    expect(store.getState().isOpen).toBe(true);
    store.getState().toggle();
    expect(store.getState().isOpen).toBe(false);
    store.getState().toggle();
    store.getState().close();
    expect(store.getState().isOpen).toBe(false);
  });
});

function mountHost(edgeSwipeEnabled: boolean) {
  const runtime = createTestRuntime({ identity: appIdentity, env: TEST_RUNTIME_ENV });
  const drawerStore = runtime.drawerStore;
  return {
    drawerStore,
    element: (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppRuntimeProvider runtime={runtime}>
          <DrawerHost drawerStore={drawerStore} edgeSwipeEnabled={edgeSwipeEnabled}>
            <Text>menu content</Text>
          </DrawerHost>
        </AppRuntimeProvider>
      </GestureHandlerRootView>
    ),
  };
}

describe('Seam: DrawerHost', () => {
  it('closes when the scrim is pressed', async () => {
    const { drawerStore, element } = mountHost(true);
    await render(element);
    await act(async () => {
      drawerStore.getState().open();
    });

    await fireEvent.press(screen.getByTestId('drawer-scrim'));

    expect(drawerStore.getState().isOpen).toBe(false);
  });

  it('shows the edge strip on tab roots while closed and hides it once open', async () => {
    const { drawerStore, element } = mountHost(true);
    await render(element);
    expect(screen.queryByTestId('drawer-edge')).not.toBeNull();

    await act(async () => {
      drawerStore.getState().open();
    });

    expect(screen.queryByTestId('drawer-edge')).toBeNull();
  });

  it('has no edge strip on pages where the left edge belongs to swipe-back', async () => {
    const { element } = mountHost(false);
    await render(element);

    expect(screen.queryByTestId('drawer-edge')).toBeNull();
  });

  it('lets the Android back button close the drawer before leaving the page', async () => {
    const { drawerStore, element } = mountHost(true);
    await render(element);
    expect(mockBackHandlers.size).toBe(0);

    await act(async () => {
      drawerStore.getState().open();
    });
    await waitFor(() => expect(mockBackHandlers.size).toBe(1));

    let consumed = false;
    await act(async () => {
      consumed = pressHardwareBack();
    });

    expect(consumed).toBe(true);
    expect(drawerStore.getState().isOpen).toBe(false);
    expect(mockBackHandlers.size).toBe(0);
  });

  it('does not intercept the back button while the drawer is closed', async () => {
    const { element } = mountHost(true);
    await render(element);

    expect(pressHardwareBack()).toBe(false);
  });
});
