// 原因：仓库历史已遵循 Conventional Commits（如 feat(tooling): ...），此处把约定变为自动校验
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 原因：提交主题允许中文，且常带较长的范围说明，放宽到 120 字符
    'header-max-length': [2, 'always', 120],
  },
};
