# USM 本地模块搭建

这是一个可在 Windows 本地运行的 3D 模块搭建第一版，当前已经支持离线使用。

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
