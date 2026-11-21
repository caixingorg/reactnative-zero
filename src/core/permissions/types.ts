export type SensitivePermissionKind =
  'camera' | 'photoLibrary' | 'mediaLibrary' | 'location' | 'notifications';

export type OsPermissionStatus = 'undetermined' | 'granted' | 'denied_ask_again' | 'denied_blocked';

export interface PermissionRationaleCopy {
  title: string;
  description: string;
}

// 原因：各原生能力模块自行提供底层权限探针，避免内核权限协调器硬编码具体 Expo 硬件包导致物理删除能力目录时编译断裂
export interface CapabilityPermissionProbe {
  getStatus(): Promise<OsPermissionStatus>;
  requestPermission(): Promise<OsPermissionStatus>;
}

export interface PermissionOsDriver {
  getStatus(kind: SensitivePermissionKind): Promise<OsPermissionStatus>;
  requestOsPermission(kind: SensitivePermissionKind): Promise<OsPermissionStatus>;
  openSystemSettings(): Promise<void>;
}

export interface PermissionRequestSpec {
  kind: SensitivePermissionKind;
  rationale: PermissionRationaleCopy;
  nativeProbe?: CapabilityPermissionProbe;
}

export interface PermissionRequestOutcome {
  granted: boolean;
  status: OsPermissionStatus;
  cancelledByRationale?: boolean;
}

export interface PermissionCoordinator {
  requestPermissionWithRationale(spec: PermissionRequestSpec): Promise<PermissionRequestOutcome>;
  runIfPermitted<T>(
    options: {
      enabled: boolean;
      kind: SensitivePermissionKind;
      rationale: PermissionRationaleCopy;
      nativeProbe?: CapabilityPermissionProbe;
    },
    action: () => Promise<T | null>,
  ): Promise<T | null>;
}

export interface RawExpoPermissionShape {
  granted: boolean;
  status: string;
  canAskAgain?: boolean;
}

export function mapExpoPermissionResponse(response: RawExpoPermissionShape): OsPermissionStatus {
  if (response.granted) {
    return 'granted';
  }
  if (response.status === 'undetermined') {
    return 'undetermined';
  }
  if (response.canAskAgain === false) {
    return 'denied_blocked';
  }
  return 'denied_ask_again';
}
