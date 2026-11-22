import React, { useState } from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { AppRuntimeProvider } from '@/core/runtime';
import {
  createPageActionsRegistry,
  DetailTemplate,
  FormTemplate,
  ListTemplate,
  SearchBar,
  SettingsList,
  type SettingsSection,
} from '@/core/ui';
import { StatusPageScreen } from '@/features/content';
import { SearchScreen } from '@/features/search';
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

describe('Seam: ListTemplate', () => {
  it('renders items, handles load-more and empty state, and registers reselect actions', async () => {
    const runtime = createRuntime();
    const registry = createPageActionsRegistry();
    let refreshed = 0;
    let loadedMore = 0;

    const { rerender } = await render(
      <AppRuntimeProvider runtime={runtime}>
        <ListTemplate
          data={[
            { id: '1', title: '条目一' },
            { id: '2', title: '条目二' },
          ]}
          keyExtractor={(item) => item.id}
          renderItem={(item) => <Text>{item.title}</Text>}
          hasNextPage
          onRefresh={() => {
            refreshed += 1;
          }}
          onLoadMore={() => {
            loadedMore += 1;
          }}
          registry={registry}
        />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('条目一')).toBeTruthy();
    const beforePress = loadedMore;
    await fireEvent.press(screen.getByRole('button', { name: '加载更多' }));
    expect(loadedMore).toBe(beforePress + 1);

    expect(registry.reselect()).toBe('refreshed');
    expect(refreshed).toBe(1);

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <ListTemplate
          data={[]}
          keyExtractor={(item: { id: string }) => item.id}
          renderItem={() => null}
          emptyTitle="列表为空"
          registry={registry}
        />
      </AppRuntimeProvider>,
    );
    expect(screen.getByText('列表为空')).toBeTruthy();
  });
});

describe('Seam: DetailTemplate', () => {
  it('renders detail header, body, and bottom action bar callbacks', async () => {
    const runtime = createRuntime();
    let liked = 0;
    let favorited = 0;
    let shared = 0;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <DetailTemplate
          title="文章标题"
          subtitle="架构组 · 今天"
          onBack={() => undefined}
          liked={false}
          favorited={false}
          onToggleLike={() => {
            liked += 1;
          }}
          onToggleFavorite={() => {
            favorited += 1;
          }}
          onShare={() => {
            shared += 1;
          }}
        >
          <Text>正文内容段落</Text>
        </DetailTemplate>
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('文章标题')).toBeTruthy();
    expect(screen.getByText('正文内容段落')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('detail-action-like'));
    await fireEvent.press(screen.getByTestId('detail-action-favorite'));
    await fireEvent.press(screen.getByTestId('detail-action-share'));

    expect(liked).toBe(1);
    expect(favorited).toBe(1);
    expect(shared).toBe(1);
  });
});

describe('Seam: FormTemplate', () => {
  it('blocks submission on validation error and submits when valid', async () => {
    const runtime = createRuntime();
    let submitted = 0;

    function Harness(): React.JSX.Element {
      const [valid, setValid] = useState(false);
      return (
        <FormTemplate
          title="意见反馈"
          submitLabel="提交反馈"
          onValidate={() => (valid ? null : '请填写反馈内容')}
          onSubmit={() => {
            submitted += 1;
          }}
        >
          <Text
            testID="make-valid"
            onPress={() => {
              setValid(true);
            }}
          >
            设为有效
          </Text>
        </FormTemplate>
      );
    }

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <Harness />
      </AppRuntimeProvider>,
    );

    await fireEvent.press(screen.getByRole('button', { name: '提交反馈' }));
    expect(screen.getByText('请填写反馈内容')).toBeTruthy();
    expect(submitted).toBe(0);

    await fireEvent.press(screen.getByTestId('make-valid'));
    await fireEvent.press(screen.getByRole('button', { name: '提交反馈' }));
    expect(screen.queryByText('请填写反馈内容')).toBeNull();
    expect(submitted).toBe(1);
  });
});

describe('Seam: SettingsList', () => {
  it('renders grouped sections and triggers link press and switch toggle', async () => {
    const runtime = createRuntime();
    let linkPressed = 0;
    let switchVal = false;

    const sections: SettingsSection[] = [
      {
        key: 'general',
        title: '通用',
        items: [
          {
            key: 'dev',
            kind: 'link',
            label: '开发者工具',
            value: '已开启',
            onPress: () => {
              linkPressed += 1;
            },
            testID: 'settings-row-dev',
          },
          {
            key: 'notify',
            kind: 'switch',
            label: '消息通知',
            value: switchVal,
            onValueChange: (next) => {
              switchVal = next;
            },
            testID: 'settings-row-notify',
          },
          {
            key: 'ver',
            kind: 'info',
            label: '版本号',
            value: '1.0.0',
          },
        ],
      },
    ];

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <SettingsList sections={sections} />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('通用')).toBeTruthy();
    expect(screen.getByText('1.0.0')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('settings-row-dev'));
    expect(linkPressed).toBe(1);

    await fireEvent.press(screen.getByTestId('settings-row-notify'));
    expect(switchVal).toBe(true);
  });
});

describe('Seam: SearchBar', () => {
  it('works in trigger mode and input mode with clear and submit', async () => {
    const runtime = createRuntime();
    let triggered = 0;
    const submitted: string[] = [];

    function InputHarness(): React.JSX.Element {
      const [query, setQuery] = useState('');
      return (
        <SearchBar
          mode="input"
          value={query}
          onChangeText={setQuery}
          onSubmit={(text) => submitted.push(text)}
          placeholder="搜索内容"
        />
      );
    }

    const { rerender } = await render(
      <AppRuntimeProvider runtime={runtime}>
        <SearchBar
          mode="trigger"
          placeholder="搜索文章或专题"
          onPress={() => {
            triggered += 1;
          }}
        />
      </AppRuntimeProvider>,
    );

    await fireEvent.press(screen.getByTestId('search-bar-trigger'));
    expect(triggered).toBe(1);

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <InputHarness />
      </AppRuntimeProvider>,
    );

    const input = screen.getByTestId('search-bar-input');
    await fireEvent.changeText(input, '架构');
    await fireEvent(input, 'submitEditing');
    expect(submitted).toEqual(['架构']);

    await fireEvent.press(screen.getByTestId('search-bar-clear'));
    expect(input.props.value).toBe('');
  });
});

describe('Seam: SearchScreen and StatusPageScreen stack templates', () => {
  it('supports search history, clearing history, hot keywords, results, and empty result state', async () => {
    const runtime = createRuntime();
    const selected: string[] = [];

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <SearchScreen onSelectResult={(id) => selected.push(id)} />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('搜索历史')).toBeTruthy();
    expect(screen.getByText('热门搜索')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('search-clear-history'));
    expect(screen.queryByText('搜索历史')).toBeNull();

    await fireEvent.press(screen.getByText('抽屉手势'));
    expect(screen.getByText('Reanimated 抽屉手势与边缘冲突隔离')).toBeTruthy();

    await fireEvent.press(screen.getByText('Reanimated 抽屉手势与边缘冲突隔离'));
    expect(selected).toEqual(['s-2']);

    await fireEvent.changeText(screen.getByTestId('search-bar-input'), '不存在的关键词xyz');
    expect(screen.getByText('未找到相关结果')).toBeTruthy();

    // Verify search history persisted in keyValueStorage across remount
    expect(runtime.keyValueStorage.getString('search.history.v1')).toContain('抽屉手势');
  });

  it('renders 404 not-found status page with back action', async () => {
    const runtime = createRuntime();
    let backed = 0;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <StatusPageScreen
          kind="not-found"
          onBack={() => {
            backed += 1;
          }}
        />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('404 · 页面不存在')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '返回上一页' }));
    expect(backed).toBe(1);
  });
});
