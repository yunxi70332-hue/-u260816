# C 端门户版本回退指南

本说明对应 C 端门户首个发布版本：`v4.22.0-cportal.1`，提交：`6892093`。

## 推荐回退流程

1. 先登录 ERP，在“设置 → C端使用端口”中停用门户。这样可以先停止新用户进入 C 端配置流程，再进行代码回退。
2. 在仓库目录执行以下命令。该方式会生成一个新的反向提交，不改写共享分支历史：

```bash
git fetch origin --tags
git switch main
git pull --ff-only origin main
git revert --no-edit 6892093
git push origin main
```

3. 回退后运行最小验证：

```bash
pnpm typecheck
pnpm build:designer
pnpm test
```

4. 验证通过后再按部署流程重启设计器、API 和 ERP 服务。

## 查看版本或恢复主分支

如需临时查看门户版本，不要在 `main` 上改动提交：

```bash
git fetch origin --tags
git switch --detach v4.22.0-cportal.1
```

查看完成后恢复主分支：

```bash
git switch main
git pull --ff-only origin main
```

## 禁止操作

- 不要使用 `git reset --hard` 覆盖本地工作，也不要删除尚未提交的文件。
- 不要对共享仓库执行 `git push --force` 或 `git push --force-with-lease`。
- 回退时不要暂存或覆盖与本功能无关的本地改动，例如未提交的 `package-lock.json`。

## 可直接交给 AI 的回退指令

```text
请在当前仓库安全回退 C 端门户版本 v4.22.0-cportal.1（提交 6892093）。
先查看 git status，保留所有用户未提交改动，尤其不要修改 package-lock.json。
先执行 git fetch origin --tags、git switch main、git pull --ff-only origin main，
然后只对提交 6892093 执行 git revert --no-edit 6892093，解决冲突时不要覆盖用户改动。
运行 pnpm typecheck、pnpm build:designer、pnpm test；全部通过后提交反向提交并推送到 origin/main。
禁止使用 git reset --hard、git checkout --、git clean -fd 和任何形式的强制推送。
最后报告反向提交哈希、测试结果和仍未提交的文件。
```

## 说明

`git revert` 会保留完整历史，未来如果市场重新需要 C 端门户，可以基于原标签或后续修复提交重新启用。门户运行期间产生的内存数据不会通过 Git 回退恢复；API 重启后当前实现中的门户配置、客户和事件数据会丢失。
