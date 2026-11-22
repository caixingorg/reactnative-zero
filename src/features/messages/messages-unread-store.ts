import { create } from 'zustand';

export type MessageChannelKey = 'notifications' | 'interactions' | 'direct';

export interface MessagesUnreadState {
  unreadCounts: Record<MessageChannelKey, number>;
  readItemIds: Record<string, true>;
  allRead: boolean;
  markItemRead: (channel: MessageChannelKey, itemId: string, wasUnread: boolean) => void;
  markAllRead: () => void;
  resetUnread: () => void;
}

const INITIAL_UNREAD_COUNTS: Record<MessageChannelKey, number> = {
  notifications: 3,
  interactions: 0,
  direct: 1,
};

// 原因：将消息未读状态收敛为单源 Store，使消息页单条已读/一键全部已读与底部 Tab 角标实时同步
export const useMessagesUnreadStore = create<MessagesUnreadState>((set) => ({
  unreadCounts: { ...INITIAL_UNREAD_COUNTS },
  readItemIds: {},
  allRead: false,
  markItemRead: (channel, itemId, wasUnread) =>
    set((state) => {
      if (!wasUnread || state.allRead || state.readItemIds[itemId]) {
        return state;
      }
      return {
        readItemIds: { ...state.readItemIds, [itemId]: true },
        unreadCounts: {
          ...state.unreadCounts,
          [channel]: Math.max(0, state.unreadCounts[channel] - 1),
        },
      };
    }),
  markAllRead: () =>
    set({
      allRead: true,
      unreadCounts: { notifications: 0, interactions: 0, direct: 0 },
    }),
  resetUnread: () =>
    set({
      allRead: false,
      readItemIds: {},
      unreadCounts: { ...INITIAL_UNREAD_COUNTS },
    }),
}));

export function useMessagesTotalUnread(): number {
  return useMessagesUnreadStore(
    (state) =>
      state.unreadCounts.notifications +
      state.unreadCounts.interactions +
      state.unreadCounts.direct,
  );
}
