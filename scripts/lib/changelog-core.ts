// 原因：发布说明由 Conventional Commits 主题行生成；只解析主题行，不接触作者、邮箱等字段，避免泄露个人信息
export interface ChangelogEntry {
  type: string;
  scope: string | null;
  breaking: boolean;
  description: string;
  pr: string | null;
}

const SUBJECT_PATTERN = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/;
const PR_SUFFIX = /\s*\(#(\d+)\)\s*$/;

const SECTIONS: readonly (readonly [string, string])[] = [
  ['feat', '新功能'],
  ['fix', '问题修复'],
  ['perf', '性能优化'],
  ['refactor', '重构'],
  ['docs', '文档'],
  ['build', '构建'],
  ['ci', '持续集成'],
  ['chore', '其他'],
];

export function parseSubject(subject: string): ChangelogEntry | null {
  const match = SUBJECT_PATTERN.exec(subject.trim());
  if (!match) {
    return null;
  }
  const type = match[1] ?? '';
  const scope = match[2];
  const bang = match[3];
  const rest = match[4] ?? '';
  const pr = PR_SUFFIX.exec(rest)?.[1] ?? null;
  return {
    type: type.toLowerCase(),
    scope: scope ?? null,
    breaking: bang === '!',
    description: rest.replace(PR_SUFFIX, '').trim(),
    pr,
  };
}

export function renderChangelog(heading: string, subjects: readonly string[]): string {
  const entries = subjects.map(parseSubject).filter((entry): entry is ChangelogEntry => !!entry);
  const lines = [`## ${heading}`, ''];
  const line = (entry: ChangelogEntry): string =>
    `- ${entry.breaking ? '**破坏性变更** ' : ''}${entry.scope ? `**${entry.scope}**：` : ''}${entry.description}${entry.pr ? `（#${entry.pr}）` : ''}`;

  const breaking = entries.filter((entry) => entry.breaking);
  if (breaking.length > 0) {
    lines.push('### 破坏性变更', '', ...breaking.map(line), '');
  }
  const known = new Set(SECTIONS.map(([type]) => type));
  for (const [type, title] of SECTIONS) {
    const items = entries.filter((entry) => entry.type === type && !entry.breaking);
    if (type === 'chore') {
      items.push(...entries.filter((entry) => !known.has(entry.type) && !entry.breaking));
    }
    if (items.length > 0) {
      lines.push(`### ${title}`, '', ...items.map(line), '');
    }
  }
  if (lines.length === 2) {
    lines.push('- 无用户可见变更', '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
