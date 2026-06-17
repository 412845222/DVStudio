# Light Agent Skill

这个文件夹是场景灯光理解技能的脱模型版本。

用途：
- 把参考图、布局 JSON、运行约束整理成静态资产包。
- 后续只需要把这个文件夹给我，我就可以不依赖火山模型，直接按约束产出 result.json。
- 适合人工校灯、批量微调、对比不同灯光方案。

使用方式：
1. 阅读 system_prompt.md，确认当前灯光分析原则。
2. 阅读 runtime_constraints.json，确认前端 Three.js 预览器的真实参数约束。
3. 参考 result.schema.json，确保输出字段完整。
4. 以 result.template.json 为骨架，直接填写 result.json。
5. 如果有新的场景，只替换布局 JSON 与参考图分析，不需要改约束文件。

关键原则：
- 位置、宽高、distance 一律使用 layout 世界单位，不是厘米、毫米。
- self-emissive-only 只代表“自身发亮”，不承担照亮环境任务。
- rect-area 在前端预览中会被额外增强，原始 intensity 必须保持克制。
- 局部壁灯、柜灯、层板灯、展示灯优先让受光面清晰可见，而不是只看见一个亮贴片。

建议工作流：
1. 先判断每个发亮对象是 emissive surface 还是 real fixture。
2. 再判断应该用 spot、rect-area、directional 还是 point。
3. 先写主光和局部关键灯，再补环境光。
4. 最后检查：是否存在过大的 width/height、过大的 distance、过高的 rect-area intensity。

交付约束：
- 最终交付文件名固定为 result.json。
- result.json 必须满足 result.schema.json。
- 若某个对象只是显示器、屏幕、发光贴图，但没有照亮周边，请使用 emitMode=self-emissive-only。