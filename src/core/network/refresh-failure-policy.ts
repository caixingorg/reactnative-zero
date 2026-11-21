import type { AppApiError } from './types';

// 原因：只有服务端明确判定刷新凭证失效/被吊销时才清会话：
// - HTTP 400（OAuth invalid_grant，且非服务端故障信封码）、401、403；
// - HTTP 2xx 错误信封中明确属于鉴权拒绝的业务码（避免 HTTP 200 包裹 50000/42900 等网关或存储抖动把全网存量用户踢下线）。
// 无响应、5xx、408、429、404/422 及非鉴权类业务异常一律保留会话，派生项目可通过 BackendAdapter.isTerminalRefreshFailure 覆盖。
const TERMINAL_HTTP_STATUSES = new Set([400, 401, 403]);

export const TERMINAL_REFRESH_ENVELOPE_CODES = new Set([
  '400',
  '401',
  '403',
  '40000',
  '40001',
  '40100',
  '40101',
  '40102',
  '40103',
  '40300',
  '40301',
  'INVALID_GRANT',
  'REFRESH_TOKEN_EXPIRED',
  'REFRESH_TOKEN_REVOKED',
]);

export function isTerminalRefreshFailure(error: AppApiError): boolean {
  if (error.kind === 'unauthorized') {
    return true;
  }

  const status = error.httpStatus;
  if (status === undefined) {
    return TERMINAL_REFRESH_ENVELOPE_CODES.has(error.code);
  }

  if (TERMINAL_HTTP_STATUSES.has(status)) {
    return (
      error.kind !== 'business' ||
      TERMINAL_REFRESH_ENVELOPE_CODES.has(error.code) ||
      status === 401 ||
      status === 403
    );
  }

  if (status >= 200 && status < 300 && error.kind === 'business') {
    return TERMINAL_REFRESH_ENVELOPE_CODES.has(error.code);
  }

  return false;
}
