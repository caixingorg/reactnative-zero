import { act, render, screen, userEvent } from '@testing-library/react-native';
import React, { useState } from 'react';
import { appIdentity } from '@root/app.identity';
import { AppRuntimeProvider, useToast } from '@/core/runtime';
import {
  AppText,
  Button,
  ConfirmDialog,
  KeyboardStickyFooter,
  Screen,
  Select,
  Switch,
} from '@/core/ui';
import { createTestRuntime } from '../helpers/create-test-runtime';

const noPrivacyRuntimeOptions = {
  identity: {
    ...appIdentity,
    compliance: {
      ...appIdentity.compliance,
      requirePrivacyConsent: false,
      requirePermissionRationale: false,
    },
  },
  overrides: {
    initialDeviceLocale: 'zh-CN',
  },
};

describe('Seam 1 - Keyboard Controller Screen, Form Controls & Feedback Primitives', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders scrollable Screen with KeyboardAwareScrollView and KeyboardStickyFooter', async () => {
    const runtime = createTestRuntime(noPrivacyRuntimeOptions);

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <Screen scrollable keyboardBottomOffset={32}>
          <AppText>长表单内容区域</AppText>
        </Screen>
        <KeyboardStickyFooter>
          <Button label="吸底提交" onPress={() => undefined} />
        </KeyboardStickyFooter>
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('长表单内容区域')).toBeTruthy();
    expect(screen.getByRole('button', { name: '吸底提交' })).toBeTruthy();
  });

  it('toggles Switch value and respects disabled state', async () => {
    const user = userEvent.setup();
    const runtime = createTestRuntime(noPrivacyRuntimeOptions);

    function SwitchHarness(): React.JSX.Element {
      const [enabled, setEnabled] = useState(false);
      return (
        <Screen>
          <Switch
            label="接收消息提醒"
            description="开启后即时推送重要审批"
            value={enabled}
            onValueChange={setEnabled}
            testID="notify-switch"
          />
          <Switch
            label="锁定项"
            value={true}
            disabled
            onValueChange={() => {
              throw new Error('disabled switch must not trigger');
            }}
            testID="disabled-switch"
          />
          <AppText>{enabled ? 'SWITCH_ON' : 'SWITCH_OFF'}</AppText>
        </Screen>
      );
    }

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <SwitchHarness />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('SWITCH_OFF')).toBeTruthy();
    await user.press(screen.getByTestId('notify-switch'));
    expect(screen.getByText('SWITCH_ON')).toBeTruthy();

    await user.press(screen.getByTestId('disabled-switch'));
    expect(screen.getByText('SWITCH_ON')).toBeTruthy();
  });

  it('opens BottomSheet options in Select, picks a value, and displays validation error', async () => {
    const user = userEvent.setup();
    const runtime = createTestRuntime(noPrivacyRuntimeOptions);

    function SelectHarness(): React.JSX.Element {
      const [role, setRole] = useState<'admin' | 'member' | null>(null);
      return (
        <Screen>
          <Select
            label="成员角色"
            placeholder="请选择角色"
            value={role}
            onChange={setRole}
            error={role ? undefined : '角色为必填项'}
            options={[
              { label: '管理员', value: 'admin', description: '拥有全部配置权限' },
              { label: '普通成员', value: 'member' },
            ]}
            testID="role-select"
          />
          <AppText>{role ? `ROLE:${role}` : 'ROLE:NONE'}</AppText>
        </Screen>
      );
    }

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <SelectHarness />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('角色为必填项')).toBeTruthy();
    await user.press(screen.getByTestId('role-select'));
    expect(await screen.findByText('拥有全部配置权限')).toBeTruthy();

    await user.press(screen.getByText('管理员'));
    expect(await screen.findByText('ROLE:admin')).toBeTruthy();
    expect(screen.queryByText('角色为必填项')).toBeNull();
  });

  it('handles ConfirmDialog cancel and destructive confirm actions', async () => {
    const user = userEvent.setup();
    const runtime = createTestRuntime(noPrivacyRuntimeOptions);
    const onConfirmed = jest.fn();

    function DialogHarness(): React.JSX.Element {
      const [visible, setVisible] = useState(false);
      return (
        <Screen>
          <Button label="删除草稿" onPress={() => setVisible(true)} />
          <ConfirmDialog
            visible={visible}
            title="确认删除草稿？"
            description="删除后无法恢复"
            confirmLabel="确认删除"
            destructive
            onCancel={() => setVisible(false)}
            onConfirm={() => {
              onConfirmed();
              setVisible(false);
            }}
          />
        </Screen>
      );
    }

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <DialogHarness />
      </AppRuntimeProvider>,
    );

    await user.press(screen.getByRole('button', { name: '删除草稿' }));
    expect(await screen.findByText('确认删除草稿？')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: '取消' }));
    expect(onConfirmed).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: '删除草稿' }));
    await user.press(await screen.findByRole('button', { name: '确认删除' }));
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it('shows global Toast via useToast and auto-dismisses after durationMs', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const runtime = createTestRuntime(noPrivacyRuntimeOptions);

    function ToastHarness(): React.JSX.Element {
      const toast = useToast();
      return (
        <Screen>
          <Button
            label="触发提示"
            onPress={() =>
              toast.show({
                message: '配置已保存',
                tone: 'success',
                durationMs: 1500,
              })
            }
          />
        </Screen>
      );
    }

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <ToastHarness />
      </AppRuntimeProvider>,
    );

    await user.press(screen.getByRole('button', { name: '触发提示' }));
    expect(await screen.findByText('配置已保存')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1600);
    });
    expect(screen.queryByText('配置已保存')).toBeNull();
  });
});
