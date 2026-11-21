/**
 * @module config/capability-permission-matrix
 * 职责：构建期能力开关到原生权限/文案映射的单一事实源，供 expo-config-resolver 与 with-capability-manifest-sanitizer 共同消费，消除双份维护漂移。
 */
import type { AppVariant, CapabilityFlags } from '../src/core/config/types';

export const CAPABILITY_USAGE_TEXTS = {
  camera: '需要使用相机进行拍照采集及扫描二维码/条形码。',
  microphone: '需要使用麦克风进行音视频录制交互。',
  photoLibrary: '需要访问相册以选择并上传图片资料。',
  mediaSave: '需要向系统相册保存生成的图片或海报。',
  location: '需要在您使用期间获取当前位置以提供周边业务服务。',
  faceId: '需要使用面容 ID 进行快捷安全核身验证。',
} as const;

// 原因：底座仅使用系统照片选择器、前台定位与前台录音，始终阻断高拒审风险的全盘媒体读取与后台/前台服务权限
export const ALWAYS_BLOCKED_ANDROID_PERMISSIONS = [
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.ACTIVITY_RECOGNITION',
  'com.google.android.gms.permission.ACTIVITY_RECOGNITION',
  // 原因：Android 13+ 使用免权限系统 Photo Picker，Google Play 政策禁止一次性选图应用声明以下两项
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  // 原因：底座不提供后台录音，始终阻断麦克风前台服务类型权限
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
] as const;

// 原因：后台音频依赖音视频能力；resolver 与清单清洗共用此判定，避免两处开关不一致导致声明被静默剥离
export function isBackgroundAudioEnabled(capabilities: CapabilityFlags): boolean {
  return capabilities.audioVideo && capabilities.backgroundAudio === true;
}

export function collectBlockedAndroidPermissions(
  capabilities: CapabilityFlags,
  appVariant: AppVariant,
): Set<string> {
  const blocked = new Set<string>(ALWAYS_BLOCKED_ANDROID_PERMISSIONS);

  if (appVariant === 'production') {
    blocked.add('android.permission.SYSTEM_ALERT_WINDOW');
  }
  if (!capabilities.camera) {
    blocked.add('android.permission.CAMERA');
  }
  if (!capabilities.photoLibrary) {
    blocked.add('android.permission.READ_EXTERNAL_STORAGE');
  }
  if (!capabilities.mediaLibrary) {
    blocked.add('android.permission.WRITE_EXTERNAL_STORAGE');
  }
  if (!capabilities.location) {
    blocked.add('android.permission.ACCESS_FINE_LOCATION');
    blocked.add('android.permission.ACCESS_COARSE_LOCATION');
  }
  if (!capabilities.audioVideo) {
    blocked.add('android.permission.RECORD_AUDIO');
    blocked.add('android.permission.MODIFY_AUDIO_SETTINGS');
  }
  if (!isBackgroundAudioEnabled(capabilities)) {
    blocked.add('android.permission.FOREGROUND_SERVICE');
    blocked.add('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK');
  }
  if (!capabilities.biometrics) {
    blocked.add('android.permission.USE_BIOMETRIC');
    blocked.add('android.permission.USE_FINGERPRINT');
  }
  if (!capabilities.notifications) {
    blocked.add('android.permission.POST_NOTIFICATIONS');
    blocked.add('android.permission.RECEIVE_BOOT_COMPLETED');
  }

  return blocked;
}
