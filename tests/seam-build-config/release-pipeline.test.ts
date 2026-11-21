import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDistributeCliArgs } from '@root/scripts/lib/distribute-core';
import { renderChangelog } from '@root/scripts/lib/changelog-core';
import { parseReleaseTag } from '@root/scripts/lib/release-core';

const workflowsDir = join(__dirname, '..', '..', '.github', 'workflows');
const workflows = readdirSync(workflowsDir)
  .filter((file) => file.endsWith('.yml'))
  // 原因：注释里会解释为什么禁用某些写法，断言只看真正生效的配置行
  .map((file) => ({
    file,
    text: readFileSync(join(workflowsDir, file), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n'),
  }));
const release = workflows.find((w) => w.file === 'release.yml')?.text ?? '';

function jobBlock(text: string, job: string): string {
  const start = text.search(new RegExp(`^  ${job}:`, 'm'));
  const rest = text.slice(start + 1);
  const next = rest.search(/^ {2}\w[\w-]*:/m);
  return next === -1 ? text.slice(start) : text.slice(start, start + 1 + next);
}

describe('Seam: release tags map to variant, version and a monotonic build number', () => {
  it('maps plain tags to production and rc tags to staging', () => {
    expect(parseReleaseTag('v1.2.3', '1.2.3')).toMatchObject({
      variant: 'production',
      version: '1.2.3',
    });
    expect(parseReleaseTag('v1.2.3-rc.2', '1.2.3')).toMatchObject({ variant: 'staging' });
  });

  it('derives a version code that increases across rc, final and later versions', () => {
    const rc1 = parseReleaseTag('v1.2.3-rc.1', '1.2.3').versionCode;
    const rc2 = parseReleaseTag('v1.2.3-rc.2', '1.2.3').versionCode;
    const final = parseReleaseTag('v1.2.3', '1.2.3').versionCode;
    const patch = parseReleaseTag('v1.2.4', '1.2.4').versionCode;
    const minor = parseReleaseTag('v1.3.0', '1.3.0').versionCode;
    const major = parseReleaseTag('v2.0.0', '2.0.0').versionCode;
    expect([rc1, rc2, final, patch, minor, major]).toEqual(
      [rc1, rc2, final, patch, minor, major].slice().sort((a, b) => a - b),
    );
    expect(new Set([rc1, rc2, final, patch, minor, major]).size).toBe(6);
    expect(major).toBeLessThan(2_100_000_000);
  });

  it('rejects malformed tags and tags that disagree with package.json', () => {
    for (const tag of [
      '1.2.3',
      'v1.2',
      'v1.2.3-beta',
      'v1.2.3-rc.0',
      'v1.2.3-rc.99',
      'v1.2.3$(x)',
    ]) {
      expect(() => parseReleaseTag(tag, '1.2.3')).toThrow();
    }
    expect(() => parseReleaseTag('v1.2.4', '1.2.3')).toThrow(/does not match package.json/);
    // 原因：版本与 package.json 一致时，主版本超过上限仍必须被拒绝，避免单独验证上限
    expect(() => parseReleaseTag('v21.0.0', '21.0.0')).toThrow(/Major version/);
  });
});

describe('Seam: release notes come from Conventional Commit subjects only', () => {
  it('groups by type, strips PR suffixes into references and flags breaking changes', () => {
    const notes = renderChangelog('v1.0.0', [
      'feat(ios): add signing (#3)',
      'fix: crash on launch',
      'feat!: drop old api',
      'not a conventional subject',
    ]);
    expect(notes).toContain('## v1.0.0');
    expect(notes).toContain('### 破坏性变更');
    expect(notes).toContain('- **ios**：add signing（#3）');
    expect(notes).toContain('### 问题修复');
    expect(notes).not.toContain('not a conventional subject');
  });

  it('states when there are no user-visible changes', () => {
    expect(renderChangelog('v1.0.1', [])).toContain('无用户可见变更');
  });
});

function text_ios_label_count(): number {
  return workflows.reduce(
    (count, { text }) => count + (text.match(/ios-release/g)?.length ?? 0),
    0,
  );
}

describe('Seam: release workflow keeps the self-hosted runner away from pull requests', () => {
  it('triggers only on v* tags and manual dispatch, and never on pull_request_target', () => {
    const triggers = release.slice(release.indexOf('\non:'), release.indexOf('\npermissions:'));
    expect(triggers).toMatch(/tags:\s*\n\s*- 'v\*'/);
    expect(triggers).toContain('workflow_dispatch');
    expect(triggers).not.toContain('pull_request');
    for (const { file, text } of workflows) {
      expect({ file, bad: text.includes('pull_request_target') }).toEqual({ file, bad: false });
    }
  });

  it('only the iOS release job may use a self-hosted runner, and it is double-gated', () => {
    for (const { file, text } of workflows) {
      if (file !== 'release.yml') {
        expect({ file, selfHosted: text.includes('self-hosted') }).toEqual({
          file,
          selfHosted: false,
        });
      }
    }
    const ios = jobBlock(release, 'ios');
    expect(ios).toContain('self-hosted');
    expect(ios).toContain("vars.IOS_RELEASE_ENABLED == 'true'");
    expect(ios).toContain('environment: release');
    expect(release.match(/self-hosted/g)?.length).toBe(1);
    // 原因：不用 self-hosted 字样也能靠标签落到自建 Mac，所以按 runs-on 的取值判断：除 iOS 发布 job 外，一律只能是托管 runner 的字面量
    for (const { file, text } of workflows) {
      const runsOn = [...text.matchAll(/^\s*runs-on:\s*(.+)$/gm)].map((m) => m[1]?.trim() ?? '');
      for (const value of runsOn) {
        if (file === 'release.yml' && value.includes('ios-release')) {
          continue;
        }
        expect({ file, value, hosted: /^(ubuntu|macos|windows)-[\w.-]+$/.test(value) }).toEqual({
          file,
          value,
          hosted: true,
        });
      }
    }
    expect(text_ios_label_count()).toBe(1);
  });

  it('builds only after the quality gate, which reuses the CI workflow', () => {
    expect(jobBlock(release, 'gate')).toContain('uses: ./.github/workflows/ci.yml');
    expect(jobBlock(release, 'gate')).toContain('ref: ${{ needs.guard.outputs.sha }}');
    expect(jobBlock(release, 'android')).toContain('ref: ${{ needs.guard.outputs.sha }}');
    expect(jobBlock(release, 'ios')).toContain('ref: ${{ needs.guard.outputs.sha }}');
    for (const job of ['android', 'ios']) {
      expect(jobBlock(release, job)).toMatch(/needs: \[guard, gate\]/);
    }
    const ci = workflows.find((w) => w.file === 'ci.yml')?.text ?? '';
    expect(ci).toContain('workflow_call:');
    expect(ci).toContain('name: Format, 4-Layer Lint, Typecheck & Seam Tests');
  });

  it('reads full history for the tag check, and never interpolates the tag into a shell script', () => {
    expect(jobBlock(release, 'guard')).toContain('fetch-depth: 0');
    expect(release).toContain('git merge-base --is-ancestor HEAD origin/main');
    expect(release).toContain("github.ref != 'refs/heads/main'");
    for (const run of release.match(/run: [\s\S]*?(?=\n\s+- name:|\n\s+\w+:|$)/g) ?? []) {
      expect(run).not.toMatch(
        /\$\{\{\s*(github\.event\.inputs|steps\.tag\.outputs\.tag|github\.ref_name)/,
      );
    }
  });

  it('sets explicit build numbers from the tag instead of CI run numbers', () => {
    expect(jobBlock(release, 'android')).toContain(
      'ANDROID_VERSION_CODE: ${{ needs.guard.outputs.version_code }}',
    );
    expect(jobBlock(release, 'ios')).toContain(
      'IOS_BUILD_NUMBER: ${{ needs.guard.outputs.version_code }}',
    );
  });
});

describe('Seam: distribution release notes prefer the generated notes file over the fixed text', () => {
  const notesFile = join(mkdtempSync(join(tmpdir(), 'release-notes-')), 'notes.md');
  writeFileSync(notesFile, '## v1.0.0\n\n- **ios**：add signing\n');

  it('uses the file, lets an explicit value win, and falls back when the file is absent', () => {
    expect(
      parseDistributeCliArgs([], { DISTRIBUTE_RELEASE_NOTES_FILE: notesFile }).releaseNotes,
    ).toContain('add signing');
    expect(
      parseDistributeCliArgs([], {
        DISTRIBUTE_RELEASE_NOTES_FILE: notesFile,
        DISTRIBUTE_RELEASE_NOTES: 'manual',
      }).releaseNotes,
    ).toBe('manual');
    expect(
      parseDistributeCliArgs([], { DISTRIBUTE_RELEASE_NOTES_FILE: '/nonexistent/notes.md' })
        .releaseNotes,
    ).toBe('内网自动化构建提测包');
  });
});

describe('Seam: Android emulator E2E stays out of the PR path', () => {
  const e2e = workflows.find((w) => w.file === 'e2e-maestro-android.yml')?.text ?? '';

  it('runs nightly, manually and on release tags, never on pull requests', () => {
    const triggers = e2e.slice(e2e.indexOf('\non:'), e2e.indexOf('\npermissions:'));
    expect(triggers).toContain('schedule:');
    expect(triggers).toContain('workflow_dispatch');
    expect(triggers).toMatch(/tags:\s*\n\s*- 'v\*'/);
    expect(triggers).not.toContain('pull_request');
  });

  it('runs the smoke flow with failure artifacts', () => {
    expect(e2e).toContain('.maestro/smoke.yaml');
    expect(e2e).toContain('actions/upload-artifact@v4');
    expect(e2e).toContain('if: failure()');
  });
});
