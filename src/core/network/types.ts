/**
 * @module core/network/types
 * 职责：定义统一网络错误模型 (`AppApiError`)、可插拔后端协议适配器 (`BackendAdapter`) 与 `HttpClient` 契约。
 * 边界：仅约束传输协议、信封解包与令牌刷新语义；严禁在此声明具体业务接口路径。
 */
export type ApiErrorKind = 'unauthorized' | 'business' | 'network' | 'unknown';

export class AppApiError extends Error {
  public readonly kind: ApiErrorKind;
  public readonly code: string;
  public readonly httpStatus?: number;

  constructor(options: { kind: ApiErrorKind; code: string; message: string; httpStatus?: number }) {
    super(options.message);
    this.name = 'AppApiError';
    this.kind = options.kind;
    this.code = options.code;
    this.httpStatus = options.httpStatus;
  }
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResult {
  tokens: SessionTokens;
  user: AuthUser;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RawHttpRequest {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  data?: unknown;
}

export interface RawHttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data: T;
}

export type HttpTransportDriver = (request: RawHttpRequest) => Promise<RawHttpResponse>;

// 原因：BackendAdapter 严格聚焦底层协议适配（鉴权头、信封解包、错误码映射、刷新凭证），不包含具体业务接口路径
export interface BackendAdapter {
  /** 将当前 `accessToken` 注入请求头（如 `Authorization: Bearer <token>`）。 */
  attachAuthHeaders(headers: Record<string, string>, accessToken: string): Record<string, string>;
  /** 判定本次响应是否表示 AccessToken 已过期（返回 `true` 将触发 HttpClient 单飞刷新锁并自动重放一次）。 */
  isAccessTokenExpired(httpStatus: number, rawBody: unknown): boolean;
  /** 从后端统一响应信封中解包业务数据，遇到业务错误码时抛出 `AppApiError`。 */
  unwrapEnvelope<T>(httpStatus: number, rawBody: unknown): T;
  /** 将任意传输异常、超时或协议错误归一化为 `AppApiError`。 */
  normalizeError(error: unknown): AppApiError;
  /** 使用 `refreshToken` 调用后端换取新凭证；须通过 `executeRaw` 发请求以绕过外层重试循环。 */
  refreshSession(
    refreshToken: string,
    executeRaw: (request: RawHttpRequest) => Promise<RawHttpResponse>,
  ): Promise<SessionTokens>;
  /** 可选：判定刷新失败是否意味着刷新凭证已失效（需清会话）。未实现时使用 `isTerminalRefreshFailure` 默认策略。 */
  isTerminalRefreshFailure?(error: AppApiError): boolean;
}

export interface RequestConfig {
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  /** 设为 `true` 时不自动附加鉴权头，且不触发 401 刷新重放（适用于登录/公开接口）。 */
  skipAuth?: boolean;
}

export interface HttpClient {
  request<T>(method: HttpMethod, path: string, data?: unknown, config?: RequestConfig): Promise<T>;
  get<T>(path: string, config?: RequestConfig): Promise<T>;
  post<T>(path: string, data?: unknown, config?: RequestConfig): Promise<T>;
  put<T>(path: string, data?: unknown, config?: RequestConfig): Promise<T>;
  delete<T>(path: string, config?: RequestConfig): Promise<T>;
  getBaseUrl(): string;
}
