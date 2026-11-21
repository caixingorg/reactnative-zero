import type { NetworkInterfaceInfo } from 'node:os';

export type PreflightLevel = 'error' | 'warn';

export type PreflightEnv = Readonly<Record<string, string | undefined>>;

export interface PreflightIssue {
  level: PreflightLevel;
  code: 'non-ascii-project-path' | 'proxy-virtual-interface';
  message: string;
}

export interface EnvPreflightInput {
  projectRoot: string;
  networkInterfaces: NodeJS.Dict<NetworkInterfaceInfo[]>;
  env: PreflightEnv;
}

// 原因：CocoaPods 在加载 hermes-engine.podspec 时会把 node 子进程输出（BINARY 编码）与含中文的 UTF-8 路径拼接，
// 抛出 "incompatible character encodings" 导致 pod install 失败；Gradle/NDK/CMake 对非 ASCII 路径同样不稳定
export function findNonAsciiProjectPathIssue(projectRoot: string): PreflightIssue | null {
  if ([...projectRoot].every((char) => (char.codePointAt(0) ?? 0) <= 0x7f)) {
    return null;
  }
  return {
    level: 'error',
    code: 'non-ascii-project-path',
    message: [
      `项目路径包含非 ASCII 字符（如中文）：${projectRoot}`,
      'CocoaPods 加载 hermes-engine.podspec 时会因编码不兼容而失败，Android Gradle/NDK 也可能异常。',
      '请将项目移动到纯英文路径（例如 ~/dev/my-app）后重试。',
    ].join('\n'),
  };
}

// 原因：Clash/Surge 等代理的 TUN / fake-IP 模式会创建 198.18.0.0/15 段虚拟网卡并接管默认路由，
// Expo CLI 会把该地址写进 dev client 的 Metro URL，导致模拟器/真机连不上开发服务器
function isProxyVirtualAddress(address: string): boolean {
  const [first, second] = address.split('.').map(Number);
  return first === 198 && (second === 18 || second === 19);
}

export function findProxyVirtualInterfaceIssue(
  networkInterfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
  env: PreflightEnv,
): PreflightIssue | null {
  if (env.REACT_NATIVE_PACKAGER_HOSTNAME?.trim()) {
    return null;
  }
  const proxyAddress = Object.values(networkInterfaces)
    .flatMap((entries) => entries ?? [])
    .find(
      (entry) => entry.family === 'IPv4' && !entry.internal && isProxyVirtualAddress(entry.address),
    )?.address;

  if (!proxyAddress) {
    return null;
  }
  return {
    level: 'warn',
    code: 'proxy-virtual-interface',
    message: [
      `检测到代理虚拟网卡地址 ${proxyAddress}（TUN / fake-IP 模式），dev client 可能拿到该地址而连不上 Metro。`,
      '模拟器调试：REACT_NATIVE_PACKAGER_HOSTNAME=localhost pnpm ios',
      '真机调试：关闭代理 TUN 模式，或设置 REACT_NATIVE_PACKAGER_HOSTNAME=<本机局域网 IP>',
    ].join('\n'),
  };
}

export function runEnvPreflight(input: EnvPreflightInput): PreflightIssue[] {
  return [
    findNonAsciiProjectPathIssue(input.projectRoot),
    findProxyVirtualInterfaceIssue(input.networkInterfaces, input.env),
  ].filter((issue): issue is PreflightIssue => issue !== null);
}
