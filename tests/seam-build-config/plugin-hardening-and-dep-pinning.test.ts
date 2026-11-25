import fs from 'node:fs';
import path from 'node:path';
import { UNUSED_LOCATION_FGS_SERVICES } from '@root/config/with-capability-manifest-sanitizer';

describe('Dependency pinning & Config Plugin hardening (Ticket 09)', () => {
  const projectRoot = path.resolve(__dirname, '../..');

  it('removes unmaintained babel-plugin-transform-remove-console and exact-pins the 5 native ABI-coupled dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(projectRoot, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(pkg.devDependencies['babel-plugin-transform-remove-console']).toBeUndefined();

    const pinnedNativeLibs = [
      '@react-native-community/netinfo',
      '@shopify/flash-list',
      'react-native-mmkv',
      'react-native-nitro-modules',
      'react-native-webview',
    ];
    for (const lib of pinnedNativeLibs) {
      const version = pkg.dependencies[lib] ?? '';
      expect(version.length).toBeGreaterThan(0);
      expect(version.startsWith('^')).toBe(false);
      expect(version.startsWith('~')).toBe(false);
    }
  });

  it('WeChat Podfile plugin throws loudly when post_install anchor is missing and injects idempotently when present', () => {
    const pluginPath = path.resolve(projectRoot, 'modules/payment-wechat/app.plugin.js');
    if (!fs.existsSync(pluginPath)) {
      return;
    }
    const wechatPlugin = require(pluginPath) as {
      injectWechatPodfilePostInstall: (contents: string) => string;
    };
    expect(() =>
      wechatPlugin.injectWechatPodfilePostInstall("platform :ios, '15.0'\ntarget 'App' do\nend\n"),
    ).toThrow(/post_install do \|installer\|/);

    const validPodfile = "target 'App' do\n  post_install do |installer|\n  end\nend\n";
    const once = wechatPlugin.injectWechatPodfilePostInstall(validPodfile);
    expect(once).toContain('EXCLUDED_ARCHS[sdk=iphonesimulator*]');

    const twice = wechatPlugin.injectWechatPodfilePostInstall(once);
    expect(twice).toBe(once);
  });

  it('covers every foreground <service> declared in installed expo-location AndroidManifest.xml', () => {
    const locationManifestPath = path.resolve(
      projectRoot,
      'node_modules/expo-location/android/src/main/AndroidManifest.xml',
    );
    const xml = fs.readFileSync(locationManifestPath, 'utf8');
    const serviceMatches = Array.from(xml.matchAll(/<service[\s\S]*?android:name="([^"]+)"/g));
    expect(serviceMatches.length).toBeGreaterThan(0);

    const declaredServices = serviceMatches.map((match) => {
      const rawName = match[1] ?? '';
      return rawName.startsWith('.') ? `expo.modules.location${rawName}` : rawName;
    });

    for (const serviceName of declaredServices) {
      expect(UNUSED_LOCATION_FGS_SERVICES).toContain(serviceName);
    }
  });
});
