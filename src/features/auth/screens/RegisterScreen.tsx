/**
 * @module features/auth/screens/RegisterScreen
 * 职责：完整用户资料注册表单示范页，集中展示头像上传（Media Capability）、文本输入、下拉单选、日期选择（DatePickerField）、
 * 省市区三级联动地址选择（RegionPickerField）、协议开关与 Zod 校验联动。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { useMediaCapability } from '@/core/capabilities/media';
import { useAppRuntime, useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  AppImage,
  AppText,
  Box,
  DatePickerField,
  FormTemplate,
  RegionPickerField,
  Select,
  Switch,
  TextField,
  VStack,
  type SelectOption,
} from '@/core/ui';

const GENDER_OPTIONS: readonly SelectOption<'male' | 'female' | 'secret'>[] = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
  { label: '保密', value: 'secret' },
];

const registerSchema = z.object({
  avatarUri: z.string().optional(),
  nickname: z.string().trim().min(2, '请输入至少 2 个字的昵称').max(20, '昵称不超过 20 个字'),
  phone: z
    .string()
    .trim()
    .regex(/^1\d{10}$/, '请输入有效的 11 位手机号'),
  password: z
    .string()
    .optional()
    .refine((val) => !val || val.trim().length >= 6, '登录密码至少 6 位'),
  gender: z.enum(['male', 'female', 'secret']),
  birthday: z.string().min(1, '请选择出生日期'),
  region: z.string().min(1, '请选择所在地区'),
  addressDetail: z.string().trim().min(4, '请填写详细街道/门牌号（至少 4 个字）'),
  agreedTerms: z.boolean().refine((val) => val, '请先同意用户注册协议与隐私条款'),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;

export interface RegisterScreenProps {
  onBack?: () => void;
  onSubmitted?: (values: RegisterFormValues) => void;
}

export function RegisterScreen({
  onBack,
  onSubmitted,
}: RegisterScreenProps = {}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const { httpClient } = useAppRuntime();
  const media = useMediaCapability();
  const toast = useToast();
  const [submittedValues, setSubmittedValues] = useState<RegisterFormValues | null>(null);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState('');

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange',
    defaultValues: {
      avatarUri: '',
      nickname: '',
      phone: '',
      password: '',
      gender: 'secret',
      birthday: '',
      region: '',
      addressDetail: '',
      agreedTerms: false,
    },
  });

  const avatarUri = useWatch({ control, name: 'avatarUri' });
  const effectiveAvatarUri = avatarPreviewUri || avatarUri || '';

  const handlePickAvatar = async (): Promise<void> => {
    try {
      const asset = await media.pickImageWithPermission(
        {
          title: '相册权限说明',
          description: '用于从手机相册选择您的个人头像图片。',
        },
        { allowsEditing: true },
      );
      if (!asset) {
        return;
      }
      const normalizedUri =
        asset.uri.startsWith('/') && !asset.uri.startsWith('//')
          ? `file://${asset.uri}`
          : asset.uri;
      setAvatarPreviewUri(normalizedUri);
      setValue('avatarUri', normalizedUri, { shouldDirty: true, shouldValidate: true });
      toast.show({ message: '头像已选取', tone: 'success' });
    } catch (error) {
      toast.show({
        message: error instanceof Error ? error.message : '选取头像失败，请重试',
        tone: 'danger',
      });
    }
  };

  const submitForm = handleSubmit(async (values) => {
    try {
      await httpClient.post(
        '/auth/register',
        {
          username: values.phone,
          password: values.password?.trim() || 'password123',
          displayName: values.nickname,
        },
        { skipAuth: true },
      );
      setSubmittedValues(values);
      onSubmitted?.(values);
      toast.show({ message: `注册成功，可使用手机号 ${values.phone} 登录`, tone: 'success' });
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : '注册失败，请稍后重试',
        tone: 'danger',
      });
    }
  });

  return (
    <FormTemplate
      title="注册账号"
      onBack={onBack}
      submitLabel="提交注册资料"
      submitting={isSubmitting}
      onSubmit={() => {
        void submitForm();
      }}
    >
      {/* 1. 头像上传区 */}
      <VStack
        p="md"
        gap="sm"
        bg="surface"
        radius="lg"
        bordered
        align="center"
        style={styles.avatarCard}
      >
        <Pressable
          testID="register-avatar-picker"
          accessibilityRole="button"
          accessibilityLabel="上传头像"
          onPress={() => {
            void handlePickAvatar();
          }}
          style={({ pressed }) => [styles.avatarPressable, pressed && styles.pressed]}
        >
          {effectiveAvatarUri ? (
            <View style={styles.avatarImageWrap}>
              <AppImage
                key={effectiveAvatarUri}
                uri={effectiveAvatarUri}
                width={76}
                height={76}
                borderRadius={38}
              />
            </View>
          ) : (
            <View
              style={[
                styles.avatarPlaceholder,
                { backgroundColor: tokens.colors.primarySoft, borderRadius: tokens.radii.full },
              ]}
            >
              <Ionicons name="camera-outline" size={28} color={tokens.colors.primary} />
            </View>
          )}
          <View
            style={[
              styles.avatarBadge,
              { backgroundColor: tokens.colors.primary, borderColor: tokens.colors.surface },
            ]}
          >
            <Ionicons name="add" size={14} color="#FFFFFF" />
          </View>
        </Pressable>
        <AppText variant="bodySm" weight="600">
          {avatarUri ? '点击更换头像' : '点击上传个人头像'}
        </AppText>
        <AppText variant="caption" tone="secondary">
          支持从相册选取本地图片并实时预览
        </AppText>
      </VStack>

      {/* 2. 基础资料 */}
      <VStack p="md" gap="md" bg="surface" radius="lg" bordered>
        <AppText variant="bodySm" weight="700">
          基础资料
        </AppText>

        <Controller
          control={control}
          name="nickname"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              testID="register-nickname-input"
              label="昵称"
              placeholder="请输入 2-20 字昵称"
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              errorMessage={errors.nickname?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="phone"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              testID="register-phone-input"
              label="手机号"
              placeholder="请输入 11 位手机号"
              keyboardType="phone-pad"
              maxLength={11}
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              errorMessage={errors.phone?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              testID="register-password-input"
              label="登录密码（选填，默认 password123）"
              placeholder="设置 6 位以上登录密码"
              secureTextEntry
              value={value ?? ''}
              onBlur={onBlur}
              onChangeText={onChange}
              errorMessage={errors.password?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="gender"
          render={({ field: { onChange, value } }) => (
            <Select
              testID="register-gender-select"
              label="性别"
              options={GENDER_OPTIONS}
              value={value}
              onChange={onChange}
              error={errors.gender?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="birthday"
          render={({ field: { onChange, value } }) => (
            <DatePickerField
              testID="register-birthday-picker"
              label="出生日期"
              placeholder="请选择出生日期"
              value={value}
              onChange={onChange}
              error={errors.birthday?.message}
            />
          )}
        />
      </VStack>

      {/* 3. 地址信息 */}
      <VStack p="md" gap="md" bg="surface" radius="lg" bordered>
        <AppText variant="bodySm" weight="700">
          联系地址
        </AppText>

        <Controller
          control={control}
          name="region"
          render={({ field: { onChange, value } }) => (
            <RegionPickerField
              testID="register-region-picker"
              label="所在地区"
              placeholder="请选择省 / 市 / 区"
              value={value}
              onChange={onChange}
              error={errors.region?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="addressDetail"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              testID="register-address-input"
              label="详细地址"
              placeholder="街道、楼栋、门牌号"
              multiline
              value={value}
              onBlur={onBlur}
              onChangeText={onChange}
              errorMessage={errors.addressDetail?.message}
            />
          )}
        />
      </VStack>

      {/* 4. 协议确认 */}
      <VStack p="md" gap="xs" bg="surface" radius="lg" bordered>
        <Controller
          control={control}
          name="agreedTerms"
          render={({ field: { onChange, value } }) => (
            <Switch
              testID="register-terms-switch"
              label="同意用户注册协议与隐私条款"
              description="开启后即允许提交上述个人资料用于账号注册示范"
              value={value}
              onValueChange={onChange}
            />
          )}
        />
        {errors.agreedTerms?.message ? (
          <AppText variant="caption" tone="danger">
            {errors.agreedTerms.message}
          </AppText>
        ) : null}
      </VStack>

      {/* 5. 提交结果预览（便于真机核验所有字段值） */}
      {submittedValues ? (
        <Box testID="register-submit-summary" p="md" bg="surfaceMuted" radius="lg" bordered>
          <VStack gap="xs">
            <AppText variant="bodySm" tone="success" weight="700">
              最近一次提交结果
            </AppText>
            <AppText variant="caption" tone="secondary">
              昵称：{submittedValues.nickname} · 手机：{submittedValues.phone}
            </AppText>
            <AppText variant="caption" tone="secondary">
              生日：{submittedValues.birthday} · 地区：{submittedValues.region}
            </AppText>
            <AppText variant="caption" tone="secondary">
              地址：{submittedValues.addressDetail}
            </AppText>
          </VStack>
        </Box>
      ) : null}
    </FormTemplate>
  );
}

const styles = StyleSheet.create({
  avatarCard: {
    width: '100%',
  },
  avatarPressable: {
    position: 'relative',
  },
  avatarImageWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: 'hidden',
  },
  avatarPlaceholder: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
