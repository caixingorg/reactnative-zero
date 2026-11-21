/**
 * @module core/ui/toast-store
 * 职责：管理全局轻提示（Toast）展示状态与定时自动消隐，采用 zustand/vanilla 实例隔离以兼容多测试运行时。
 * 边界：仅用于瞬时状态反馈，不可替代需要用户明确动作的 `ConfirmDialog` 或阻塞式错误页。
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastPayload {
  message: string;
  tone?: ToastTone;
  /** 自动关闭时长（毫秒，默认 2600；传入 0 表示不自动关闭）。 */
  durationMs?: number;
}

export interface ActiveToast {
  id: number;
  message: string;
  tone: ToastTone;
  durationMs: number;
}

export interface ToastState {
  activeToast: ActiveToast | null;
  show: (payload: ToastPayload | string) => number;
  dismiss: (id?: number) => void;
}

export type ToastStore = StoreApi<ToastState>;

const DEFAULT_TOAST_DURATION_MS = 2600;

export function createToastStore(): ToastStore {
  let nextId = 1;

  return createStore<ToastState>((set, get) => ({
    activeToast: null,
    show: (input) => {
      const normalized: ToastPayload = typeof input === 'string' ? { message: input } : input;
      const id = nextId++;
      set({
        activeToast: {
          id,
          message: normalized.message,
          tone: normalized.tone ?? 'info',
          durationMs: normalized.durationMs ?? DEFAULT_TOAST_DURATION_MS,
        },
      });
      return id;
    },
    dismiss: (id) => {
      const current = get().activeToast;
      if (!current) {
        return;
      }
      if (id !== undefined && current.id !== id) {
        return;
      }
      set({ activeToast: null });
    },
  }));
}
