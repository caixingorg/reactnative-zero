# 发布手册

发布由 `.github/workflows/release.yml` 驱动，构建工具仍是 fastlane（见 ADR-0001），本地出包照常可用。

## 一、发版流程

1. 在 PR 里把 `package.json` 的 `version` 改成目标版本，squash 合并到 `main`。
2. 在 `main` 的合并提交上打标签并推送：
   - `vX.Y.Z` 发 **production**。
   - `vX.Y.Z-rc.N`（N 为 1 到 98）发 **staging**。
3. workflow 依次执行：`guard`（标签格式、与 `package.json` 一致、提交属于 `main`、生成发布说明）→ `gate`（与 PR 相同的质量闸门）→ `android` 与 `ios` 出包并分发。
4. `android` 与 `ios` 绑定 GitHub Environment `release`，需要审核人批准后才会开始。闸门失败时不会出包。
5. 标签必须与 `package.json` 的版本一致，否则 `guard` 直接失败。手动触发只能从 `main` 发起，并填写已存在的标签。

版本码和 iOS build number 都由标签推导（主版本不得超过 20，否则超出 Android 版本码上限）：`((主 × 1000 + 次) × 1000 + 修订) × 100 + 槽位`，正式版槽位为 99，rc 槽位为 N。因此 rc 永远小于同版本的正式版，也不依赖 CI 运行序号或提交数。

发布说明由 `<上一个 v* 标签>..<本标签>` 之间（正式版的起点是上一个正式版，rc 不算；rc 版本以上一个标签为起点）的 Conventional Commits 主题行生成（`pnpm changelog`），写入分发通知的「更新说明」。本地预览：`pnpm changelog`，或 `DISTRIBUTE_RELEASE_NOTES_FILE=dist/release-notes.md pnpm distribute:dry-run`。

## 二、必须先完成的仓库设置

这些设置在 GitHub 上，由仓库管理员操作，代码无法替代。

- **Fork PR 的 workflow 审批**：Settings → Actions → General → Fork pull request workflows，选择 **Require approval for all outside collaborators**。这是注册自建 Mac runner 之前的硬性前提。公开仓库里，fork 的 PR 可以修改任何 workflow 的 `runs-on` 并指向自建 runner，不限于发布 workflow。
- **标签保护**：Settings → Rules → Rulesets，新增针对 `v*` 标签的规则，限制创建、更新与删除，只允许管理员。
- **Environment `release`**：必须在第一次打标签**之前**创建，并配置必需审核人；GitHub 在 workflow 首次引用时会自动创建同名环境，但自动创建的环境没有任何保护规则。并把可部署的分支与标签限制为 `v*` 标签，密钥只放在这里，不放仓库级 secret。构建 job 按 `guard` 校验通过的提交 SHA 检出，审核等待期间标签被移动也不会影响出包内容。
- 不要使用 `pull_request_target`，测试会检查这一点。

## 三、Secrets 与变量（Environment `release`）

| 名称 | 类型 | 说明 |
| :-- | :-- | :-- |
| `ANDROID_KEYSTORE_BASE64` | secret | release keystore 的 base64 |
| `ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` | secret | 对应 README 中的签名变量 |
| `PGYER_API_KEY` | secret | 蒲公英上传 |
| `DISTRIBUTE_WEBHOOK_URL` | secret | 群机器人地址 |
| `DISTRIBUTE_WEBHOOK_TYPE` | variable | 群机器人类型 |
| `IOS_TEAM_ID`、`IOS_PROVISIONING_PROFILE` | variable | iOS 手动签名 |
| `MATCH_GIT_URL`、`MATCH_PASSWORD` | secret | 使用 fastlane match 时设置 |
| `IOS_RELEASE_ENABLED` | variable | 设为 `true` 才会运行 iOS job |

production 缺少 Android 签名变量时，release 打包会失败，不会回退成 debug 签名。

## 四、iOS 自建 Mac

- 注册 runner 之前先完成第二节的设置，runner 标签为 `self-hosted`、`macOS`、`ios-release`。
- 在 runner 注册完成之前，不要把 `IOS_RELEASE_ENABLED` 设为 `true`，否则 job 会一直排队。
- 无人值守需要提前解锁登录钥匙串，并让证书与描述文件可用。常驻 runner 加上长期解锁的钥匙串会放大意外风险，建议使用只允许 `release.yml` 的 runner 组，或者临时（ephemeral）runner。
- 这台 Mac 需要预装 Ruby（建议 3.3）与 Bundler，job 会执行 `bundle install` 安装 fastlane。
- 首次使用前，先用 `ad-hoc` 在这台 Mac 上手动跑通一次归档导出，目前还没有用真实证书验证过。

## 五、密钥备份

- production keystore **丢失即无法更新已上架的应用**，也无法找回。生成后立即做两份离线加密备份，存放在不同的物理位置，并记录别名与口令的保管人。
- 备份内容：keystore 文件、别名、两个口令。口令与 keystore 分开保管。
- 每次换保管人或换机器，核对一次备份可用：用备份的 keystore 签一个测试包，比对证书指纹。
- iOS 证书与描述文件由 match 仓库管理，备份 match 仓库与 `MATCH_PASSWORD`。

## 六、灰度与回滚

- 灰度：先发 `-rc.N`（staging）给测试，确认后再打正式标签。**第一次真实发布务必用 rc 标签**：这条流水线（含 fastlane 的 Android 出包 lane）还没有在 GitHub 上完整跑过，先让问题出现在 staging，而不是 production。
- 回滚：目前没有热更新（OTA 暂缓），回滚的做法是**用修复后的代码重新发一个更高的版本，同时在分发平台下架有问题的旧包**。不要重打或移动已有标签。
- 紧急情况下如需强制升级或关闭功能，见后续的最低版本与 kill switch 方案（issue 16）。

## 七、故障处理

| 现象 | 处理 |
| :-- | :-- |
| `guard` 提示标签与 `package.json` 不一致 | 先合并版本号修改，再从新的 `main` 提交打标签 |
| `guard` 提示标签不在 `main` 上 | 标签打在了分支提交上，删除标签后在 `main` 上重打 |
| Android 报 production release signing 缺少变量 | 在 Environment `release` 补齐第三节的变量，重新运行 |
| iOS job 一直排队 | runner 未注册或离线；未准备好时把 `IOS_RELEASE_ENABLED` 置为空 |
| 从海外 runner 上传蒲公英很慢或失败 | 目前没有验证过海外 runner 上传蒲公英的速度，首次发版前先做一次真实上传验证 |
