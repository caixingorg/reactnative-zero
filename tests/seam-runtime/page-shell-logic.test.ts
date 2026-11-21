import {
  createPageActionsRegistry,
  decideReselectAction,
  isScrollAtTop,
  markPageVisited,
  resolveActiveIndex,
} from '@/core/ui';

describe('Seam: page shell pure logic', () => {
  it('rounds the scroll offset to the nearest page and clamps it', () => {
    expect(resolveActiveIndex(0, 400, 3)).toBe(0);
    expect(resolveActiveIndex(190, 400, 3)).toBe(0);
    expect(resolveActiveIndex(210, 400, 3)).toBe(1);
    expect(resolveActiveIndex(9999, 400, 3)).toBe(2);
    expect(resolveActiveIndex(-50, 400, 3)).toBe(0);
    expect(resolveActiveIndex(100, 0, 3)).toBe(0);
    expect(resolveActiveIndex(100, 400, 0)).toBe(0);
  });

  it('mounts a page on first visit and keeps the same set when nothing changes', () => {
    const initial = new Set([0]);
    const afterVisit = markPageVisited(initial, 2);
    expect([...afterVisit].sort()).toEqual([0, 2]);
    expect(markPageVisited(afterVisit, 2)).toBe(afterVisit);
    expect(initial.has(2)).toBe(false);
  });

  it('scrolls to top first and only refreshes once already at the top', () => {
    expect(decideReselectAction(false)).toBe('scrollToTop');
    expect(decideReselectAction(true)).toBe('refresh');
    expect(isScrollAtTop(0)).toBe(true);
    expect(isScrollAtTop(8)).toBe(true);
    expect(isScrollAtTop(9)).toBe(false);
  });
});

describe('Seam: page actions registry', () => {
  function makePage(atTop: boolean) {
    const calls: string[] = [];
    let top = atTop;
    return {
      calls,
      setTop: (next: boolean) => {
        top = next;
      },
      actions: {
        scrollToTop: () => calls.push('top'),
        isAtTop: () => top,
        refresh: () => calls.push('refresh'),
      },
    };
  }

  it('does nothing when no page is registered', () => {
    expect(createPageActionsRegistry().reselect()).toBe('none');
  });

  it('scrolls to the top first, then refreshes on the next press', () => {
    const registry = createPageActionsRegistry();
    const page = makePage(false);
    registry.register(page.actions);

    expect(registry.reselect()).toBe('scrolledToTop');
    page.setTop(true);
    expect(registry.reselect()).toBe('refreshed');
    expect(page.calls).toEqual(['top', 'refresh']);
  });

  it('does not let a stale page unregister the newer page', () => {
    const registry = createPageActionsRegistry();
    const first = makePage(true);
    const second = makePage(true);
    const unregisterFirst = registry.register(first.actions);
    registry.register(second.actions);

    unregisterFirst();
    registry.reselect();

    expect(second.calls).toEqual(['refresh']);
    expect(first.calls).toEqual([]);
  });

  it('forgets the page after it unregisters', () => {
    const registry = createPageActionsRegistry();
    const unregister = registry.register(makePage(true).actions);
    unregister();
    expect(registry.reselect()).toBe('none');
  });
});
