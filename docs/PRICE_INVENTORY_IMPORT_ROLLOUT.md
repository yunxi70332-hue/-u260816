# 价格与库存导入落地方案

## 1. 两份源表的结论

- `8colors_散装SKU分类_2026-08-15(1).xlsx` 是 SKU/物料主数据：SKU 编码、名称、规格、颜色、单位和产品体系。
- `零件单配_unitPric_x1.28.xlsx` 是工厂报价源：报价行、报价规格、单位、单价、计价规则和备注。
- 价格表中 `unitPrice` 视为最终导入单价，不再按文件名追加 `1.28` 倍率。文件名中的倍率只作为历史来源备注。
- 价格身份不含颜色：`materialKey + specKey`。
- 库存身份包含颜色和表面处理：`materialKey + specKey + color + finish`，对应一个正式 `materialCode`。

## 2. 客户价格模板

系统从目标草稿价格表生成 `usm-price-import-template.xlsx`，包含：

- `PriceItems`：客户填写的主表；必填 `materialKey`、`specKey`、`unitPrice`。
- `Metadata`：模板版本、增量模式、身份和倍率规则。
- `Instructions`：字段说明、别名和校验规则。
- `Reference`：当前价格表的既有物料/规格清单，供客户复制填写。

客户也可以上传报价源字段：`canonicalName`、`spec`、`unitPrice`、`pricingRule`。系统会转换成同一套身份，不读取颜色作为价格键。

## 3. 导入流程

1. 选择草稿价格表并上传 XLSX/CSV。
2. 浏览器解析，服务端再次预览。
3. 预览按行标记 `updated`、`skipped`、`conflict`、`error`。
4. 未知 `materialKey/specKey`、重复身份、负数/非法价格必须修正，不能自动新建物料。
5. 提交携带预览 token；价格表版本变化后 token 失效，需要重新预览。
6. 提交只更新已有价格项，记录 `price_list.import_committed` 审计日志。

公式价行可以不填数值 `unitPrice`，只提供 `pricingRule`；固定价行必须提供非负数值。

## 4. 配置器和库存联动

- 配置器 BOM 的颜色只用于库存变体和显示，不参与价格匹配。
- 价格匹配先按 `materialKey + specKey`，再兼容配置器名义尺寸到工厂实际尺寸的映射（例如板件名义尺寸减 15、钢管长度减 18）。
- 入库优先识别完整 `materialCode`；没有完整编码时，按 `materialKey + specKey + color + finish` 唯一回填。
- 0 个候选或多个候选时不猜 SKU，保留空编码并给出告警，要求工厂补全正式 SKU。
- `/api/materials/resolve` 返回真实正式 SKU；`/api/inventory/check` 按颜色和表面处理分开核算库存。

## 5. 上线顺序

1. 先用当前 active 价格表下载模板，确认 `Reference` 中的身份与工厂报价规格一致。
2. 在草稿价格表导入工厂填写文件，逐行处理预览错误。
3. 发布价格表前抽查板件、钢管、门板、玻璃和公式价各一行。
4. 用库存模板导入物料主数据，确保每个颜色/表面处理变体有正式 `materialCode`。
5. 先导入期初库存，再用配置器生成 BOM，验证价格不因颜色变化、库存会按颜色变化。
6. 生产环境开启审计查询，保留原始文件、预览 token 对应的导入批次和修正记录。

## 6. 验收标准

- 相同规格不同颜色的价格一致。
- 相同规格不同颜色的库存余额独立。
- 未知 SKU 不会创建价格项或库存物料。
- 公式价无数值时可正常保存规则。
- 工厂入库使用完整 SKU 时能解析到正确物料；缺失或歧义时明确告警。
- 价格导入、库存导入、配置器解析和前端构建测试全部通过。
