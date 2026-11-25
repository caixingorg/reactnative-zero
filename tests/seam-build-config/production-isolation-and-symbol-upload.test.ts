import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appIdentity } from '@root/app.identity';
import { resolveExpoConfig } from '../../config/expo-config-resolver';
import { getDemoLoginCredentials as getProdDemoCredentials } from '../../src/features/auth/demo-credentials.prod';

interface MetroResolverConfig {
  resolver: {
    resolveRequest: (
      context: {
        resolveRequest: (
          ctx: unknown,
          name: string,
          platform: string | null,
        ) => { type: string; filePath: string };
      },
      moduleName: string,
      platform: string | null,
    ) => { type: string; filePath: string };
  };
}

describe('Production isolation, placeholder domain gate & Fastlane debug symbols (Tickets 03 & 04)', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const devCredsPath = path.resolve(projectRoot, 'src/features/auth/demo-credentials.ts');
  const prodCredsPath = path.resolve(projectRoot, 'src/features/auth/demo-credentials.prod.ts');
  const originalAppVariant = process.env.APP_VARIANT;

  afterEach(() => {
    if (originalAppVariant === undefined) {
      delete process.env.APP_VARIANT;
    } else {
      process.env.APP_VARIANT = originalAppVariant;
    }
    jest.resetModules();
  });

  it('Metro swaps demo-credentials.ts to demo-credentials.prod.ts under APP_VARIANT=production', () => {
    process.env.APP_VARIANT = 'production';
    jest.resetModules();
    const metroConfig = require('../../metro.config.js') as MetroResolverConfig;

    const fakeContext = {
      resolveRequest: () => ({
        type: 'sourceFile',
        filePath: devCredsPath,
      }),
    };

    const resolved = metroConfig.resolver.resolveRequest(fakeContext, '../demo-credentials', 'ios');
    expect(resolved.filePath).toBe(prodCredsPath);
    expect(getProdDemoCredentials()).toBeNull();
  });

  it('production stub and Shared Layer i18n resources contain zero password123 strings, and CONTEXT.md lists new stubs', () => {
    const prodStubContent = fs.readFileSync(prodCredsPath, 'utf8');
    const i18nContent = fs.readFileSync(
      path.resolve(projectRoot, 'src/shared/i18n/app-resources.ts'),
      'utf8',
    );
    const contextPath = path.resolve(projectRoot, 'CONTEXT.md');

    expect(prodStubContent).not.toContain('password123');
    expect(i18nContent).not.toContain('password123');
    if (fs.existsSync(contextPath)) {
      const contextContent = fs.readFileSync(contextPath, 'utf8');
      expect(contextContent).toContain('checkout-sandbox.prod.ts');
      expect(contextContent).toContain('demo-credentials.prod.ts');
    }
  });

  it('blocks example.com placeholder domains in production for derived slugs and CI_RELEASE=true while keeping template CI green', () => {
    const placeholderProdEnv = {
      APP_VARIANT: 'production',
      EXPO_PUBLIC_API_BASE_URL: 'https://api.example.com',
      EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://legal.example.com/privacy',
      EXPO_PUBLIC_USER_AGREEMENT_URL: 'https://legal.example.com/terms',
      EXPO_PUBLIC_ENABLE_MOCK_GATEWAY: 'false',
      EXPO_PUBLIC_ENABLE_DEVTOOLS: 'false',
    };

    // Default template slug without CI_RELEASE stays green for upstream CI smoke checks
    expect(() =>
      resolveExpoConfig({ ...appIdentity, slug: 'enterprise-rn-template' }, placeholderProdEnv),
    ).not.toThrow();

    // Derived App Instance slug fails loudly
    expect(() =>
      resolveExpoConfig({ ...appIdentity, slug: 'acme-mobile-app' }, placeholderProdEnv),
    ).toThrow(/example\.com/i);

    // Formal release flag fails loudly even on template slug
    expect(() =>
      resolveExpoConfig(
        { ...appIdentity, slug: 'enterprise-rn-template' },
        { ...placeholderProdEnv, CI_RELEASE: 'true' },
      ),
    ).toThrow(/example\.com/i);

    // Real production domains pass for derived slug and CI_RELEASE
    expect(() =>
      resolveExpoConfig(
        { ...appIdentity, slug: 'acme-mobile-app' },
        {
          ...placeholderProdEnv,
          CI_RELEASE: 'true',
          EXPO_PUBLIC_API_BASE_URL: 'https://api.acme.cn',
          EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://legal.acme.cn/privacy',
          EXPO_PUBLIC_USER_AGREEMENT_URL: 'https://legal.acme.cn/terms',
        },
      ),
    ).not.toThrow();
  });

  it('Fastlane DebugSymbols helper supports dry_run, missing-credential warning skip, and placeholder domain detection', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-symbols-test-'));
    try {
      const androidMapDir = path.join(
        tmpDir,
        'android/app/build/generated/sourcemaps/react/release',
      );
      const proguardDir = path.join(tmpDir, 'android/app/build/outputs/mapping/release');
      const iosDir = path.join(tmpDir, 'ios');
      const distIosDir = path.join(tmpDir, 'dist/ios');
      fs.mkdirSync(androidMapDir, { recursive: true });
      fs.mkdirSync(proguardDir, { recursive: true });
      fs.mkdirSync(iosDir, { recursive: true });
      fs.mkdirSync(distIosDir, { recursive: true });

      fs.writeFileSync(path.join(androidMapDir, 'index.android.bundle.map'), '{}');
      fs.writeFileSync(path.join(proguardDir, 'mapping.txt'), 'a -> b');
      fs.writeFileSync(path.join(iosDir, 'main.jsbundle.map'), '{}');
      fs.writeFileSync(path.join(distIosDir, 'App.app.dSYM.zip'), 'zip');

      const rubyScript = `
        require 'json'
        require File.expand_path('fastlane/lib/debug_symbols', Dir.pwd)

        root = ARGV[0]
        dry = DebugSymbols.plan_upload(platform: 'android', project_root: root, env: {}, dry_run: true)
        skipped = DebugSymbols.plan_upload(platform: 'android', project_root: root, env: {}, dry_run: false)
        ready_ios = DebugSymbols.plan_upload(
          platform: 'ios',
          project_root: root,
          env: { 'SENTRY_AUTH_TOKEN' => 'tok', 'SENTRY_ORG' => 'org', 'SENTRY_PROJECT' => 'proj' },
          dry_run: false
        )
        bad_domains = DebugSymbols.find_placeholder_domains({
          'EXPO_PUBLIC_API_BASE_URL' => 'https://api.example.com',
          'EXPO_PUBLIC_PRIVACY_POLICY_URL' => 'https://legal.real.cn/privacy'
        })

        puts JSON.generate({
          dry_status: dry.status,
          dry_commands: dry.commands.length,
          skipped_status: skipped.status,
          skipped_warning: skipped.warning,
          ready_ios_status: ready_ios.status,
          ready_ios_commands: ready_ios.commands.map { |c| c.join(' ') },
          bad_domains: bad_domains
        })
      `;

      const output = execFileSync('ruby', ['-e', rubyScript, tmpDir], {
        cwd: projectRoot,
        encoding: 'utf8',
      });
      const parsed = JSON.parse(output) as {
        dry_status: string;
        dry_commands: number;
        skipped_status: string;
        skipped_warning: string;
        ready_ios_status: string;
        ready_ios_commands: string[];
        bad_domains: string[];
      };

      expect(parsed.dry_status).toBe('dry_run');
      expect(parsed.dry_commands).toBe(2);
      expect(parsed.skipped_status).toBe('skipped');
      expect(parsed.skipped_warning).toMatch(/SENTRY_AUTH_TOKEN/);
      expect(parsed.ready_ios_status).toBe('ready');
      expect(parsed.ready_ios_commands.some((cmd) => cmd.includes('sourcemaps upload'))).toBe(true);
      expect(parsed.ready_ios_commands.some((cmd) => cmd.includes('debug-files upload'))).toBe(
        true,
      );
      expect(parsed.bad_domains).toEqual(['EXPO_PUBLIC_API_BASE_URL=https://api.example.com']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
