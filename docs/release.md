# npm 发布

产品 package 以 `@xunserver-jsf/*` 公开发布。根仓库与 `examples/*` 保持 `private`，不会被 publish。九个产品包固定同一 semver。

GitHub 仓库：https://github.com/xunserver/json-schema-form  
文档站：https://xunserver.github.io/json-schema-form/  
Playground：https://xunserver.github.io/json-schema-form/playground/

## 账号侧一次性配置

这些步骤只能在 npm / GitHub 网页或本机交互式 CLI 完成，不进代码。Granular access token（即使勾了 Bypass 2FA）**不能**登记 Trusted Publisher。

1. 在 [npm](https://www.npmjs.com/) 登录有 2FA 的账号，创建 organization **`xunserver-jsf`**（与已有的 `@xunserver` 不是同一个 org）。
2. 九个产品包必须已经存在于 registry（首次可用本机 `npm publish --access public`）。Trusted Publisher 不能挂到还不存在的包上。
3. 为每个产品包登记 Trusted Publisher，指向本仓库的 release workflow。字段必须完全一致（大小写敏感）：
   - Provider：GitHub Actions
   - Organization or user：`xunserver`
   - Repository：`json-schema-form`
   - Workflow filename：`release.yml`（只填文件名，不要写成 `.github/workflows/release.yml`）
   - Environment：留空
   - Allowed actions：勾选 **`npm publish`**（当前 CI 走 `changeset publish` 直发）。需要的话可同时勾 `npm stage publish`。
4. GitHub Actions job 已申请 `id-token: write`，并用 Node 24 / npm ≥ 11.5.1 走 OIDC。不要再放长期 `NPM_TOKEN`。
5. 第一次正式 `latest` 之前，先在本地或 CI 用 dry-run 确认 tarball。

网页路径：每个包的 **Settings → Trusted publishing**。也可以用 CLI（第一次会要 2FA；网页上可勾「后续 5 分钟跳过 2FA」，再跑完其余包）：

```bash
npm login --auth-type=web --scope @xunserver-jsf

for pkg in \
  @xunserver-jsf/core \
  @xunserver-jsf/validator-ajv \
  @xunserver-jsf/vue \
  @xunserver-jsf/react \
  @xunserver-jsf/element-plus \
  @xunserver-jsf/antd \
  @xunserver-jsf/arco-vue \
  @xunserver-jsf/arco-react \
  @xunserver-jsf/shadcn
do
  npm trust github "$pkg" \
    --file release.yml \
    --repo xunserver/json-schema-form \
    --allow-publish \
    --allow-stage-publish \
    -y
  sleep 2
done
```

核对：

```bash
npm trust list @xunserver-jsf/core --json
```

OIDC 跑通之后，建议在每个包 **Settings → Publishing access** 选 “Require two-factor authentication and disallow tokens”，并撤销本机用过的 publish token。

## 本地命令

```bash
pnpm changeset          # 记录本次用户可见变化
pnpm changeset version  # 把 changeset 打进同一版本与 CHANGELOG
pnpm pack:check         # 构建后检查将上传的文件列表
pnpm release            # changeset publish（需已登录 npm 或 CI OIDC）
```

`pnpm verify:v1` 是发布质量门禁；CI 在 publish 前会跑它。

## 当前版本

产品包当前是 `1.1.1`。之后只通过 changeset bump，再由 `master` 上的 `release.yml` 用 Trusted Publishing 发新版本。

本地试打包（不上传）：

```bash
pnpm build
pnpm pack:check
```

tarball 应包含 `dist/*.js`、`.d.ts`、source map、`LICENSE`、`README.md`；不应包含 `src/`、测试或 `tsconfig`。
