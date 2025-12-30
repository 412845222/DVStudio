# Samples / Fixtures

这个目录用于放“最小可复现”的人工验收样例（fixtures）。

- `editorSnapshot.sample.v1.json`：一个最小 EditorSnapshot 样例，包含一层 + 4 个基础节点类型（rect/text/image/line），用于后续导入/导出 round-trip 自检与回归对照。
- `projectPackage.sample.v1.json`：一个最小 ProjectPackageV1 样例（含 project+manifest+assets），可直接用编辑器底部工具栏的“导入”按钮载入。

说明：当前工程已经提供最小“导入 ProjectPackage JSON 文件”能力（工具栏“导入”）。导出暂以 `dvs:editor/saved` 的 payload 为准（包含 `projectPackageJson`）。
