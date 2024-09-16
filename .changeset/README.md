# Changesets

本仓库用 [changesets](https://github.com/changesets/changesets) 管理 9 个产品 package 的版本。它们在 `config.json` 的 `fixed` 组中，始终同一版本。

```bash
pnpm changeset
pnpm changeset version
pnpm release
```

发布流程与 npm org / Trusted Publishing 配置见 [`docs/release.md`](../docs/release.md)。
