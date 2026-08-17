# USM 本地模块搭建

这是一个可在 Windows 本地运行的 3D 模块搭建第一版，当前已经支持离线使用。

## 更新日志

### 2026-08-17 - ERP 价格库存导入与平台账号安全

- 新增价格表 XLSX/CSV 导入预览与提交流程：识别未知、重复和非法价格行，预览 token 可防止过期提交，并保留导入审计。
- 库存导入支持正式 SKU 及 `materialKey + specKey + color + finish` 唯一回填；无法唯一匹配时明确告警，不猜测物料。
- 报价匹配完善四排孔、洞洞板、规格化玻璃、名义尺寸与工厂尺寸映射，以及膨胀套件折算规则。
- 平台 `admin` 作为隐藏的运维/所有者账号：拥有跨企业工作区的监察与授权能力，企业侧不展示其账号、操作人 ID 或关联身份。
- 新建和重置账号的临时密码统一为 6-12 位；首次登录必须改密；上级管理员可重置下级密码，不能重置自己或同级管理员。
- 新增 `must_change_password` 数据库迁移和平台账号修复脚本。历史环境升级后，若引导账号曾被转为普通账号，先备份数据库，再执行：

```bash
sh deploy/repair-platform-admin.sh <platform-admin-email>
```

随后使用该账号登录并完成强制改密，再执行：

```bash
sh deploy/disable-bootstrap-admin.sh
```

详细上线步骤见 [ERP 部署说明](docs/ERP_DEPLOYMENT.md) 与 [价格库存导入说明](docs/PRICE_INVENTORY_IMPORT_ROLLOUT.md)。

## 已支持

- 3D 预览、旋转、缩放
- 深度、列宽、层高选择
- 增减列数和层数
- 开放格、背板格、下翻门、三抽屉、玻璃门、托盘格
- 板件颜色、钢管表面、脚垫/滚轮
- 配置本地自动保存
- 导入/导出 JSON
- 导出 PNG 预览图
- 导出 BOM CSV
- 本地估算价与基础 BOM
- 离线文件版
- 离线静态版

## Windows 启动

浏览器开发版：

- 双击 `start-windows.bat`

离线桌面版：

- 双击 `start-offline.bat`

## 离线说明

离线第一版现在的用法：

1. 执行一次 `npm run build`
2. 双击 `start-offline.bat`
3. 或者直接打开 `dist/index.html`

这种方式不需要本地服务器，也不依赖线上接口。

## 常用命令

```bash
npm install
npm run dev
npm run build
```

## 说明

这是本地功能同款的配置器原型，没有使用线上配置器的专有资源或接口。

BOM 和价格目前仍是本地估算逻辑，下一步可以继续接入：

- 真实零件表
- 真实颜色库
- 报价规则
- Windows 打包成 exe
