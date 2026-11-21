import React, { useState } from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { AppRuntimeProvider } from '@/core/runtime';
import {
  createPageActionsRegistry,
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

    const pager = screen.getByTestId('tab-pager-scroll');
    await fireEvent(pager, 'layout', { nativeEvent: { layout: { width: 400, height: 600 } } });
    await fireEvent(pager, 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 400, y: 0 } },
    });

    // Page 1 is now mounted AND page 0 remains mounted without remounting
    expect(screen.getByText('page-0')).toBeTruthy();
    expect(screen.getByText('page-1')).toBeTruthy();
    expect(screen.queryByText('page-2')).toBeNull();
    expect(mountCounts).toEqual([1, 1, 0]);
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
