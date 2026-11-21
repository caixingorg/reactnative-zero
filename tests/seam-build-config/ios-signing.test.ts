import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

// 原因：签名解析逻辑是纯 Ruby，这里直接用 ruby 执行真实模块；没有 ruby 的环境跳过，而不是用 JS 复刻一份逻辑
const rubyAvailable = spawnSync('ruby', ['-v']).status === 0;
// 原因：CI 上缺少 ruby 必须失败，不能静默跳过后让签名校验失去覆盖；本地没有 ruby 才跳过
if (!rubyAvailable && process.env.CI) {
  throw new Error('ruby is required to run the iOS signing seam tests in CI.');
}
const describeWithRuby = rubyAvailable ? describe : describe.skip;
const modulePath = join(__dirname, '..', '..', 'fastlane', 'lib', 'ios_signing');

interface RubyResult {
  ok: boolean;
  mode?: string;
  team_id?: string | null;
  profile_name?: string | null;
  match_type?: string | null;
  error?: string;
}

function resolveSigning(exportMethod: string, env: Record<string, string>): RubyResult {
  const script = `
    require 'json'
    require ${JSON.stringify(modulePath)}
    begin
      r = IosSigning.resolve(export_method: ARGV[0], env: JSON.parse(ARGV[1]))
      puts JSON.generate(ok: true, mode: r.mode, team_id: r.team_id, profile_name: r.profile_name, match_type: r.match_type)
    rescue IosSigning::ConfigError => e
      puts JSON.generate(ok: false, error: e.message)
    end
  `;
  const output = spawnSync('ruby', ['-e', script, exportMethod, JSON.stringify(env)], {
    encoding: 'utf8',
  });
  if (output.status !== 0) {
    throw new Error(`ruby exited with ${output.status}: ${output.stderr}`);
  }
  return JSON.parse(output.stdout) as RubyResult;
}

describeWithRuby('Seam: iOS signing is env-driven and fails early when incomplete', () => {
  it('requires both team id and profile name for distribution exports, naming only the missing variables', () => {
    for (const method of ['ad-hoc', 'app-store', 'enterprise']) {
      const result = resolveSigning(method, {});
      expect(result.ok).toBe(false);
      expect(result.error).toContain('IOS_TEAM_ID');
      expect(result.error).toContain('IOS_PROVISIONING_PROFILE');
    }

    const onlyTeam = resolveSigning('ad-hoc', { IOS_TEAM_ID: 'ABCDE12345' });
    expect(onlyTeam.ok).toBe(false);
    expect(onlyTeam.error).toContain('Missing: IOS_PROVISIONING_PROFILE');
    expect(onlyTeam.error).not.toContain('Missing: IOS_TEAM_ID');
  });

  it('resolves manual signing from the two variables and never echoes their values in errors', () => {
    const ok = resolveSigning('app-store', {
      IOS_TEAM_ID: 'ABCDE12345',
      IOS_PROVISIONING_PROFILE: 'My Store Profile',
    });
    expect(ok).toMatchObject({
      ok: true,
      mode: 'manual',
      team_id: 'ABCDE12345',
      profile_name: 'My Store Profile',
    });

    const badTeam = resolveSigning('app-store', {
      IOS_TEAM_ID: 'not-a-team-id',
      IOS_PROVISIONING_PROFILE: 'My Store Profile',
    });
    expect(badTeam.ok).toBe(false);
    expect(badTeam.error).not.toContain('not-a-team-id');
    expect(badTeam.error).not.toContain('My Store Profile');
  });

  it('uses fastlane match only when MATCH_GIT_URL is set, and maps export methods to match types', () => {
    const matchEnv = {
      MATCH_GIT_URL: 'git@example.com:certs.git',
      IOS_TEAM_ID: 'ABCDE12345',
      MATCH_PASSWORD: 'x',
    };
    const mapping: Record<string, string> = {
      'ad-hoc': 'adhoc',
      'app-store': 'appstore',
      enterprise: 'enterprise',
      development: 'development',
    };
    for (const [method, matchType] of Object.entries(mapping)) {
      expect(resolveSigning(method, matchEnv)).toMatchObject({
        ok: true,
        mode: 'match',
        match_type: matchType,
      });
    }

    expect(resolveSigning('ad-hoc', { MATCH_GIT_URL: 'git@example.com:certs.git' }).ok).toBe(false);
    const noPassword = resolveSigning('ad-hoc', {
      MATCH_GIT_URL: 'git@example.com:certs.git',
      IOS_TEAM_ID: 'ABCDE12345',
    });
    expect(noPassword.ok).toBe(false);
    expect(noPassword.error).toContain('MATCH_PASSWORD');
    expect(
      resolveSigning('ad-hoc', { IOS_TEAM_ID: 'ABCDE12345', IOS_PROVISIONING_PROFILE: 'P' }).mode,
    ).toBe('manual');
  });

  it('uses Xcode automatic signing only for a development export, and still requires the team id', () => {
    expect(resolveSigning('development', { IOS_TEAM_ID: 'ABCDE12345' })).toMatchObject({
      ok: true,
      mode: 'automatic',
      team_id: 'ABCDE12345',
    });
    const noTeam = resolveSigning('development', {});
    expect(noTeam.ok).toBe(false);
    expect(noTeam.error).toContain('IOS_TEAM_ID');
    expect(resolveSigning('ad-hoc', {}).ok).toBe(false);
  });

  it('treats blank values as unset and rejects unknown export methods', () => {
    expect(resolveSigning('ad-hoc', { IOS_TEAM_ID: '  ', IOS_PROVISIONING_PROFILE: '' }).ok).toBe(
      false,
    );
    const unknown = resolveSigning('sideload', {});
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain('Unsupported export_method');
  });
});
