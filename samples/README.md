# Samples / Fixtures

这个目录用于放“最小可复现”的人工验收样例（fixtures）。

- `editorSnapshot.sample.v1.json`：一个最小 EditorSnapshot 样例，包含一层 + 4 个基础节点类型（rect/text/image/line），用于后续导入/导出 round-trip 自检与回归对照。

说明：目前工程尚未提供“从文件导入样例到编辑器”的 UI/命令；该样例先作为协议/数据形状的对照物存在。
