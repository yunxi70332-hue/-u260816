# USM 配置器与 ERP 多实例部署

本指南适用于同一台宝塔服务器部署 2-5 套相互隔离的 USM 配置器。每一套必须有独立的域名、Compose 项目名、环境文件、网关端口、PostgreSQL 卷、MinIO 卷、密钥和备份目录。

## 目录与映射

推荐将 Git 源码与运行数据分开，避免更新代码时覆盖实例配置或备份：

```text
/www/docker/usm/
  source/                 # 本仓库，跟踪 main
  instances/usm-01/.env   # 权限 600，不能提交 Git
  instances/usm-02/.env
  backups/usm-01/
  backups/usm-02/
```

| 实例 | 域名 | 网关端口 | Compose 项目名 | 环境文件 | 备份目录 |
| --- | --- | --- | --- | --- | --- |
| usm-01 | usm1.example.com | 18080 | usm-01 | `instances/usm-01/.env` | `backups/usm-01` |
| usm-02 | usm2.example.com | 18081 | usm-02 | `instances/usm-02/.env` | `backups/usm-02` |

Docker 内部继续使用 8080、9012、5432、9000 和 9001。只有 Caddy 网关通过 `127.0.0.1:<GATEWAY_PORT>` 绑定宿主机；PostgreSQL 和 MinIO 均没有公网端口。

## 首次创建实例

在 `/www/docker/usm/source` 中逐套执行，不要同时构建多个实例：

```bash
git fetch origin main
git checkout main
git pull --ff-only origin main

sh deploy/bootstrap-instance.sh usm-01 usm1.example.com 18080
```

脚本会创建 `/www/docker/usm/instances/usm-01/.env`、`/www/docker/usm/backups/usm-01/`，生成独立数据库、对象存储、认证密钥和初始平台管理员，并在启动后检查：

```text
http://127.0.0.1:18080/api/health
```

环境文件必须至少包含这些实例隔离字段：

```dotenv
COMPOSE_PROJECT_NAME=usm-01
GATEWAY_PORT=18080
BACKUP_DIR=/www/docker/usm/backups/usm-01
PUBLIC_DOMAIN=usm1.example.com
PUBLIC_ORIGIN=https://usm1.example.com
POSTGRES_DB=usm_erp_01
POSTGRES_USER=usm_erp_01
S3_BUCKET=usm-erp-01
```

`POSTGRES_PASSWORD`、`DATABASE_URL`、`BETTER_AUTH_SECRET`、MinIO 密钥和 `BOOTSTRAP_ADMIN_PASSWORD` 也必须每套独立。环境文件设置 `chmod 600`，不可提交到 Git。不要为卷或网络设置固定的 Docker `name`；Compose 会使用 `COMPOSE_PROJECT_NAME` 自动产生 `usm-01_postgres_data`、`usm-01_object_data` 等隔离资源。

普通运行命令可使用统一包装脚本，避免漏写环境文件或项目名：

```bash
sh deploy/instance-compose.sh usm-01 ps
sh deploy/instance-compose.sh usm-01 logs --tail 200 api
sh deploy/instance-compose.sh usm-01 up -d --build
```

等价的原生命令为：

```bash
docker compose -p usm-01 \
  --env-file /www/docker/usm/instances/usm-01/.env \
  -f /www/docker/usm/source/docker-compose.yml up -d --build
```

## 宝塔网站与反向代理

为每个域名各建一个宝塔网站、各申请一张 SSL 证书，并只反代到本实例的 loopback 端口：

```text
usm1.example.com -> http://127.0.0.1:18080
usm2.example.com -> http://127.0.0.1:18081
```

使用 `deploy/baota-reverse-proxy.conf.example` 作为模板，替换其中的端口。保留 `Host`、`X-Forwarded-*` 请求头。公网仅开放 80/443（及必要的 SSH）；不要开放 PostgreSQL、MinIO、8080 或 9012。

验收地址：

```text
https://<DOMAIN>/
https://<DOMAIN>/erp/login
https://<DOMAIN>/api/health
```

## 平台管理员

部署时生成的 `BOOTSTRAP_ADMIN_EMAIL` 是隐藏的平台运维/所有者账号。它可跨企业工作区监察和授权，但企业侧的“账号与权限”不展示此账号、账号 ID 或其操作人身份。企业管理员是企业侧可见的最高管理角色。

平台账号完成首次登录和强制改密后，立即关闭引导配置，避免后续重启重新执行引导逻辑：

```bash
USM_INSTANCE_ENV_FILE=/www/docker/usm/instances/usm-01/.env \
  sh deploy/disable-bootstrap-admin.sh --project-name usm-01
```

脚本会先验证临时环境文件，再保存带 UTC 时间戳的环境备份，最后仅重建目标实例的 API 容器。

修复历史平台账号前，先备份该实例，再显式确认目标项目：

```bash
sh deploy/backup-instance.sh usm-01
USM_INSTANCE_ENV_FILE=/www/docker/usm/instances/usm-01/.env \
  sh deploy/repair-platform-admin.sh --project-name usm-01 --confirm admin@usm1.example.com
```

该命令会清除目标平台账号在企业成员上的业务授权、注销旧会话并要求下次登录改密，因此不得针对不确定的实例执行。

## 更新、备份与回滚

每次只更新一个实例。更新前先完成 PostgreSQL 和 MinIO 数据备份：

```bash
sh deploy/backup-instance.sh usm-01
git fetch origin main
git checkout main
git pull --ff-only origin main
sh deploy/instance-compose.sh usm-01 up -d --build
curl --fail http://127.0.0.1:18080/api/health
```

备份目录会生成 `usm-01-<UTC 时间>/postgres.dump`、`minio-data/`、`metadata.txt` 和 `SHA256SUMS`。恢复演练必须在维护窗口内进行；数据库恢复或误把对象数据恢复到另一实例会覆盖现有数据。

API 启动时会自动运行数据库迁移。因此发生不兼容迁移时，不能只回退代码或镜像：必须使用更新前保留的代码版本，并按同一实例的数据库与对象存储备份恢复。不要执行 `docker compose down -v` 或 `docker system prune --volumes`。

## 隔离验收与删除

逐套确认首页、ERP 登录、`/api/health`、报价/订单、附件上传都正常；停止 `usm-01` 后，`usm-02` 的站点与数据仍应正常。确认 `docker volume ls` 中 PostgreSQL 和 MinIO 卷均带实例前缀，且备份只进入对应目录。

删除前必须核对项目名、完成实例备份，并得到明确确认。日常停止或更新只操作目标项目，例如：

```bash
sh deploy/instance-compose.sh usm-01 stop
sh deploy/instance-compose.sh usm-01 up -d
```
