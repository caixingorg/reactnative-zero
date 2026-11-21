# 贡献指南

感谢你愿意参与。本仓库是一个企业级 React Native(Expo)应用模板，提交前请先阅读 [README](README.md) 和 `docs/ARCHITECTURE.md`，并遵守其中的四层架构红线。

## 开发环境

```bash
pnpm install            # 必须使用 pnpm;Node 版本见 .nvmrc
pnpm verify             # 类型检查 + lint + Maestro 流程校验 + 全量测试
pnpm test:coverage      # 采集覆盖率,阈值写在 jest.config.js
```

## 分支

- `main` 受保护，只通过 Pull Request 合并，禁止强推和删除。
- 分支命名为 `<type>/<slug>`，type 取 `feat`、`fix`、`chore`、`docs`、`ci`、`build` 等 Conventional Commits 类型，例如 `fix/webview-bridge-nonce`。
- 一个分支只做一件事，保持 diff 小而聚焦。

## 提交信息

遵循 [Conventional Commits](https://www.conventionalcommits.org/)，由 commitlint 在 `commit-msg` 钩子里校验。提交时 `pre-commit` 钩子会运行 lint-staged、与改动相关的测试和类型检查，请不要用 `--no-verify` 绕过。

## Pull Request

- 使用 squash 合并，**PR 标题本身必须符合 Conventional Commits**，它会成为合并后 `main` 上的提交信息。发布说明由这些提交主题生成（`pnpm changelog`），标题请写成对使用者有意义的一句话。发版步骤见 [docs/RELEASE.md](docs/RELEASE.md)。
- 描述里写清动机、改动范围和验证方式；涉及界面的改动请附截图。
- 必需检查只有 CI 中名为 `Format, 4-Layer Lint, Typecheck & Seam Tests` 的 job。`android-native-build` 与 `e2e-maestro` 带路径或标签过滤，不是必需检查。
- 发布标签 `v*` 只能从 `main` 上打，标签会触发 iOS 端到端流程。

## 不要提交的内容

- 任何凭据、证书、keystore、DSN、API Key 或真实的生产地址。
- 个人本地工作文件：`.scratch/`、`docs/superpowers/`、`docs/agents/` 与 `AGENTS.md` 已在 `.gitignore` 中，仅保留在本地。
- 构建产物与原生目录(`ios/`、`android/`、`dist/`、`coverage/`)。

## 报告问题

功能问题和建议请提交 GitHub Issues。安全问题请参阅 [SECURITY.md](SECURITY.md)。

## 包体积

`bundle-size` workflow 会在 PR 里导出 Android Hermes 字节码，并与 `config/bundle-size-baseline.json` 比较，增长超过 5% 即失败。体积变化是有意为之时，在本地执行 `APP_VARIANT=staging pnpm exec expo export --platform android --clear --output-dir <目录>` 后运行 `pnpm check:bundle-size <目录> --update` 刷新基线，并在 PR 里说明原因。
