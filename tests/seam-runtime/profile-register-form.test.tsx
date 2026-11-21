import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { AppRuntimeProvider } from '@/core/runtime';
import { formatDateYmd, getDaysInMonth } from '@/core/ui';
import { ProfileRegisterDemoScreen, type ProfileRegisterFormValues } from '@/features/demo';
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

describe('Seam: DatePickerField pure helpers', () => {
  it('computes leap year days and formats YYYY-MM-DD', () => {
    expect(getDaysInMonth(2024, 2)).toBe(29);
    expect(getDaysInMonth(2025, 2)).toBe(28);
    expect(formatDateYmd(1998, 5, 9)).toBe('1998-05-09');
  });
});

describe('Seam: ProfileRegisterDemoScreen', () => {
  it('validates required fields and submits full profile with date, region, and switch', async () => {
    const runtime = createRuntime();
    const submitted: ProfileRegisterFormValues[] = [];

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <ProfileRegisterDemoScreen onSubmitted={(values) => submitted.push(values)} />
      </AppRuntimeProvider>,
    );

    // 1. Submitting empty form shows validation errors and blocks submit
    await fireEvent.press(screen.getByText('提交注册资料'));
    expect(await screen.findByText('请输入至少 2 个字的昵称')).toBeTruthy();
    expect(submitted).toHaveLength(0);

    // 2. Fill nickname, phone, address
    await fireEvent.changeText(screen.getByTestId('register-nickname-input'), '少数派读者');
    await fireEvent.changeText(screen.getByTestId('register-phone-input'), '13800138000');
    await fireEvent.changeText(
      screen.getByTestId('register-address-input'),
      '科技园南区高新南一道 88 号',
    );

    // 3. Pick birthday via DatePickerField
    await fireEvent.press(screen.getByTestId('register-birthday-picker'));
    await fireEvent.press(screen.getByTestId('register-birthday-picker-year-1998'));
    await fireEvent.press(screen.getByTestId('register-birthday-picker-month-5'));
    await fireEvent.press(screen.getByTestId('register-birthday-picker-day-18'));
    await fireEvent.press(screen.getByTestId('register-birthday-picker-confirm'));
    expect(screen.getByText('1998-05-18')).toBeTruthy();

    // 4. Pick region via cascading RegionPickerField
    await fireEvent.press(screen.getByTestId('register-region-picker'));
    await fireEvent.press(screen.getByTestId('register-region-picker-option-广东省'));
    await fireEvent.press(screen.getByTestId('register-region-picker-option-深圳市'));
    await fireEvent.press(screen.getByTestId('register-region-picker-option-南山区'));
    expect(screen.getByText('广东省 / 深圳市 / 南山区')).toBeTruthy();

    // 5. Agree terms & submit
    await fireEvent(screen.getByTestId('register-terms-switch'), 'valueChange', true);
    await fireEvent.press(screen.getByText('提交注册资料'));

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]).toMatchObject({
      nickname: '少数派读者',
      phone: '13800138000',
      birthday: '1998-05-18',
      region: '广东省 / 深圳市 / 南山区',
      agreedTerms: true,
    });
    expect(screen.getByTestId('register-submit-summary')).toBeTruthy();
  });
});
