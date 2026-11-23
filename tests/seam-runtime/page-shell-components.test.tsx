import React, { useState } from 'react';
import { Text } from 'react-native';
import PagerView from 'react-native-pager-view';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { AppRuntimeProvider } from '@/core/runtime';
import {
  createPageActionsRegistry,
  DrawerTriggerButton,
  PageTemplate,
  TabPager,
  TopTabs,
  type TopTabItem,
} from '@/core/ui';
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
  });
}

describe('Seam: TopTabs', () => {
  it('selects tabs on press and displays dot and capped numeric badges', async () => {
    const runtime = createRuntime();
    const tabs: TopTabItem[] = [
      { key: 'rec', label: '推荐' },
      { key: 'follow', label: '关注', showDot: true },
      { key: 'hot', label: '热榜', badgeCount: 120 },
    ];
    const selected: number[] = [];

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <TopTabs tabs={tabs} activeIndex={0} onSelect={(index) => selected.push(index)} />
      </AppRuntimeProvider>,
    );

    const recTab = screen.getByRole('tab', { name: '推荐' });
    const hotTab = screen.getByRole('tab', { name: /热榜/ });

    expect(recTab.props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('top-tab-dot-follow')).toBeTruthy();
    expect(screen.getByText('99+')).toBeTruthy();

    await fireEvent.press(hotTab);
    expect(selected).toEqual([2]);
  });

  it('renders leftSlot DrawerTriggerButton and rightSlot in the same single top bar', async () => {
    const runtime = createRuntime();
    let drawerPressed = 0;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <TopTabs
          tabs={[
            { key: 'a', label: '推荐' },
            { key: 'b', label: '关注' },
          ]}
          activeIndex={0}
          onSelect={() => undefined}
          leftSlot={
            <DrawerTriggerButton
              testID="single-bar-drawer-btn"
              onPress={() => {
                drawerPressed += 1;
              }}
            />
          }
          rightSlot={<Text testID="single-bar-right-slot">设置</Text>}
        />
      </AppRuntimeProvider>,
    );

    await fireEvent.press(screen.getByTestId('single-bar-drawer-btn'));
    expect(drawerPressed).toBe(1);
    expect(screen.getByTestId('single-bar-right-slot')).toBeTruthy();
  });
});

describe('Seam: TabPager', () => {
  it('lazy-mounts pages on first visit, keeps visited pages mounted, and syncs on swipe', async () => {
    const runtime = createRuntime();
    const mountCounts = [0, 0, 0];

    function TrackedPage({ index }: { index: number }): React.JSX.Element {
      useState(() => {
        mountCounts[index] = (mountCounts[index] ?? 0) + 1;
        return true;
      });
      return <Text>{`page-${index}`}</Text>;
    }

    function Harness(): React.JSX.Element {
      const [activeIndex, setActiveIndex] = useState(0);
      return (
        <TabPager
          pageCount={3}
          activeIndex={activeIndex}
          onIndexChange={setActiveIndex}
          renderPage={(index) => <TrackedPage index={index} />}
        />
      );
    }

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <Harness />
      </AppRuntimeProvider>,
    );

    // Only page 0 is mounted initially
    expect(screen.getByText('page-0')).toBeTruthy();
    expect(screen.queryByText('page-1')).toBeNull();
    expect(screen.queryByText('page-2')).toBeNull();

    const pager = screen.getByTestId('tab-pager-view');
    await fireEvent(pager, 'pageSelected', { nativeEvent: { position: 1 } });

    // Page 1 is now mounted AND page 0 remains mounted without remounting
    expect(screen.getByText('page-0')).toBeTruthy();
    expect(screen.getByText('page-1')).toBeTruthy();
    expect(screen.queryByText('page-2')).toBeNull();
    expect(mountCounts).toEqual([1, 1, 0]);

    // Swiping to page 2 unmounts far-away page 0 (outside keepAliveRadius=1)
    await fireEvent(pager, 'pageSelected', { nativeEvent: { position: 2 } });
    expect(screen.queryByText('page-0')).toBeNull();
    expect(screen.getByText('page-1')).toBeTruthy();
    expect(screen.getByText('page-2')).toBeTruthy();
    expect(mountCounts).toEqual([1, 1, 1]);
  });

  it('writes clamped continuous scroll progress on pageScroll events', async () => {
    const runtime = createRuntime();
    const progressValues: number[] = [];
    const scrollProgress = {
      value: 0,
      get: () => progressValues[progressValues.length - 1] ?? 0,
      set: (next: number) => {
        progressValues.push(next);
      },
    } as unknown as React.ComponentProps<typeof TabPager>['scrollProgress'];

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <TabPager
          pageCount={3}
          activeIndex={0}
          onIndexChange={() => undefined}
          scrollProgress={scrollProgress}
          renderPage={(index) => <Text>{`page-${index}`}</Text>}
        />
      </AppRuntimeProvider>,
    );

    const pager = screen.getByTestId('tab-pager-view');
    await fireEvent(pager, 'pageScroll', { nativeEvent: { position: 0, offset: 0.5 } });
    await fireEvent(pager, 'pageScroll', { nativeEvent: { position: 2, offset: 0.8 } });
    await fireEvent(pager, 'pageScroll', { nativeEvent: { position: -1, offset: 0.2 } });

    expect(progressValues.slice(-3)).toEqual([0.5, 2, 0]);
  });

  it('syncs external activeIndex changes via setPage without redundant feedback loops', async () => {
    const runtime = createRuntime();
    const onIndexChange = jest.fn();
    const setPageSpy = jest.spyOn(PagerView.prototype, 'setPage');

    try {
      const { rerender } = await render(
        <AppRuntimeProvider runtime={runtime}>
          <TabPager
            pageCount={3}
            activeIndex={0}
            onIndexChange={onIndexChange}
            renderPage={(index) => <Text>{`page-${index}`}</Text>}
          />
        </AppRuntimeProvider>,
      );

      expect(setPageSpy).not.toHaveBeenCalled();

      await rerender(
        <AppRuntimeProvider runtime={runtime}>
          <TabPager
            pageCount={3}
            activeIndex={2}
            onIndexChange={onIndexChange}
            renderPage={(index) => <Text>{`page-${index}`}</Text>}
          />
        </AppRuntimeProvider>,
      );

      expect(setPageSpy).toHaveBeenCalledTimes(1);
      expect(setPageSpy).toHaveBeenCalledWith(2);
      expect(onIndexChange).not.toHaveBeenCalled();
      expect(screen.getByText('page-2')).toBeTruthy();

      const pager = screen.getByTestId('tab-pager-view');
      await fireEvent(pager, 'pageSelected', { nativeEvent: { position: 1 } });
      expect(onIndexChange).toHaveBeenCalledTimes(1);
      expect(onIndexChange).toHaveBeenCalledWith(1);

      await rerender(
        <AppRuntimeProvider runtime={runtime}>
          <TabPager
            pageCount={3}
            activeIndex={1}
            onIndexChange={onIndexChange}
            renderPage={(index) => <Text>{`page-${index}`}</Text>}
          />
        </AppRuntimeProvider>,
      );

      expect(setPageSpy).toHaveBeenCalledTimes(1);
      expect(onIndexChange).toHaveBeenCalledTimes(1);
    } finally {
      setPageSpy.mockRestore();
    }
  });

  it('integrates TopTabs and TabPager for tab presses, swipe selection, pageScroll, and scrollEnabled', async () => {
    const runtime = createRuntime();
    const setPageSpy = jest.spyOn(PagerView.prototype, 'setPage');
    const tabs: TopTabItem[] = [
      { key: 'rec', label: '推荐' },
      { key: 'follow', label: '关注' },
      { key: 'hot', label: '热榜' },
    ];
    let currentProgress = 0;
    const scrollProgress = {
      value: 0,
      get: () => currentProgress,
      set: (next: number) => {
        currentProgress = next;
      },
    } as unknown as NonNullable<React.ComponentProps<typeof TabPager>['scrollProgress']>;

    function IntegratedHarness({
      scrollEnabled = true,
    }: {
      scrollEnabled?: boolean;
    }): React.JSX.Element {
      const [activeIndex, setActiveIndex] = useState(0);
      return (
        <>
          <TopTabs
            tabs={tabs}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
            scrollProgress={scrollProgress}
          />
          <TabPager
            pageCount={tabs.length}
            activeIndex={activeIndex}
            onIndexChange={setActiveIndex}
            scrollProgress={scrollProgress}
            scrollEnabled={scrollEnabled}
            renderPage={(index) => <Text>{`integrated-page-${index}`}</Text>}
          />
        </>
      );
    }

    try {
      const { rerender } = await render(
        <AppRuntimeProvider runtime={runtime}>
          <IntegratedHarness />
        </AppRuntimeProvider>,
      );

      const pager = screen.getByTestId('tab-pager-view');
      expect(pager.props.scrollEnabled).toBe(true);

      await fireEvent.press(screen.getByRole('tab', { name: '热榜' }));
      expect(screen.getByRole('tab', { name: '热榜' }).props.accessibilityState).toEqual({
        selected: true,
      });
      expect(setPageSpy).toHaveBeenCalledTimes(1);
      expect(setPageSpy).toHaveBeenCalledWith(2);
      expect(screen.getByText('integrated-page-2')).toBeTruthy();

      await fireEvent(pager, 'pageScroll', { nativeEvent: { position: 1, offset: 0.25 } });
      expect(scrollProgress.get()).toBe(1.25);

      await fireEvent(pager, 'pageSelected', { nativeEvent: { position: 1 } });
      expect(screen.getByRole('tab', { name: '关注' }).props.accessibilityState).toEqual({
        selected: true,
      });
      expect(screen.getByText('integrated-page-1')).toBeTruthy();

      await rerender(
        <AppRuntimeProvider runtime={runtime}>
          <IntegratedHarness scrollEnabled={false} />
        </AppRuntimeProvider>,
      );
      expect(screen.getByTestId('tab-pager-view').props.scrollEnabled).toBe(false);
    } finally {
      setPageSpy.mockRestore();
    }
  });

  it('handles keepAliveRadius=0, keepAliveRadius=-1, and non-positive pageCount safely', async () => {
    const runtime = createRuntime();
    const onIndexChange = jest.fn();
    let currentProgress = 1;
    const scrollProgress = {
      value: 1,
      get: () => currentProgress,
      set: (next: number) => {
        currentProgress = next;
      },
    } as unknown as NonNullable<React.ComponentProps<typeof TabPager>['scrollProgress']>;

    function RadiusHarness({ keepAliveRadius }: { keepAliveRadius: number }): React.JSX.Element {
      const [activeIndex, setActiveIndex] = useState(0);
      return (
        <TabPager
          pageCount={3}
          activeIndex={activeIndex}
          onIndexChange={setActiveIndex}
          keepAliveRadius={keepAliveRadius}
          renderPage={(index) => <Text>{`radius-page-${index}`}</Text>}
        />
      );
    }

    const { rerender } = await render(
      <AppRuntimeProvider runtime={runtime}>
        <RadiusHarness keepAliveRadius={0} />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('radius-page-0')).toBeTruthy();
    await fireEvent(screen.getByTestId('tab-pager-view'), 'pageSelected', {
      nativeEvent: { position: 1 },
    });
    expect(screen.queryByText('radius-page-0')).toBeNull();
    expect(screen.getByText('radius-page-1')).toBeTruthy();

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <RadiusHarness keepAliveRadius={-1} />
      </AppRuntimeProvider>,
    );

    const infinitePager = screen.getByTestId('tab-pager-view');
    await fireEvent(infinitePager, 'pageSelected', { nativeEvent: { position: 0 } });
    await fireEvent(infinitePager, 'pageSelected', { nativeEvent: { position: 2 } });
    expect(screen.getByText('radius-page-0')).toBeTruthy();
    expect(screen.getByText('radius-page-1')).toBeTruthy();
    expect(screen.getByText('radius-page-2')).toBeTruthy();

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <TabPager
          pageCount={0}
          activeIndex={0}
          onIndexChange={onIndexChange}
          scrollProgress={scrollProgress}
          renderPage={(index) => <Text>{`empty-page-${index}`}</Text>}
        />
      </AppRuntimeProvider>,
    );
    expect(screen.getByTestId('tab-pager')).toBeTruthy();
    expect(screen.queryByTestId('tab-pager-view')).toBeNull();
    expect(screen.queryByTestId('tab-pager-page-0')).toBeNull();
    expect(scrollProgress.get()).toBe(0);
    expect(onIndexChange).not.toHaveBeenCalled();

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <TabPager
          pageCount={-2}
          activeIndex={1}
          onIndexChange={onIndexChange}
          scrollProgress={scrollProgress}
          renderPage={(index) => <Text>{`empty-page-${index}`}</Text>}
        />
      </AppRuntimeProvider>,
    );
    expect(screen.getByTestId('tab-pager')).toBeTruthy();
    expect(screen.queryByTestId('tab-pager-view')).toBeNull();
    expect(screen.queryByTestId('tab-pager-page-0')).toBeNull();
    expect(scrollProgress.get()).toBe(0);
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('handles rapid 0 -> 1 -> 0 pageSelected events in one batch without setPage feedback loop', async () => {
    const runtime = createRuntime();
    const setPageSpy = jest.spyOn(PagerView.prototype, 'setPage');
    const changes: number[] = [];

    function RapidHarness(): React.JSX.Element {
      const [activeIndex, setActiveIndex] = useState(0);
      return (
        <TabPager
          pageCount={3}
          activeIndex={activeIndex}
          onIndexChange={(next) => {
            changes.push(next);
            setActiveIndex(next);
          }}
          renderPage={(index, isActive) => (
            <Text>{`rapid-page-${index}-${isActive ? 'active' : 'idle'}`}</Text>
          )}
        />
      );
    }

    try {
      await render(
        <AppRuntimeProvider runtime={runtime}>
          <RapidHarness />
        </AppRuntimeProvider>,
      );

      const pager = screen.getByTestId('tab-pager-view');
      await fireEvent(pager, 'pageSelected', { nativeEvent: { position: 0 } });
      expect(changes).toEqual([]);

      await act(async () => {
        pager.props.onPageSelected({ nativeEvent: { position: 1 } });
        pager.props.onPageSelected({ nativeEvent: { position: 0 } });
      });

      expect(changes).toEqual([1, 0]);
      expect(setPageSpy).not.toHaveBeenCalled();
      expect(screen.getByText('rapid-page-0-active')).toBeTruthy();
    } finally {
      setPageSpy.mockRestore();
    }
  });

  it('suppresses duplicate 0 -> 2 -> 2 pageSelected events in a single batch before commit', async () => {
    const runtime = createRuntime();
    const setPageSpy = jest.spyOn(PagerView.prototype, 'setPage');
    const changes: number[] = [];

    function RapidDuplicateHarness(): React.JSX.Element {
      const [activeIndex, setActiveIndex] = useState(0);
      return (
        <TabPager
          pageCount={3}
          activeIndex={activeIndex}
          onIndexChange={(next) => {
            changes.push(next);
            setActiveIndex(next);
          }}
          renderPage={(index, isActive) => (
            <Text>{`rapid-dup-page-${index}-${isActive ? 'active' : 'idle'}`}</Text>
          )}
        />
      );
    }

    try {
      await render(
        <AppRuntimeProvider runtime={runtime}>
          <RapidDuplicateHarness />
        </AppRuntimeProvider>,
      );

      const pager = screen.getByTestId('tab-pager-view');
      await act(async () => {
        pager.props.onPageSelected({ nativeEvent: { position: 2 } });
        pager.props.onPageSelected({ nativeEvent: { position: 2 } });
      });

      expect(changes).toEqual([2]);
      expect(setPageSpy).not.toHaveBeenCalled();
      expect(screen.getByText('rapid-dup-page-2-active')).toBeTruthy();
    } finally {
      setPageSpy.mockRestore();
    }
  });

  it('caps large keepAliveRadius within Int32 offscreenPageLimit while keeping pages alive', async () => {
    const runtime = createRuntime();

    function LargeRadiusHarness(): React.JSX.Element {
      const [activeIndex, setActiveIndex] = useState(0);
      return (
        <TabPager
          pageCount={3}
          activeIndex={activeIndex}
          onIndexChange={setActiveIndex}
          keepAliveRadius={2147483648}
          renderPage={(index, isActive) => (
            <Text>{`large-radius-page-${index}-${isActive ? 'active' : 'idle'}`}</Text>
          )}
        />
      );
    }

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <LargeRadiusHarness />
      </AppRuntimeProvider>,
    );

    const pager = screen.getByTestId('tab-pager-view');
    expect(pager.props.offscreenPageLimit).toBeLessThanOrEqual(2147483647);
    expect(pager.props.offscreenPageLimit).toBe(2);
    expect(screen.getByText('large-radius-page-0-active')).toBeTruthy();

    await fireEvent(pager, 'pageSelected', { nativeEvent: { position: 1 } });
    await fireEvent(pager, 'pageSelected', { nativeEvent: { position: 2 } });

    expect(screen.getByText('large-radius-page-0-idle')).toBeTruthy();
    expect(screen.getByText('large-radius-page-1-idle')).toBeTruthy();
    expect(screen.getByText('large-radius-page-2-active')).toBeTruthy();
  });

  it('sanitizes non-finite and fractional keepAliveRadius values while keeping active page mounted', async () => {
    const runtime = createRuntime();

    const { rerender } = await render(
      <AppRuntimeProvider runtime={runtime}>
        <TabPager
          pageCount={3}
          activeIndex={0}
          onIndexChange={() => undefined}
          keepAliveRadius={Number.NaN}
          renderPage={(index) => <Text>{`sanitized-page-${index}`}</Text>}
        />
      </AppRuntimeProvider>,
    );

    expect(screen.getByTestId('tab-pager-view').props.offscreenPageLimit).toBe(1);
    expect(screen.getByText('sanitized-page-0')).toBeTruthy();

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <TabPager
          pageCount={3}
          activeIndex={0}
          onIndexChange={() => undefined}
          keepAliveRadius={Number.POSITIVE_INFINITY}
          renderPage={(index) => <Text>{`sanitized-page-${index}`}</Text>}
        />
      </AppRuntimeProvider>,
    );

    expect(screen.getByTestId('tab-pager-view').props.offscreenPageLimit).toBe(1);
    expect(screen.getByText('sanitized-page-0')).toBeTruthy();

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <TabPager
          pageCount={3}
          activeIndex={0}
          onIndexChange={() => undefined}
          keepAliveRadius={1.5}
          renderPage={(index) => <Text>{`sanitized-page-${index}`}</Text>}
        />
      </AppRuntimeProvider>,
    );

    expect(screen.getByTestId('tab-pager-view').props.offscreenPageLimit).toBe(1);
    expect(screen.getByText('sanitized-page-0')).toBeTruthy();
  });

  it('clamps scrollProgress and prunes out-of-range visited pages when pageCount shrinks', async () => {
    const runtime = createRuntime();
    const setPageSpy = jest.spyOn(PagerView.prototype, 'setPage');
    let currentProgress = 2;
    const scrollProgress = {
      value: 2,
      get: () => currentProgress,
      set: (next: number) => {
        currentProgress = next;
      },
    } as unknown as NonNullable<React.ComponentProps<typeof TabPager>['scrollProgress']>;

    try {
      const { rerender } = await render(
        <AppRuntimeProvider runtime={runtime}>
          <TabPager
            pageCount={3}
            activeIndex={2}
            onIndexChange={() => undefined}
            scrollProgress={scrollProgress}
            keepAliveRadius={-1}
            renderPage={(index, isActive) => (
              <Text>{`shrink-page-${index}-${isActive ? 'active' : 'idle'}`}</Text>
            )}
          />
        </AppRuntimeProvider>,
      );

      expect(screen.getByText('shrink-page-2-active')).toBeTruthy();
      expect(scrollProgress.get()).toBe(2);

      // Shrinking 3 -> 2 while activeIndex=2 clamps active page to 1 and scrollProgress to 1
      await rerender(
        <AppRuntimeProvider runtime={runtime}>
          <TabPager
            pageCount={2}
            activeIndex={2}
            onIndexChange={() => undefined}
            scrollProgress={scrollProgress}
            keepAliveRadius={-1}
            renderPage={(index, isActive) => (
              <Text>{`shrink-page-${index}-${isActive ? 'active' : 'idle'}`}</Text>
            )}
          />
        </AppRuntimeProvider>,
      );

      expect(setPageSpy).toHaveBeenCalledWith(1);
      expect(scrollProgress.get()).toBe(1);
      expect(screen.getByText('shrink-page-1-active')).toBeTruthy();

      // Grow back to 3 and activate page 2: in-range scrollProgress is not overwritten during setPage
      await rerender(
        <AppRuntimeProvider runtime={runtime}>
          <TabPager
            pageCount={3}
            activeIndex={2}
            onIndexChange={() => undefined}
            scrollProgress={scrollProgress}
            keepAliveRadius={-1}
            renderPage={(index, isActive) => (
              <Text>{`shrink-page-${index}-${isActive ? 'active' : 'idle'}`}</Text>
            )}
          />
        </AppRuntimeProvider>,
      );
      expect(screen.getByText('shrink-page-2-active')).toBeTruthy();
      expect(scrollProgress.get()).toBe(1);

      // Shrink 3 -> 1 -> 3: removed page 2 must be pruned from visited and not auto-remount
      await rerender(
        <AppRuntimeProvider runtime={runtime}>
          <TabPager
            pageCount={1}
            activeIndex={0}
            onIndexChange={() => undefined}
            scrollProgress={scrollProgress}
            keepAliveRadius={-1}
            renderPage={(index, isActive) => (
              <Text>{`shrink-page-${index}-${isActive ? 'active' : 'idle'}`}</Text>
            )}
          />
        </AppRuntimeProvider>,
      );
      expect(scrollProgress.get()).toBe(0);

      await rerender(
        <AppRuntimeProvider runtime={runtime}>
          <TabPager
            pageCount={3}
            activeIndex={0}
            onIndexChange={() => undefined}
            scrollProgress={scrollProgress}
            keepAliveRadius={-1}
            renderPage={(index, isActive) => (
              <Text>{`shrink-page-${index}-${isActive ? 'active' : 'idle'}`}</Text>
            )}
          />
        </AppRuntimeProvider>,
      );

      expect(screen.getByText('shrink-page-0-active')).toBeTruthy();
      expect(screen.queryByText(/shrink-page-2/)).toBeNull();
    } finally {
      setPageSpy.mockRestore();
    }
  });
});

describe('Seam: PageTemplate', () => {
  it('renders loading, ready, empty, error, and offline states with retry callbacks', async () => {
    const runtime = createRuntime();
    let retries = 0;

    const { rerender } = await render(
      <AppRuntimeProvider runtime={runtime}>
        <PageTemplate status="loading">
          <Text>content</Text>
        </PageTemplate>
      </AppRuntimeProvider>,
    );
    expect(screen.getByTestId('page-template-loading')).toBeTruthy();
    expect(screen.queryByText('content')).toBeNull();

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <PageTemplate status="ready">
          <Text>content</Text>
        </PageTemplate>
      </AppRuntimeProvider>,
    );
    expect(screen.getByText('content')).toBeTruthy();

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <PageTemplate status="empty" emptyTitle="暂无内容" emptyDescription="稍后再来看看" />
      </AppRuntimeProvider>,
    );
    expect(screen.getByText('暂无内容')).toBeTruthy();

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <PageTemplate
          status="error"
          errorTitle="加载失败"
          onRetry={() => {
            retries += 1;
          }}
        />
      </AppRuntimeProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: '重试' }));
    expect(retries).toBe(1);

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <PageTemplate
          status="offline"
          onRetry={() => {
            retries += 1;
          }}
        />
      </AppRuntimeProvider>,
    );
    expect(screen.getByText('当前无网络连接')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '重试' }));
    expect(retries).toBe(2);
  });

  it('registers active page actions with pageActionsRegistry and unregisters when inactive', async () => {
    const runtime = createRuntime();
    const registry = createPageActionsRegistry();
    let atTop = false;
    let scrolled = 0;
    let refreshed = 0;

    const actions = {
      isAtTop: () => atTop,
      scrollToTop: () => {
        scrolled += 1;
        atTop = true;
      },
      refresh: () => {
        refreshed += 1;
      },
    };

    const { rerender } = await render(
      <AppRuntimeProvider runtime={runtime}>
        <PageTemplate status="ready" isActive pageActions={actions} registry={registry}>
          <Text>active page</Text>
        </PageTemplate>
      </AppRuntimeProvider>,
    );

    expect(registry.reselect()).toBe('scrolledToTop');
    expect(scrolled).toBe(1);
    expect(registry.reselect()).toBe('refreshed');
    expect(refreshed).toBe(1);

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <PageTemplate status="ready" isActive={false} pageActions={actions} registry={registry}>
          <Text>active page</Text>
        </PageTemplate>
      </AppRuntimeProvider>,
    );

    expect(registry.reselect()).toBe('none');
  });
});
