/**
 * @module core/capabilities/payment/pending-session-store
 * 职责：基于 KeyValueStorageDriver 持久化未确认的一次性支付会话，支持跨进程杀掉后的冷启恢复、userId 隔离与 TTL 过期清理。
 */
import type { KeyValueStorageDriver } from '../../storage/types';
import type { PendingCheckoutSession } from './types';

const PENDING_SESSIONS_STORAGE_KEY = 'core.payment.pending_checkout_sessions.v1';

export interface PendingSessionStore {
  list(): PendingCheckoutSession[];
  save(session: PendingCheckoutSession): void;
  remove(orderId: string): void;
  pruneExpired(nowMs: number): PendingCheckoutSession[];
}

function isValidSession(raw: unknown): raw is PendingCheckoutSession {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    typeof candidate.orderId === 'string' &&
    typeof candidate.channelCode === 'string' &&
    typeof candidate.driverId === 'string' &&
    typeof candidate.userId === 'string' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.expiresAt === 'number'
  );
}

export function createPendingSessionStore(
  keyValueStorage: KeyValueStorageDriver,
): PendingSessionStore {
  const readAll = (): PendingCheckoutSession[] => {
    const raw = keyValueStorage.getString(PENDING_SESSIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(isValidSession);
    } catch {
      return [];
    }
  };

  const writeAll = (sessions: PendingCheckoutSession[]): void => {
    if (sessions.length === 0) {
      keyValueStorage.deleteKey(PENDING_SESSIONS_STORAGE_KEY);
      return;
    }
    keyValueStorage.setString(PENDING_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  };

  return {
    list(): PendingCheckoutSession[] {
      return readAll();
    },

    save(session: PendingCheckoutSession): void {
      const current = readAll().filter((item) => item.orderId !== session.orderId);
      current.push(session);
      writeAll(current);
    },

    remove(orderId: string): void {
      const current = readAll();
      const next = current.filter((item) => item.orderId !== orderId);
      if (next.length !== current.length) {
        writeAll(next);
      }
    },

    pruneExpired(nowMs: number): PendingCheckoutSession[] {
      const current = readAll();
      const valid = current.filter((item) => item.expiresAt > nowMs);
      if (valid.length !== current.length) {
        writeAll(valid);
      }
      return valid;
    },
  };
}
