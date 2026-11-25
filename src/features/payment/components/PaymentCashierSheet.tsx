/**
 * @module features/payment/components/PaymentCashierSheet
 * 职责：Starter Slice 默认可复用收银台弹窗，基于 core/ui BottomSheetModal 展示金额与经交集过滤后的支付渠道列表。
 * 边界：与 core/capabilities/payment 内核严格解耦，执行 --clean-starter 时可整体移除。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ResolvedPaymentChannel } from '@/core/capabilities/payment';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, BottomSheetModal, Button, HStack, VStack } from '@/core/ui';
import { appTranslationResources } from '@/shared';

export interface PaymentCashierSheetProps {
  visible: boolean;
  amountLabel: string;
  orderTitle: string;
  channels: readonly ResolvedPaymentChannel[];
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (channel: ResolvedPaymentChannel) => void;
}

const UNAVAILABLE_REASON_KEYS: Record<
  NonNullable<ResolvedPaymentChannel['unavailableReason']>,
  string
> = {
  APP_NOT_INSTALLED: 'checkout.unavailableAppNotInstalled',
  DRIVER_NOT_REGISTERED: 'checkout.unavailableDriverNotRegistered',
  NOT_SUPPORTED: 'checkout.unavailableNotSupported',
};

function resolveChannelIcon(iconKey?: string): React.ComponentProps<typeof Ionicons>['name'] {
  switch (iconKey) {
    case 'wechat':
      return 'chatbubble-ellipses-outline';
    case 'alipay':
      return 'wallet-outline';
    case 'web':
      return 'globe-outline';
    case 'card':
      return 'card-outline';
    case 'coupon':
      return 'pricetag-outline';
    default:
      return 'cash-outline';
  }
}

export function PaymentCashierSheet({
  visible,
  amountLabel,
  orderTitle,
  channels,
  submitting = false,
  onClose,
  onConfirm,
}: PaymentCashierSheetProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  if (!i18n.exists('checkout.sheetTitle')) {
    i18n.addResourceBundle('zh-CN', 'translation', appTranslationResources['zh-CN'], true, false);
    i18n.addResourceBundle('en-US', 'translation', appTranslationResources['en-US'], true, false);
  }
  const { tokens } = useAppTheme();
  const [selectedCode, setSelectedCode] = useState<string | undefined>(undefined);

  const activeChannel =
    channels.find((item) => item.channelCode === selectedCode && item.available) ??
    channels.find((item) => item.available);

  return (
    <BottomSheetModal visible={visible} title={t('checkout.sheetTitle')} onClose={onClose}>
      <VStack gap="md">
        <VStack
          align="center"
          gap="xs"
          style={[
            styles.amountBox,
            {
              backgroundColor: tokens.colors.surfaceMuted,
              borderRadius: tokens.radii.lg,
            },
          ]}
        >
          <AppText variant="caption" tone="secondary">
            {orderTitle}
          </AppText>
          <AppText variant="titleLg" weight="700">
            {amountLabel}
          </AppText>
        </VStack>

        <VStack gap="sm">
          {channels.map((channel) => {
            const isSelected = channel.channelCode === activeChannel?.channelCode;
            const disabled = !channel.available || submitting;
            const unavailableText = channel.unavailableReason
              ? t(UNAVAILABLE_REASON_KEYS[channel.unavailableReason])
              : t('checkout.unavailableDefault');

            return (
              <Pressable
                key={channel.channelCode}
                testID={`cashier-channel-${channel.channelCode}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled }}
                disabled={disabled}
                onPress={() => setSelectedCode(channel.channelCode)}
                style={[
                  styles.channelRow,
                  {
                    borderColor: isSelected ? tokens.colors.primary : tokens.colors.border,
                    backgroundColor: isSelected
                      ? tokens.colors.surfaceMuted
                      : tokens.colors.surface,
                    borderRadius: tokens.radii.md,
                    opacity: channel.available ? 1 : 0.48,
                  },
                ]}
              >
                <HStack align="center" justify="space-between" gap="md">
                  <HStack align="center" gap="sm" flex={1}>
                    <Ionicons
                      name={resolveChannelIcon(channel.iconKey)}
                      size={20}
                      color={isSelected ? tokens.colors.primary : tokens.colors.textPrimary}
                    />
                    <VStack flex={1} gap="xs">
                      <HStack align="center" gap="xs" style={styles.titleRow}>
                        <AppText
                          variant="bodyMd"
                          weight="600"
                          numberOfLines={1}
                          style={styles.channelName}
                        >
                          {channel.displayName}
                        </AppText>
                        {channel.gatewayTag ? (
                          <View
                            style={[
                              styles.tag,
                              {
                                backgroundColor: tokens.colors.surfaceMuted,
                                borderRadius: tokens.radii.sm,
                              },
                            ]}
                          >
                            <AppText variant="caption" tone="secondary">
                              {channel.gatewayTag}
                            </AppText>
                          </View>
                        ) : null}
                      </HStack>
                      <AppText variant="caption" tone="secondary">
                        {channel.available
                          ? (channel.subtitle ?? channel.driverId)
                          : unavailableText}
                      </AppText>
                    </VStack>
                  </HStack>
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={isSelected ? tokens.colors.primary : tokens.colors.textSecondary}
                  />
                </HStack>
              </Pressable>
            );
          })}
        </VStack>

        <Button
          testID="cashier-confirm-pay"
          label={
            submitting
              ? t('checkout.confirmPaying')
              : t('checkout.confirmPayButton', { amount: amountLabel })
          }
          loading={submitting}
          disabled={!activeChannel || submitting}
          onPress={() => {
            if (activeChannel) {
              onConfirm(activeChannel);
            }
          }}
        />
      </VStack>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  amountBox: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  channelRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  titleRow: {
    flexWrap: 'nowrap',
  },
  channelName: {
    flexShrink: 1,
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
