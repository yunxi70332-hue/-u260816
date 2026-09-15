# 宝塔 USM 实例更新 SOP（保留数据库 · 更新代码）

> 用途：把本仓库的新代码发布到宝塔服务器上的 Docker 实例，**保留数据库**。
> 本文档面向 AI 执行：按顺序执行，每步有验证点，失败按「排错」节处理。
> 最后验证：2026-09-05，modun 实例发布 `7af48f8` 全流程走通。

---

## 一、连接通道：baota-mcp

宝塔 MCP 已配置在本机 `C:\Users\Administrator\.zcode\cli\config.json` 的 `mcp.servers["baota-mcp"]`（HTTP MCP，指向 `https://85.137.246.59:8765/...`，带 Bearer token）。

**注意**：它通常不在 AI 会话的工具列表里，需用辅助脚本按 MCP JSON-RPC 协议调用。脚本模板（本机现成一份在 `E:\尝试搭建模块\tmp\bt.py`）：

```python
# bt.py —— 调用宝塔 MCP 工具
# 用法: python bt.py <ToolName> ['{"json":"args"}']   或   python bt.py <ToolName> -f args.json
import json, sys, urllib.request, ssl

cfg = json.load(open(r'C:\Users\Administrator\.zcode\cli\config.json', encoding='utf-8'))
bt = cfg['mcp']['servers']['baota-mcp']
url, headers = bt['url'], dict(bt.get('headers', {}))

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE   # 服务器为自签证书

def rpc(payload):
    h = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', **headers}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=h, method='POST')
    resp = urllib.request.urlopen(req, timeout=120, context=ctx)
    body = resp.read().decode('utf-8', 'replace')
    m = None
    for line in body.splitlines():
        if line.startswith('data: '):
            m = line[6:]
    return json.loads(m if m else body)

tool = sys.argv[1]
if len(sys.argv) > 2:
    if sys.argv[2] == '-f':
        args = json.load(open(sys.argv[3], encoding='utf-8'))
    else:
        args = json.loads(sys.argv[2])
else:
    args = {}
data = rpc({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args}})
result = data.get('result', {})
if result.get('isError'):
    print("TOOL_ERROR")
for c in result.get('content', []):
    if c.get('type') == 'text':
        print(c.get('text', ''))
```

### 调用规则（踩过的坑）

1. **含引号/反斜杠/管道的 shell 命令一律写进 `args.json` 用 `-f` 传参**，不要内联 JSON（转义极易出错）。`args.json` 格式：`{"command": "...", "timeout": 20}`。
2. **MCP Bash 前台最多 20 秒**。长命令（备份、构建）必须传 `"run_in_background": true`，返回 `task_id` 后用 `BashStatus`（`"wait": true, "timeout": ...`）轮询直到 `status: done`，看 `exit_code` 和 `stdout` 判定成败。
3. 常用只读工具：`SystemInfo`、`LS`、`Read`、`BashStatus`。写操作类：`Bash`（sh -c）、`ServiceRestart` 等。
4. **MCP Bash 环境没有 `$HOME`**：涉及 `git config --global`（如 safe.directory）需先 `export HOME=/root`，否则报 `$HOME not set`。
5. **服务器 git 只有拉取凭据（https 只读）**：若发现实例工作区有未推送的本地提交，不要 `reset --hard` 丢弃——先 `git branch save-xxx <hash>` 本地留存 + `git format-patch -1 <hash> --stdout` 导出补丁回流本地 main，测试通过推送后再 `pull --ff-only` 同步。

## 二、实例档案（已核实，2026-09-05）

| 实例 | 源码目录 | env 文件 | 项目名 | 网关 | 域名 | 备份目录 |
| --- | --- | --- | --- | --- | --- | --- |
| modun（C端+ERP） | `/www/docker/usm-modun/source` | `/www/docker/usm-modun/instances/modun/.env` | `modun` | `127.0.0.1:18081` | `https://modun.usmxx.xyz` | `/www/docker/usm-modun/backups/modun` |
| 七云（C端+ERP） | `/www/wwwroot/jimuces1` | `/www/wwwroot/jimuces1/.env` | `usm-configurator-erp` | `127.0.0.1:18080` | `https://usm.seven-cloud.cn` | 见 env 的 `BACKUP_DIR` |

⚠️ **宝塔站点目录不是部署目录**：如 `/www/wwwroot/modun.usmxx.xyz` 只是 nginx 静态壳（默认欢迎页），真正源码按上表。新实例按「侦察」节现场确认，不要照抄本表。

⚠️ **2026-09-12 起两实例已迁至 103.117.121.126（新服务器，CentOS Stream 9）**：宝塔 MCP 用 `搬家-mcp`（`https://103.117.121.126:8765/...`），AI 会话可直接用 MCP 工具（`mcp Bash/Read/ServerIP` 等），无需 bt.py。迁移当天已处理：`dnf install -y git`（新机无 git）；七云 remote 由 SSH 改 https（新机无部署密钥）；七云工作区被删的 `index.html` 已还原（构建需 COPY 该文件）；modun 的 2026-09-09 服务器热修已回流 main（`009496d`）并清理工作区。

⚠️ **新机 npm 网络抖动大**：pnpm install 反复超时。已在两个 Dockerfile 固化：npmmirror 源 + pnpm fetch retries=10/超时拉长 + BuildKit cache mount（pnpm store 跨构建续传）。构建失败直接重试即可，缓存层会增量推进。

⚠️ 完整发布手册在仓库 `docs/BAOTA_RELEASE_RUNBOOK.md`；多实例规范在 `docs/ERP_DEPLOYMENT.md`。

## 三、侦察：确定实例四要素（只读）

```bash
docker compose ls --all                 # CONFIG FILES 列 = 各实例 compose 文件路径
docker ps -a --format '{{.Names}}|{{.Status}}|{{.Ports}}'   # 容器名前缀 = 项目名；127.0.0.1:PORT->80 = 网关端口
docker inspect <项目名>-gateway-1 --format '{{index .Config.Labels "com.docker.compose.project.environment_file"}}'   # env 文件路径
grep -E '^(COMPOSE_PROJECT_NAME|GATEWAY_PORT|BACKUP_DIR|PUBLIC_DOMAIN|PUBLIC_ORIGIN)=' <env文件>    # 四要素（不回显密码）
git -C <源码目录> remote -v              # 必须是 yunxi70332-hue/-u260816
```

## 四、发布流程（逐步执行，逐步验证）

### 第 0 步：本地发布前检查

```bash
git status --short --branch        # 干净且已推送
git rev-parse --short HEAD         # 记录目标提交号，例：7af48f8
npx tsc --noEmit                   # 类型检查
```

镜像在服务器 Docker 内构建，本地无需 `pnpm build`。

### 第 1 步：服务器 Git 同步

```bash
cd <源码目录>
git status --short --branch        # 应为干净工作区
git fetch origin main
git pull --ff-only origin main     # 禁止 merge/rebase
git rev-parse --short HEAD         # 必须等于目标提交号
```

### 第 2 步：备份数据库 + MinIO（必须先于任何容器操作）

```bash
cd <源码目录>
USM_INSTANCE_ENV_FILE=<env文件> sh deploy/backup-instance.sh <项目名>
```

- 输出 `PostgreSQL and MinIO backup created: <BACKUP_DIR>/<项目名>-<时间戳>` 即成功
- **后台执行 + BashStatus 轮询**（耗时约 30-60 秒）
- 备份失败 → 停止发布，排查后再来，**绝不跳过备份**

### 第 3 步：重建容器（构建新镜像 + 重建容器 = 新代码生效）

```bash
docker compose \
  --project-name <项目名> \
  --env-file <env文件> \
  -f <源码目录>/docker-compose.yml \
  up -d --build
```

- **后台执行 + BashStatus 轮询**（正常 5-10 分钟），`exit_code=0` 且输出 `... Healthy` 即成功
- **为何不是 `docker restart`**：代码是构建时 COPY 进镜像的，restart 不会带入新代码；`up -d --build` 构建新镜像并重建容器才生效
- **数据库为何安全**：数据在 `postgres_data`/`object_data` 数据卷里，重建容器不动卷。**红线：绝不执行 `docker compose down -v`、`docker system prune --volumes`、不删卷删容器**
- 每条 compose 命令必须固定带 `--project-name`、`--env-file`、`-f` 三个参数，防止误操作到别的实例
- 构建失败不影响线上（旧容器继续跑），修复后重试即可
- 网关端口被占：先 `docker ps`/`ss -ltnp | grep <PORT>` 定位；确认是本实例旧网关才处理，他人业务一律不动并上报

### 第 4 步：验收（全过才算发布成功）

```bash
docker ps --format '{{.Names}}|{{.Status}}' | grep <项目名>
# 全部 Up，重建的服务显示 (healthy)
curl -fsS http://127.0.0.1:<网关端口>/api/health
# {"status":"ok","repository":"postgres",...}
curl -fsSI -o /dev/null -w '%{http_code}\n' http://127.0.0.1:<网关端口>/erp/
# 200
curl -fsS http://127.0.0.1:<网关端口>/ | grep -oE 'assets/index-[A-Za-z0-9_-]+[.](js|css)'
# 资源 hash 与上次不同 = 新构建已生效
docker exec <项目名>-designer-1 sh -c 'grep -lo "本次新功能的特征文案" /usr/share/nginx/html/assets/index-*.js'
# 能 grep 到 = 新功能在产物里
curl -fsSI -o /dev/null -w '%{http_code}\n' https://<域名>/       # 线上 200
curl -fsS https://<域名>/api/health
```

若本次含数据库迁移：进 postgres 容器确认新表存在，例如
`docker exec <项目名>-postgres-1 sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -c "\d login_logs"'`

## 五、排错速查

| 症状 | 处理 |
| --- | --- |
| 构建在 `pnpm install` 报 `TimeoutError` / `aborted due to timeout` | npm 源瞬时抖动，**直接重试**（已完成的前置层有缓存）；连续失败再考虑给 Dockerfile 加 npmmirror 源 |
| bt.py 报 `Invalid \escape` | 命令含反斜杠/引号，改用 `-f args.json` |
| 构建命令 20s 被切后台但没给输出 | 正常，用返回的 task_id 轮询 `BashStatus` |
| 网关起不来提示端口占用 | 见第 3 步「网关端口被占」 |
| 线上 502 | `docker ps` 看容器是否 healthy → `docker logs <项目名>-api-1 --tail 50` → 多为构建产物或迁移报错 |
| C 端页面没变化 | 核对首页资源 hash 是否变化；浏览器强刷/无痕 |

## 六、回滚

```bash
cd <源码目录>
git revert --no-edit <问题提交> && git push origin main   # 先在本地仓库 revert 推送
# 服务器重新走：第 1 步（pull）→ 第 3 步（up -d --build）→ 第 4 步（验收）
```

⚠️ **数据库迁移已执行时，代码回退不够**：必须用第 2 步的备份恢复 PostgreSQL/MinIO（恢复脚本与流程见 `docs/BAOTA_RELEASE_RUNBOOK.md` §6），并在维护窗口验证。这就是"先备份再构建"的原因。

## 七、发布记录格式（每次发布后追加到本文档末尾）

```
### YYYY-MM-DD HH:mm 实例名
- 提交：<hash>（<一句话说明>）
- 备份：<备份目录名>
- 构建：成功/重试 N 次
- 验收：健康检查 ok / 新资源 hash index-XXXX.js / 迁移 <名> 已应用 / 线上 200
- 遗留：无 / <问题>
```

### 2026-09-05 11:30 modun
- 提交：7af48f8（设计器选中框隐藏与释放编辑、企业账号登录日志、移动端兼容修复、销售合同、结构扩展交互）
- 备份：/www/docker/usm-modun/backups/modun/modun-20260905T030815Z
- 构建：重试 1 次（首次 pnpm install 网络超时）
- 验收：健康检查 ok / 新资源 hash index-Cl7KZOLA.js / 迁移 0017_login_logs 已应用 / 线上 200
- 遗留：无

### 2026-09-05 12:12 usm-configurator-erp（七云）
- 提交：bab67fb（在 7af48f8 基础上仅新增文档：宝塔更新SOP 及重命名，无代码差异）
- 备份：/www/docker/usm/backups/usm-01/usm-configurator-erp-20260905T040508Z
- 构建：一次成功
- 验收：健康检查 ok / 新资源 hash index-BfSQ14Rr.js（含「隐藏选中框」文案）/ 迁移 0017_login_logs 已应用 / 线上 https://usm.seven-cloud.cn 200
- 遗留：无

### 2026-09-05 17:26 modun
- 提交：982392d（修复 3D 高度/深度外部尺寸标注字号过小、放大时相对缩小）
- 备份：/www/docker/usm-modun/backups/modun/modun-20260905T091818Z
- 构建：一次成功
- 验收：健康检查 ok / 新资源 hash index-DYpVUwdq.js（含标注新常量 `qO=.68,JO=24`）/ 无迁移 / 线上 https://modun.usmxx.xyz 200
- 遗留：无

### 2026-09-05 17:52 usm-configurator-erp（七云）
- 提交：982392d（同上，与 modun 保持同步）
- 备份：/www/docker/usm/backups/usm-01/usm-configurator-erp-20260905T094447Z
- 构建：一次成功
- 验收：健康检查 ok / 新资源 hash index-BXGk9oR7.js（含标注新常量 `qO=.68,JO=24`）/ 无迁移 / 线上 https://usm.seven-cloud.cn 200
- 遗留：无

### 2026-09-05 18:27 modun
- 提交：e673a30（深度等短标注线字号统一：贴图字形 92px/收内边距、预算 46px 目标 36px 下限、fit 1.0，叠加在 982392d 之上）
- 备份：/www/docker/usm-modun/backups/modun/modun-20260905T101716Z
- 构建：一次成功（仅 designer 重建，本次只改前端）
- 验收：健康检查 ok / 新资源 hash index-BExEiUFW.js / 无迁移 / 线上 https://modun.usmxx.xyz 200
- 遗留：无

### 2026-09-05 18:35 usm-configurator-erp（七云）
- 提交：e673a30（同上，与 modun 保持同步）
- 备份：/www/docker/usm/backups/usm-01/usm-configurator-erp-20260905T102658Z
- 构建：一次成功（仅 designer 重建）
- 验收：健康检查 ok / 新资源 hash index-CRYDOMAF.js / 无迁移 / 线上 https://usm.seven-cloud.cn 200
- 遗留：无

### 2026-09-05 18:56 modun
- 提交：e69a7d4（尺寸标注防重叠：高度/深度车道间距拉大，标注预算回调 40px/30px/fit0.9）
- 备份：/www/docker/usm-modun/backups/modun/modun-20260905T104537Z
- 构建：一次成功（仅 designer 重建）
- 验收：健康检查 ok / 新资源 hash index-CqoZRaBE.js / 无迁移 / 线上 https://modun.usmxx.xyz 200
- 遗留：无

### 2026-09-05 19:05 usm-configurator-erp（七云）
- 提交：e69a7d4（同上，与 modun 保持同步）
- 备份：/www/docker/usm/backups/usm-01/usm-configurator-erp-20260905T105532Z
- 构建：一次成功（仅 designer 重建）
- 验收：健康检查 ok / 新资源 hash index-DOeRUcGf.js / 无迁移 / 线上 https://usm.seven-cloud.cn 200
- 遗留：无

### 2026-09-07 02:11 modun
- 提交：235b490（克隆/新增一列后台面错位穿模修复 + 3D 尺寸标注跟随视口缩放）
- 备份：/www/docker/usm-modun/backups/modun/modun-20260906T175838Z
- 构建：一次成功（designer + api 均重建，本次只改前端逻辑但 compose 全量构建）
- 验收：健康检查 ok / 新资源 hash index-DM6mvQbT.js（含 `=[.3,3]` 缩放钳制与 `fromColumn>=` 台面移位指纹）/ 无迁移 / 线上 https://modun.usmxx.xyz 200
- 遗留：无

### 2026-09-07 02:11 usm-configurator-erp（七云）
- 提交：235b490（同上，与 modun 保持同步）
- 备份：/www/docker/usm/backups/usm-01/usm-configurator-erp-20260906T175927Z
- 构建：一次成功（designer + api 均重建）
- 验收：健康检查 ok / 新资源 hash index-Rhmu-O0H.js（含同上两枚指纹）/ ERP 200 / 无迁移 / 线上 https://usm.seven-cloud.cn 200（本机实测 200；服务器本机首次 curl 域名瞬时 DNS 解析失败，重试即恢复，非发布问题）
- 遗留：无

### 2026-09-12 14:20 modun（103.117.121.126 新服务器首次发布）
- 提交：009496d（竖管自动合并 175+175→350 + 回流 2026-09-09 服务器热修：玻璃门/上翻门计价口径、围边 BOM 规格、tab 顺序 + Dockerfile pnpm 网络强化）
- 备份：/www/docker/usm-modun/backups/modun/modun-20260912T052931Z
- 构建：重试 4 次（前 3 次新机 npm 网络抖动超时，加 cache mount/retries 强化后成功）
- 验收：健康检查 ok / 新资源 hash index-BKy69KLI.js（含 `y-merged`/`连通竖向钢管` 指纹）/ ERP 产物含 `glassClip`（热修口径）/ 无迁移 / 线上 https://modun.usmxx.xyz 200
- 遗留：stash "pre-009496d-cleanup" 保留在 modun 工作区作保险（内容已回流 main）；.bak-20260909 备份文件未删

### 2026-09-12 14:30 usm-configurator-erp（七云）
- 提交：009496d（同上，与 modun 保持同步）
- 备份：/www/docker/usm/backups/usm-01/usm-configurator-erp-20260912T052932Z
- 构建：重试 1 次（首次失败于工作区 index.html 被删，git 还原后成功）
- 验收：健康检查 ok / 新资源 hash index-DCyWP0ld.js（含 `y-merged` 指纹）/ ERP 产物含 `glassClip` / 无迁移 / 线上 https://usm.seven-cloud.cn 200（本机实测 200；服务器本机 curl 域名 DNS 瞬时失败同 9-07，非发布问题）
- 遗留：无

### 2026-09-15 11:35 modun
- 提交：dc727b8（销售倍率默认 1.5→1.0、折扣倍率下限放开至 0.50、迁移 0018 放宽 quotes/preferences CHECK + 偏好默认 10000；并回流服务器热修 a45b9ae 面板镜像修复、BOM 规格表文档）
- 备份：/www/docker/usm-modun/backups/modun/modun-20260915T033124Z
- 构建：一次成功（约 4 分钟）
- 验收：健康检查 ok / 新资源 hash index-C3g7hm1s.js（含 "0.50 至 9.99" 指纹）/ ERP 产物含 "低于 1.00 表示对客户折扣"（index-B6uGJuYb.js）/ 迁移 0018 已应用（列默认 10000、CHECK>=5000 双表确认）/ 线上 https://modun.usmxx.xyz 200
- 遗留：服务器本地提交 a45b9ae 无法推送（https 只读凭据），已 format-patch 回流 main（dc727b8），服务器分支 save-a45b9ae-backup 保留保险；.bak-20260909 文件仍未删

### 2026-09-15 11:38 usm-configurator-erp（七云）
- 提交：dc727b8（同上，与 modun 保持同步）
- 备份：/www/docker/usm/backups/usm-01/usm-configurator-erp-20260915T033334Z
- 构建：一次成功（缓存热，约 1.5 分钟）
- 验收：健康检查 ok / 新资源 hash index-Ci52D0GU.js（含 "0.50 至 9.99" 指纹）/ ERP 产物 index-B6uGJuYb.js 与 modun 一致 / 迁移 0018 已应用 / 线上 https://usm.seven-cloud.cn 200
- 遗留：env 的 PUBLIC_DOMAIN 仍为旧 IP 85.137.246.59（不影响本次发布，建议后续修正）；MCP Bash 无 HOME，git 全局配置需 `export HOME=/root`（已在调用规则记录）
