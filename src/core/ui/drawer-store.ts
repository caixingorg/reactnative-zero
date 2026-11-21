/**
 * @module core/ui/drawer-store
 * 职责：全局抽屉的开关状态，供任意页面的 Header 按钮、返回键处理和 DrawerHost 共用；采用 zustand/vanilla 实例隔离以兼容多测试运行时。
 * 边界：只管开关，不管抽屉里放什么内容（内容由应用层注入 DrawerHost）。
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

export interface DrawerState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export type DrawerStore = StoreApi<DrawerState>;

export function createDrawerStore(): DrawerStore {
  return createStore<DrawerState>((set) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () => set((prev) => ({ isOpen: !prev.isOpen })),
  }));
}
