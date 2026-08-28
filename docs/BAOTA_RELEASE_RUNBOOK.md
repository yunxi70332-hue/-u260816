# 宝塔 Docker 发布与回滚流程

本流程适用于宝塔服务器项目 `/www/wwwroot/jimuces1`，Compose 项目名为 `usm-configurator-erp`。目标是每次更新都留下完整记录，并在构建后完成服务、入口、ERP 和 C 端验收。

## 1. 发布前

在本地仓库执行：

```bash
git status --short --branch
pnpm typecheck
pnpm build:designer
pnpm build:api
pnpm build:erp
pnpm test
git diff --check
```

只提交本次功能相关文件，保留用户未提交改动。提交并推送后记录提交号：

```bash
git add <本次文件>
git commit -m "<本次更新说明>"
git push origin main
git rev-parse --short HEAD
```

## 2. 宝塔服务器更新

先在服务器确认当前项目和资源状态，不使用无项目名的裸 Compose 命令：

```bash
cd /www/wwwroot/jimuces1
git status --short --branch
git fetch origin main
git pull --ff-only origin main
git rev-parse --short HEAD
```

有生产数据时，先按实例备份 PostgreSQL 和 MinIO，再继续更新。备份目录和环境文件必须属于同一个实例。

```bash
USM_INSTANCE_ENV_FILE=/www/wwwroot/jimuces1/.env \
  sh deploy/backup-instance.sh usm-configurator-erp
```

使用固定项目名、环境文件和 Compose 文件重新构建启动：

```bash
docker compose \
  --project-name usm-configurator-erp \
  --env-file /www/wwwroot/jimuces1/.env \
  -f /www/wwwroot/jimuces1/docker-compose.yml \
  up -d --build
```

日常更新不执行 `docker compose down -v`，也不执行 `docker system prune --volumes`。

## 3. 端口冲突处理

若网关无法绑定 `127.0.0.1:18080`，先查占用者：

```bash
docker ps -a --format '{{.Names}}|{{.Status}}|{{.Ports}}'
ss -ltnp | grep 18080
docker compose ls --all
```

确认占用者是同一业务的旧网关后，只停止该旧网关，再启动目标项目网关：

```bash
docker stop <确认后的旧网关容器>
docker compose --project-name usm-configurator-erp \
  --env-file /www/wwwroot/jimuces1/.env \
  -f /www/wwwroot/jimuces1/docker-compose.yml \
  up -d gateway
```

如果占用者属于其他业务，暂停发布并记录，不要擅自改端口或停止其他项目。

## 4. 发布后验收

先确认五个服务都在运行，API、设计器和数据库健康：

```bash
docker ps --format '{{.Names}}|{{.Status}}|{{.Ports}}'
curl -fsS http://127.0.0.1:18080/api/health
curl -fsSI -H 'Host: usm.seven-cloud.cn' http://127.0.0.1:18080/
curl -fsSI -H 'Host: usm.seven-cloud.cn' http://127.0.0.1:18080/erp/
```

确认首页 HTML 引用新资源 hash，并在对应 JS 资源中搜索本版本关键文案（例如 `基础一格预览`、`注册后继续搭建`）。浏览器侧使用强制刷新或无痕窗口，避免旧缓存干扰。

C 端门户验收：

1. ERP 登录后进入“设置 → C端使用端口”。
2. 启用门户，设置唯一 slug、可开放模块和企业客服验证码，保存。
3. 打开 `/portal/<slug>`，确认未注册用户能看到基础一格。
4. 点击新增模块或受限模块，确认出现注册/登录悬浮窗。
5. 注册或登录后，确认开放模块可用。
6. 在 ERP 的门户时间线确认 `opened`、`first_generated`、`config_changed`、`saved`、`exported` 等事件。

API 验收地址：

```text
GET /api/health
GET /api/portal/<slug>
POST /api/portal/<slug>/signup
POST /api/portal/<slug>/login
GET /api/organization/portal/timeline
```

每次发布记录：日期、Git 提交号、构建命令、容器状态、健康检查结果、首页资源 hash、门户 slug 和遗留问题。

## 5. 回滚

优先使用反向提交，不改写共享分支历史：

```bash
git fetch origin --tags
git switch main
git pull --ff-only origin main
git revert --no-edit <需要回退的提交>
git push origin main
```

服务器同步回退提交后，重复第 2 至第 4 节的构建和验收。数据库迁移已经执行时，不能只回退代码；必须使用对应时间点的 PostgreSQL/MinIO 备份恢复，并在维护窗口验证。

## 6. 彻底清空并重新部署

这是破坏性操作，只在明确要清空当前实例数据时执行。它会删除当前项目的容器、PostgreSQL 数据卷、MinIO 对象卷和项目网络；源码目录保留。

先确认目标容器和卷只属于本项目：

```bash
docker ps -a
docker volume ls
docker compose ls --all
```

确认后，使用明确的容器名和卷名清理，不调用 `down -v`：

```bash
docker rm -f \
  usm-configurator-erp-gateway-1 \
  usm-configurator-erp-api-1 \
  usm-configurator-erp-designer-1 \
  usm-configurator-erp-postgres-1 \
  usm-configurator-erp-minio-1

docker volume rm \
  usm-configurator-erp_postgres_data \
  usm-configurator-erp_object_data

docker network rm \
  usm-configurator-erp_private \
  usm-configurator-erp_public
```

清空后必须复查 `docker ps -a`、`docker volume ls`、`docker compose ls --all` 和宝塔数据库列表为空，再上传新版并从第 2 节开始部署。若服务器同时存在旧项目名实例，必须逐个列出并确认后再清理，不能按通配符误删。

## 7. 这次清理记录

- 日期：2026-08-28
- 目标目录：`/www/wwwroot/jimuces1`
- 已清理：两套旧/新 Compose 实例的 10 个容器、4 个 PostgreSQL/MinIO 数据卷、4 个项目网络
- 面板数据库：清理前列表为空
- 保留：源码目录 `/www/wwwroot/jimuces1`
- 清理后复查：容器、卷、Compose 项目、数据库进程均为空
