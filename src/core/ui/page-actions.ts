/**
 * @module core/ui/page-actions
 * 职责：登记"当前前台页面"的回顶部与刷新动作，让底部导航再次点击时能找到它（导航层不认识各页面的列表引用）。
 * 边界：同一时刻只有一个前台页面；后登记的覆盖先登记的，卸载或失活时注销。
 */
import { decideReselectAction } from './page-shell-logic';

export interface PageActions {
  scrollToTop: () => void;
  isAtTop: () => boolean;
  refresh: () => void;
}

export type ReselectResult = 'scrolledToTop' | 'refreshed' | 'none';

export interface PageActionsRegistry {
  /** 登记动作，返回注销函数；只有当前登记的仍是自己时才会清空，避免新页面被旧页面的注销误删。 */
  register: (actions: PageActions) => () => void;
  /** 再次点击当前导航时调用。 */
  reselect: () => ReselectResult;
}

export function createPageActionsRegistry(): PageActionsRegistry {
  let current: PageActions | null = null;

  return {
    register(actions) {
      current = actions;
      return () => {
        if (current === actions) {
          current = null;
        }
      };
    },
    reselect() {
      if (!current) {
        return 'none';
      }
      if (decideReselectAction(current.isAtTop()) === 'scrollToTop') {
        current.scrollToTop();
        return 'scrolledToTop';
      }
      current.refresh();
      return 'refreshed';
    },
  };
}

/** 应用级默认实例：底部导航的再次点击和各页面的登记都走它；测试请用 createPageActionsRegistry 自建。 */
export const pageActionsRegistry: PageActionsRegistry = createPageActionsRegistry();
