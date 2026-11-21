import {
  createDeferredOtaInitializer,
  createOtaUpdateCoordinator,
  type OtaUpdateDriver,
} from '@/core/updates/ota-coordinator';

function fakeDriver(isAvailable: boolean) {
  const calls = { check: 0, reload: 0 };
  const driver: OtaUpdateDriver = {
    checkForUpdate: async () => {
      calls.check += 1;
      return { isAvailable, manifestId: 'm1' };
    },
    fetchAndReload: async () => {
      calls.reload += 1;
    },
  };
  return { driver, calls };
}

describe('Seam: OTA coordinator is off by default and only acts when explicitly enabled with a driver', () => {
  it('stays disabled and never touches the driver without the enabled flag or a driver', async () => {
    const { driver, calls } = fakeDriver(true);

    for (const coordinator of [
      createOtaUpdateCoordinator(),
      createOtaUpdateCoordinator({ enabled: true }),
      createOtaUpdateCoordinator({ driver }),
    ]) {
      expect(coordinator.enabled).toBe(false);
      expect(await coordinator.checkForUpdate()).toEqual({
        enabled: false,
        updateAvailable: false,
      });
      expect(await coordinator.applyAvailableUpdate()).toBe(false);
    }
    expect(calls).toEqual({ check: 0, reload: 0 });
  });

  it('reports availability and only reloads when an update exists', async () => {
    const available = fakeDriver(true);
    const enabled = createOtaUpdateCoordinator({ enabled: true, driver: available.driver });
    expect(await enabled.checkForUpdate()).toEqual({
      enabled: true,
      updateAvailable: true,
      manifestId: 'm1',
    });
    expect(await enabled.applyAvailableUpdate()).toBe(true);
    expect(available.calls.reload).toBe(1);

    const none = fakeDriver(false);
    const idle = createOtaUpdateCoordinator({ enabled: true, driver: none.driver });
    expect(await idle.applyAvailableUpdate()).toBe(false);
    expect(none.calls.reload).toBe(0);
  });

  it('the deferred initializer checks for updates only when the coordinator is enabled', async () => {
    const off = fakeDriver(true);
    await createDeferredOtaInitializer(createOtaUpdateCoordinator({ driver: off.driver })).init();
    expect(off.calls.check).toBe(0);

    const on = fakeDriver(true);
    const initializer = createDeferredOtaInitializer(
      createOtaUpdateCoordinator({ enabled: true, driver: on.driver }),
    );
    expect(initializer.id).toBe('core:ota-updates');
    await initializer.init();
    expect(on.calls.check).toBe(1);
  });
});
