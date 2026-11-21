import type { NetworkInterfaceInfo } from 'node:os';
import { runEnvPreflight } from '@root/scripts/lib/env-preflight';

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: `${address}/24`,
  };
}

const LAN_ONLY = { lo0: [ipv4('127.0.0.1', true)], en0: [ipv4('192.168.1.20')] };

describe('Seam: native build environment preflight', () => {
  it('passes cleanly for an ASCII project path on a plain LAN', () => {
    expect(
      runEnvPreflight({
        projectRoot: '/Users/dev/projects/my-app',
        networkInterfaces: LAN_ONLY,
        env: {},
      }),
    ).toEqual([]);
  });

  it('blocks a project path containing Chinese characters before CocoaPods fails on hermes-engine', () => {
    const issues = runEnvPreflight({
      projectRoot: '/Users/dev/local/应用开发/reactnative',
      networkInterfaces: LAN_ONLY,
      env: {},
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'error', code: 'non-ascii-project-path' });
    expect(issues[0]?.message).toContain('应用开发');
  });

  it.each(['198.18.0.1', '198.19.255.254'])(
    'warns (without blocking) when a proxy TUN / fake-IP interface %s is present',
    (address) => {
      const issues = runEnvPreflight({
        projectRoot: '/Users/dev/my-app',
        networkInterfaces: { ...LAN_ONLY, utun4: [ipv4(address)] },
        env: {},
      });

      expect(issues).toEqual([
        expect.objectContaining({ level: 'warn', code: 'proxy-virtual-interface' }),
      ]);
      expect(issues[0]?.message).toContain('REACT_NATIVE_PACKAGER_HOSTNAME=localhost');
    },
  );

  it('ignores addresses outside 198.18.0.0/15 and stays silent once the packager hostname is overridden', () => {
    expect(
      runEnvPreflight({
        projectRoot: '/Users/dev/my-app',
        networkInterfaces: { ...LAN_ONLY, utun1: [ipv4('198.20.0.1')] },
        env: {},
      }),
    ).toEqual([]);

    expect(
      runEnvPreflight({
        projectRoot: '/Users/dev/my-app',
        networkInterfaces: { ...LAN_ONLY, utun4: [ipv4('198.18.0.1')] },
        env: { REACT_NATIVE_PACKAGER_HOSTNAME: 'localhost' },
      }),
    ).toEqual([]);
  });
});
