import { render } from '@testing-library/react-native';
import React from 'react';
import { AppRuntimeProvider } from '@/core/runtime';
import { LoginScreen } from '@/features/auth';
import { MessagesScreen } from '@/features/messages';
import { ProfileScreen } from '@/features/profile';
import { createTestRuntime } from '../helpers/create-test-runtime';

describe('Shared Layer bilingual i18n migration (Ticket 08)', () => {
  it('renders localized English copy on LoginScreen, MessagesScreen, and ProfileScreen when language is en-US', async () => {
    const runtime = createTestRuntime({
      overrides: { initialDeviceLocale: 'en-US' },
    });
    await runtime.i18n.changeLanguage('en-US');

    const loginView = await render(
      <AppRuntimeProvider runtime={runtime}>
        <LoginScreen />
      </AppRuntimeProvider>,
    );
    expect(loginView.getByText('Welcome back, enter your credentials to continue')).toBeTruthy();
    expect(loginView.getByText('Forgot Password?')).toBeTruthy();
    await loginView.unmount();

    const messagesView = await render(
      <AppRuntimeProvider runtime={runtime}>
        <MessagesScreen />
      </AppRuntimeProvider>,
    );
    expect(messagesView.getByText('Alerts')).toBeTruthy();
    expect(messagesView.getByText('Activity')).toBeTruthy();
    expect(messagesView.getByText('Direct')).toBeTruthy();
    await messagesView.unmount();

    const profileView = await render(
      <AppRuntimeProvider runtime={runtime}>
        <ProfileScreen />
      </AppRuntimeProvider>,
    );
    expect(profileView.getByText('Saved')).toBeTruthy();
    expect(profileView.getByText('History')).toBeTruthy();
    expect(profileView.getByText('Posts')).toBeTruthy();
    await profileView.unmount();
  });
});
