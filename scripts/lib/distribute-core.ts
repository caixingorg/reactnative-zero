import fs from 'node:fs';
import path from 'node:path';
import { resolveAppVersion } from '../../config/app-version';
import type { AppVariant } from '../../src/core/config/types';

export type DistributePlatform = 'android' | 'ios';
export type ImWebhookType = 'feishu' | 'wecom' | 'dingtalk';

export interface DistributeOptions {
  platform: DistributePlatform;
  variant: AppVariant;
  channel: string;
  artifactPath?: string;
  appName: string;
  version: string;
  commitSha?: string;
  releaseNotes: string;
  pgyerApiKey?: string;
  downloadUrl?: string;
  qrCodeUrl?: string;
  webhookType?: ImWebhookType;
  webhookUrl?: string;
  dryRun?: boolean;
}

export interface PgyerUploadResult {
  buildKey: string;
  downloadUrl: string;
  qrCodeUrl: string;
}

export interface DistributeHttpRequest {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string | FormData;
}

export interface DistributeHttpResponse {
  status: number;
  data: unknown;
}

export type DistributeFetchDriver = (req: DistributeHttpRequest) => Promise<DistributeHttpResponse>;

export interface DistributeExecutionResult {
  dryRun: boolean;
  platform: DistributePlatform;
  variant: AppVariant;
  channel: string;
  downloadUrl: string;
  qrCodeUrl?: string;
  pgyerUploaded: boolean;
  webhookDelivered: boolean;
  webhookPayload?: Record<string, unknown>;
}

const VALID_PLATFORMS = new Set<DistributePlatform>(['android', 'ios']);
const VALID_VARIANTS = new Set<AppVariant>(['development', 'staging', 'production']);
const VALID_WEBHOOK_TYPES = new Set<ImWebhookType>(['feishu', 'wecom', 'dingtalk']);
const CHANNEL_REGEX = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

function assertValidHttpsUrl(rawUrl: string, fieldName: string): string {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid ${fieldName} "${rawUrl}": must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Invalid ${fieldName} "${rawUrl}": only https:// is permitted.`);
  }
  return trimmed;
}

function assertValidHttpUrl(rawUrl: string, fieldName: string): string {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid ${fieldName} "${rawUrl}": must be a valid HTTP/HTTPS URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid ${fieldName} "${rawUrl}": only http:// and https:// are supported.`);
  }
  return trimmed;
}

// 原因：统一解析命令行参数与 CI 环境变量，使本地开发、Fastlane 与 CI 与本地共享同一套参数契约
export function parseDistributeCliArgs(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
): DistributeOptions {
  let platformRaw = env.DISTRIBUTE_PLATFORM ?? 'android';
  let variantRaw = env.APP_VARIANT ?? 'staging';
  let channel = env.APP_CHANNEL ?? 'official';
  let artifactPath = env.DISTRIBUTE_ARTIFACT_PATH;
  let appName = env.DISTRIBUTE_APP_NAME ?? '企业移动底座';
  // 原因：缺省版本与二进制同源（APP_VERSION 或 package.json），避免通知里的版本与包内版本不一致
  let version = env.DISTRIBUTE_APP_VERSION ?? resolveAppVersion(env);
  let commitSha = env.CI_COMMIT_SHORT_SHA ?? env.GITHUB_SHA?.slice(0, 7);
  // 原因：发布流水线把 CHANGELOG 生成的说明写成文件传入，优先级低于显式的 DISTRIBUTE_RELEASE_NOTES，高于固定文案
  const notesFile = env.DISTRIBUTE_RELEASE_NOTES_FILE;
  const notesFromFile =
    notesFile && fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8').trim() : '';
  let releaseNotes = env.DISTRIBUTE_RELEASE_NOTES ?? (notesFromFile || '内网自动化构建提测包');
  let pgyerApiKey = env.PGYER_API_KEY;
  let downloadUrl = env.DISTRIBUTE_DOWNLOAD_URL;
  let qrCodeUrl = env.DISTRIBUTE_QRCODE_URL;
  let webhookTypeRaw = env.DISTRIBUTE_WEBHOOK_TYPE;
  let webhookUrl = env.DISTRIBUTE_WEBHOOK_URL;
  let dryRun = env.DISTRIBUTE_DRY_RUN === 'true';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const nextValue = (): string => {
      const val = argv[i + 1];
      if (val === undefined || val.startsWith('--')) {
        throw new Error(`Missing value for CLI flag "${arg}".`);
      }
      i += 1;
      return val;
    };

    switch (arg) {
      case '--platform':
        platformRaw = nextValue();
        break;
      case '--variant':
        variantRaw = nextValue();
        break;
      case '--channel':
        channel = nextValue();
        break;
      case '--artifact':
        artifactPath = nextValue();
        break;
      case '--app-name':
        appName = nextValue();
        break;
      case '--version':
        version = nextValue();
        break;
      case '--commit':
        commitSha = nextValue();
        break;
      case '--release-notes':
        releaseNotes = nextValue();
        break;
      case '--pgyer-api-key':
        pgyerApiKey = nextValue();
        break;
      case '--download-url':
        downloadUrl = nextValue();
        break;
      case '--qrcode-url':
        qrCodeUrl = nextValue();
        break;
      case '--webhook-type':
        webhookTypeRaw = nextValue();
        break;
      case '--webhook-url':
        webhookUrl = nextValue();
        break;
      case '--dry-run':
        dryRun = true;
        break;
      default:
        break;
    }
  }

  if (!VALID_PLATFORMS.has(platformRaw as DistributePlatform)) {
    throw new Error(`Invalid platform "${platformRaw}": expected "android" or "ios".`);
  }
  if (!VALID_VARIANTS.has(variantRaw as AppVariant)) {
    throw new Error(
      `Invalid variant "${variantRaw}": expected "development", "staging", or "production".`,
    );
  }
  if (!CHANNEL_REGEX.test(channel)) {
    throw new Error(
      `Invalid channel "${channel}": expected alphanumeric, underscore, or hyphen (max 32 chars).`,
    );
  }

  let webhookType: ImWebhookType | undefined;
  if (webhookTypeRaw) {
    if (!VALID_WEBHOOK_TYPES.has(webhookTypeRaw as ImWebhookType)) {
      throw new Error(
        `Invalid webhookType "${webhookTypeRaw}": expected "feishu", "wecom", or "dingtalk".`,
      );
    }
    webhookType = webhookTypeRaw as ImWebhookType;
  }

  if (webhookUrl) {
    webhookUrl = assertValidHttpsUrl(webhookUrl, 'webhookUrl');
  }
  if (downloadUrl) {
    downloadUrl = assertValidHttpUrl(downloadUrl, 'downloadUrl');
  }
  if (qrCodeUrl) {
    qrCodeUrl = assertValidHttpUrl(qrCodeUrl, 'qrCodeUrl');
  }

  return {
    platform: platformRaw as DistributePlatform,
    variant: variantRaw as AppVariant,
    channel,
    artifactPath,
    appName,
    version,
    commitSha,
    releaseNotes,
    pgyerApiKey,
    downloadUrl,
    qrCodeUrl,
    webhookType,
    webhookUrl,
    dryRun,
  };
}

// 原因：按飞书、企业微信、钉钉三家群机器人官方 Webhook 规范生成消息载荷，突出环境变体、安卓渠道号与内测二维码
export function buildImWebhookPayload(
  webhookType: ImWebhookType,
  meta: {
    appName: string;
    platform: DistributePlatform;
    variant: AppVariant;
    channel: string;
    version: string;
    commitSha?: string;
    releaseNotes: string;
    downloadUrl: string;
    qrCodeUrl?: string;
  },
): Record<string, unknown> {
  const platformLabel = meta.platform === 'ios' ? 'iOS (IPA)' : 'Android (APK)';
  const commitPart = meta.commitSha ? ` · \`${meta.commitSha}\`` : '';
  const summaryLines = [
    `**应用名称**：${meta.appName}`,
    `**目标平台**：${platformLabel}`,
    `**构建变体**：\`${meta.variant.toUpperCase()}\``,
    `**分发渠道**：\`${meta.channel}\``,
    `**版本标识**：v${meta.version}${commitPart}`,
    `**更新说明**：${meta.releaseNotes}`,
    `**安装地址**：[点击打开下载页](${meta.downloadUrl})`,
  ];
  if (meta.qrCodeUrl) {
    summaryLines.push(`**扫码安装**：[查看二维码图片](${meta.qrCodeUrl})`);
  }

  if (webhookType === 'feishu') {
    const headerTemplate =
      meta.variant === 'production' ? 'green' : meta.variant === 'staging' ? 'orange' : 'blue';

    return {
      msg_type: 'interactive',
      card: {
        header: {
          template: headerTemplate,
          title: {
            tag: 'plain_text',
            content: `📦 ${meta.appName} (${meta.variant.toUpperCase()} · ${meta.channel}) 内测包就绪`,
          },
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: summaryLines.join('\n'),
            },
          },
          {
            tag: 'action',
            actions: [
              {
                tag: 'button',
                text: {
                  tag: 'plain_text',
                  content: '立即下载安装测试包',
                },
                type: 'primary',
                url: meta.downloadUrl,
              },
            ],
          },
        ],
      },
    };
  }

  if (webhookType === 'wecom') {
    return {
      msgtype: 'markdown',
      markdown: {
        content: [
          `### 📦 ${meta.appName} 内测构建已完成`,
          ...summaryLines.map((line) => `> ${line}`),
        ].join('\n'),
      },
    };
  }

  // dingtalk
  const dingLines = [
    `### 📦 ${meta.appName} 内测构建已完成`,
    ...summaryLines.map((line) => `- ${line}`),
  ];
  if (meta.qrCodeUrl) {
    dingLines.push(`\n![扫码安装二维码](${meta.qrCodeUrl})`);
  }

  return {
    msgtype: 'markdown',
    markdown: {
      title: `${meta.appName} (${meta.variant}/${meta.channel}) 构建通知`,
      text: dingLines.join('\n'),
    },
  };
}

const defaultFetchDriver: DistributeFetchDriver = async (req) => {
  const response = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  const data = (await response.json().catch(() => null)) as unknown;
  return {
    status: response.status,
    data,
  };
};

// 原因：对接蒲公英 API v2 标准 getCOSToken 两步直传协议；凭据改走 POST 表单体防日志泄露，并对 1246/1247 异步解析状态执行轮询等待
export async function uploadArtifactToPgyer(
  options: {
    apiKey: string;
    artifactPath: string;
    platform: DistributePlatform;
    releaseNotes: string;
    maxPollAttempts?: number;
    pollIntervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
  fetchDriver: DistributeFetchDriver = defaultFetchDriver,
): Promise<PgyerUploadResult> {
  const resolvedPath = path.resolve(options.artifactPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Artifact file does not exist at "${resolvedPath}".`);
  }

  const buildType = options.platform === 'ios' ? 'ipa' : 'apk';
  const tokenBody = new URLSearchParams({
    _api_key: options.apiKey,
    buildType,
    buildUpdateDescription: options.releaseNotes,
  }).toString();

  const tokenRes = await fetchDriver({
    url: 'https://www.pgyer.com/apiv2/app/getCOSToken',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenBody,
  });

  const tokenPayload = tokenRes.data as {
    code?: number;
    message?: string;
    data?: {
      key?: string;
      endpoint?: string;
      params?: {
        signature?: string;
        'x-cos-security-token'?: string;
        key?: string;
      };
    };
  } | null;

  if (
    tokenRes.status < 200 ||
    tokenRes.status >= 300 ||
    !tokenPayload ||
    tokenPayload.code !== 0 ||
    !tokenPayload.data?.endpoint ||
    !tokenPayload.data?.key
  ) {
    throw new Error(
      `PGYER getCOSToken failed: ${tokenPayload?.message ?? `HTTP ${tokenRes.status}`}`,
    );
  }

  const cosEndpoint = assertValidHttpsUrl(tokenPayload.data.endpoint, 'pgyerCosEndpoint');

  const cosForm = new FormData();
  const cosKey = tokenPayload.data.params?.key ?? tokenPayload.data.key;
  cosForm.append('key', cosKey);
  if (tokenPayload.data.params?.signature) {
    cosForm.append('signature', tokenPayload.data.params.signature);
  }
  if (tokenPayload.data.params?.['x-cos-security-token']) {
    cosForm.append('x-cos-security-token', tokenPayload.data.params['x-cos-security-token']);
  }
  const fileBuffer = fs.readFileSync(resolvedPath);
  const fileBlob = new Blob([fileBuffer]);
  cosForm.append('file', fileBlob, path.basename(resolvedPath));

  const uploadRes = await fetchDriver({
    url: cosEndpoint,
    method: 'POST',
    body: cosForm,
  });

  if (uploadRes.status < 200 || uploadRes.status >= 300) {
    throw new Error(`PGYER COS binary upload failed with HTTP ${uploadRes.status}.`);
  }

  const maxPollAttempts = Math.max(1, options.maxPollAttempts ?? 15);
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const sleep =
    options.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));

  const infoBody = new URLSearchParams({
    _api_key: options.apiKey,
    buildKey: tokenPayload.data.key,
  }).toString();

  type PgyerBuildInfoPayload = {
    code?: number;
    message?: string;
    data?: {
      buildKey?: string;
      buildShortcutUrl?: string;
      buildQRCodeURL?: string;
    };
  } | null;

  let resolvedInfoData: NonNullable<NonNullable<PgyerBuildInfoPayload>['data']> | null = null;
  let lastErrorDetail = 'Unknown error';

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    const infoRes = await fetchDriver({
      url: 'https://www.pgyer.com/apiv2/app/buildInfo',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: infoBody,
    });

    const infoPayload = infoRes.data as PgyerBuildInfoPayload;
    if (
      infoRes.status >= 200 &&
      infoRes.status < 300 &&
      infoPayload?.code === 0 &&
      infoPayload.data
    ) {
      resolvedInfoData = infoPayload.data;
      break;
    }

    // 原因：PGYER COS 直传后服务端异步解析 IPA/APK，返回 1246/1247 表示“应用正在发布/解析中”，需轮询等待
    const isAsyncProcessing = infoPayload?.code === 1246 || infoPayload?.code === 1247;
    lastErrorDetail = infoPayload?.message ?? `HTTP ${infoRes.status}`;
    if (!isAsyncProcessing || attempt === maxPollAttempts - 1) {
      throw new Error(`PGYER buildInfo query failed: ${lastErrorDetail}`);
    }
    await sleep(pollIntervalMs);
  }

  if (!resolvedInfoData) {
    throw new Error(`PGYER buildInfo query failed: ${lastErrorDetail}`);
  }

  const buildKey = resolvedInfoData.buildKey ?? tokenPayload.data.key;
  const shortcut = resolvedInfoData.buildShortcutUrl;
  const downloadUrl = shortcut
    ? `https://www.pgyer.com/${shortcut}`
    : `https://www.pgyer.com/${buildKey}`;
  const qrCodeUrl =
    resolvedInfoData.buildQRCodeURL ?? `https://www.pgyer.com/app/qrcode/${buildKey}`;

  return {
    buildKey,
    downloadUrl,
    qrCodeUrl,
  };
}

export async function executeInternalDistribution(
  options: DistributeOptions,
  fetchDriver: DistributeFetchDriver = defaultFetchDriver,
): Promise<DistributeExecutionResult> {
  if (!options.dryRun && !options.pgyerApiKey && !options.downloadUrl) {
    throw new Error(
      'Missing distribution target: provide PGYER_API_KEY (--pgyer-api-key) or DISTRIBUTE_DOWNLOAD_URL (--download-url), or pass --dry-run.',
    );
  }

  let downloadUrl =
    options.downloadUrl ?? `https://www.pgyer.com/mock-${options.variant}-${options.channel}`;
  let qrCodeUrl = options.qrCodeUrl;
  if (!qrCodeUrl && options.dryRun) {
    qrCodeUrl = `https://www.pgyer.com/app/qrcode/mock-${options.variant}-${options.channel}`;
  }
  let pgyerUploaded = false;

  if (options.pgyerApiKey && !options.dryRun) {
    if (!options.artifactPath) {
      throw new Error('Missing artifactPath (--artifact): required when uploading to PGYER.');
    }
    const pgyerRes = await uploadArtifactToPgyer(
      {
        apiKey: options.pgyerApiKey,
        artifactPath: options.artifactPath,
        platform: options.platform,
        releaseNotes: options.releaseNotes,
      },
      fetchDriver,
    );
    downloadUrl = pgyerRes.downloadUrl;
    qrCodeUrl = pgyerRes.qrCodeUrl;
    pgyerUploaded = true;
  }

  let webhookPayload: Record<string, unknown> | undefined;
  let webhookDelivered = false;

  if (options.webhookType) {
    webhookPayload = buildImWebhookPayload(options.webhookType, {
      appName: options.appName,
      platform: options.platform,
      variant: options.variant,
      channel: options.channel,
      version: options.version,
      commitSha: options.commitSha,
      releaseNotes: options.releaseNotes,
      downloadUrl,
      qrCodeUrl,
    });

    if (options.webhookUrl && !options.dryRun) {
      const webhookRes = await fetchDriver({
        url: options.webhookUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload),
      });
      if (webhookRes.status < 200 || webhookRes.status >= 300) {
        throw new Error(
          `Webhook notification to ${options.webhookType} failed with HTTP ${webhookRes.status}.`,
        );
      }
      webhookDelivered = true;
    }
  }

  return {
    dryRun: Boolean(options.dryRun),
    platform: options.platform,
    variant: options.variant,
    channel: options.channel,
    downloadUrl,
    qrCodeUrl,
    pgyerUploaded,
    webhookDelivered,
    webhookPayload,
  };
}
