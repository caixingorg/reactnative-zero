/**
 * @module core/ui/RegionPickerField
 * 职责：通用省/市/区三级联动地址选择表单项，复用 BottomSheetModal 与面包屑切换，支持自定义地区树或开箱内置常用城市数据。
 * 边界：仅输出选中地区元组与拼接展示文本，不耦合后端行政区划编码协议。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';
import { BottomSheetModal } from './BottomSheetModal';
import { HStack, VStack } from './Stack';

export interface RegionNode {
  name: string;
  children?: readonly RegionNode[];
}

export const DEFAULT_CHINA_REGIONS: readonly RegionNode[] = [
  {
    name: '广东省',
    children: [
      {
        name: '深圳市',
        children: [{ name: '南山区' }, { name: '福田区' }, { name: '宝安区' }, { name: '龙华区' }],
      },
      {
        name: '广州市',
        children: [{ name: '天河区' }, { name: '海珠区' }, { name: '越秀区' }, { name: '番禺区' }],
      },
    ],
  },
  {
    name: '北京市',
    children: [
      {
        name: '北京市',
        children: [{ name: '朝阳区' }, { name: '海淀区' }, { name: '东城区' }, { name: '西城区' }],
      },
    ],
  },
  {
    name: '上海市',
    children: [
      {
        name: '上海市',
        children: [
          { name: '浦东新区' },
          { name: '徐汇区' },
          { name: '静安区' },
          { name: '黄浦区' },
        ],
      },
    ],
  },
  {
    name: '浙江省',
    children: [
      {
        name: '杭州市',
        children: [{ name: '西湖区' }, { name: '余杭区' }, { name: '滨江区' }, { name: '拱墅区' }],
      },
      {
        name: '宁波市',
        children: [{ name: '鄞州区' }, { name: '海曙区' }, { name: '江北区' }],
      },
    ],
  },
  {
    name: '四川省',
    children: [
      {
        name: '成都市',
        children: [{ name: '高新区' }, { name: '武侯区' }, { name: '锦江区' }, { name: '青羊区' }],
      },
    ],
  },
];

export interface RegionPickerFieldProps {
  label?: string;
  placeholder?: string;
  modalTitle?: string;
  regions?: readonly RegionNode[];
  /** 已选地区字符串，例如 "广东省 / 深圳市 / 南山区"。 */
  value?: string | null;
  onChange: (nextRegion: string) => void;
  error?: string;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function RegionPickerField({
  label,
  placeholder = '请选择所在地区',
  modalTitle,
  regions = DEFAULT_CHINA_REGIONS,
  value,
  onChange,
  error,
  disabled = false,
  testID,
  style,
}: RegionPickerFieldProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [province, setProvince] = useState<RegionNode | null>(null);
  const [city, setCity] = useState<RegionNode | null>(null);

  const currentList = useMemo<readonly RegionNode[]>(() => {
    if (step === 0) {
      return regions;
    }
    if (step === 1) {
      return province?.children ?? [];
    }
    return city?.children ?? [];
  }, [city, province, regions, step]);

  const handleOpen = (): void => {
    setStep(0);
    setProvince(null);
    setCity(null);
    setOpen(true);
  };

  const handlePickNode = (node: RegionNode): void => {
    if (step === 0) {
      setProvince(node);
      setCity(null);
      if (node.children && node.children.length > 0) {
        setStep(1);
      } else {
        onChange(node.name);
        setOpen(false);
      }
      return;
    }

    if (step === 1) {
      setCity(node);
      if (node.children && node.children.length > 0) {
        setStep(2);
      } else {
        onChange([province?.name, node.name].filter(Boolean).join(' / '));
        setOpen(false);
      }
      return;
    }

    const fullPath = [province?.name, city?.name, node.name].filter(Boolean).join(' / ');
    onChange(fullPath);
    setOpen(false);
  };

  return (
    <View style={[styles.container, { gap: tokens.spacing.xs }, style]}>
      {label ? (
        <AppText variant="bodySm" weight="600" tone="secondary">
          {label}
        </AppText>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        testID={testID}
        onPress={handleOpen}
        style={[
          styles.trigger,
          {
            backgroundColor: disabled ? tokens.colors.surfaceMuted : tokens.colors.surface,
            borderColor: error ? tokens.colors.danger : tokens.colors.border,
            borderRadius: tokens.radii.md,
            paddingHorizontal: tokens.spacing.md,
          },
        ]}
      >
        <AppText
          variant="bodyMd"
          tone={value ? 'primary' : 'secondary'}
          numberOfLines={1}
          style={styles.flex}
        >
          {value || placeholder}
        </AppText>
        <Ionicons name="location-outline" size={18} color={tokens.colors.textSecondary} />
      </Pressable>

      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : null}

      <BottomSheetModal
        visible={open}
        title={modalTitle ?? label ?? '选择所在地区'}
        onClose={() => setOpen(false)}
      >
        <VStack gap="md">
          <HStack
            gap="md"
            style={[styles.breadcrumbs, { borderBottomColor: tokens.colors.border }]}
          >
            <Pressable onPress={() => setStep(0)} style={styles.crumbBtn}>
              <AppText
                variant="bodySm"
                tone={step === 0 ? 'brand' : 'primary'}
                weight={step === 0 ? '700' : '500'}
              >
                {province?.name ?? '请选择省份'}
              </AppText>
            </Pressable>
            {province ? (
              <Pressable onPress={() => setStep(1)} style={styles.crumbBtn}>
                <AppText
                  variant="bodySm"
                  tone={step === 1 ? 'brand' : 'primary'}
                  weight={step === 1 ? '700' : '500'}
                >
                  {city?.name ?? '请选择城市'}
                </AppText>
              </Pressable>
            ) : null}
            {city ? (
              <View style={styles.crumbBtn}>
                <AppText variant="bodySm" tone="brand" weight="700">
                  请选择区县
                </AppText>
              </View>
            ) : null}
          </HStack>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {currentList.map((node) => (
              <Pressable
                key={node.name}
                testID={testID ? `${testID}-option-${node.name}` : undefined}
                onPress={() => handlePickNode(node)}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: tokens.colors.border },
                  pressed && { backgroundColor: tokens.colors.surfaceMuted },
                ]}
              >
                <AppText variant="bodyMd">{node.name}</AppText>
                <Ionicons name="chevron-forward" size={16} color={tokens.colors.textSecondary} />
              </Pressable>
            ))}
          </ScrollView>
        </VStack>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  flex: {
    flex: 1,
  },
  trigger: {
    minHeight: 44,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  breadcrumbs: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  crumbBtn: {
    paddingVertical: 4,
  },
  list: {
    maxHeight: 260,
  },
  row: {
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
