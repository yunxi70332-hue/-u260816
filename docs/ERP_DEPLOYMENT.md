# USM 配置器与 ERP 单域名部署

## 公网入口

- `https://<DOMAIN>/`：USM 产品设计器。
- `https://<DOMAIN>/erp/`：ERP 登录与管理界面。
- `https://<DOMAIN>/api/`：Fastify API 与 Better Auth 接口。

宝塔 Nginx 负责公网 HTTPS，并将整个网站反向代理到
`http://127.0.0.1:18080`。Docker 内部的 Caddy 再按路径分发请求，
PostgreSQL、MinIO、设计器和 API 端口均不直接暴露到公网。

## 首次部署

1. 将 `.env.example` 复制为 `.env`。
2. 将 `PUBLIC_DOMAIN` 与 `PUBLIC_ORIGIN` 替换为正式域名和 HTTPS Origin。
3. 将 `BETTER_AUTH_URL` 和 `CORS_ORIGINS` 设置为与 `PUBLIC_ORIGIN` 相同的 Origin，不能带路径或结尾 `/`。
4. 为 PostgreSQL、MinIO、`BETTER_AUTH_SECRET` 和初始化管理员生成独立强密码。
5. 在宝塔创建域名网站、申请证书并启用 HTTP 到 HTTPS 跳转。
6. 在宝塔网站中配置反向代理，将所有请求转发到 `http://127.0.0.1:18080`。反代必须保留 `Host`、`X-Forwarded-Host`、`X-Forwarded-Proto` 与 `X-Forwarded-For`；可直接使用 `deploy/baota-reverse-proxy.conf.example`。
7. 校验并启动容器：

```bash
docker compose config
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail 200 api
```

也可在新发布目录中一次性生成生产密钥并启动：

```bash
sh deploy/bootstrap-server.sh <DOMAIN>
```

API 启动时会自动执行 Drizzle 迁移和 Better Auth 初始化。日志出现
`Database migrations completed`，且 API 容器状态变为 `healthy` 后，检查：

```text
https://<DOMAIN>/
https://<DOMAIN>/erp/login
https://<DOMAIN>/api/health
```

## 初始化管理员

`BOOTSTRAP_ADMIN_EMAIL` 与 `BOOTSTRAP_ADMIN_PASSWORD` 只在账号首次创建时生效，
后续重启不会覆盖已有密码。首次登录并完成密码轮换后，从 `.env` 删除以下字段：

- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_NAME`
- `BOOTSTRAP_ADMIN_USERNAME`

然后执行脚本删除初始化字段并重建 API 容器：

```bash
sh deploy/disable-bootstrap-admin.sh
```

## 更新与回滚

更新前先执行数据库备份并保留上一个发布目录：

```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > deploy/backups/usm-erp.dump
docker compose build api designer
docker compose up -d
docker compose ps
docker compose logs --tail 200 api
```

API 启动会自动运行待执行迁移。更新后验证设计器、ERP 登录、组织切换、
设计保存、报价和订单流程。

## 安全基线

- 生产环境只开放宝塔所需端口、SSH、`80/tcp` 和 `443/tcp`。
- Docker 网关只能绑定 `127.0.0.1`，不得改为 `0.0.0.0`。
- 不提交 `.env`、Cookie、数据库备份、对象存储数据或 MCP Token。
- `BETTER_AUTH_SECRET` 至少 32 个随机字符，`SESSION_COOKIE_SECURE=true`。
- PostgreSQL 与 MinIO 只加入 Docker 内部网络，不映射宿主机端口。
- 至少每日备份数据库，并定期验证恢复流程。
