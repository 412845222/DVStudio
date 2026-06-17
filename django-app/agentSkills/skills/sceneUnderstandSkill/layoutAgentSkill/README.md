# Layout Agent Skill

这个文件夹是 sceneUnderstand 场景理解技能的脱模型版本，也是面向通用多模态/远程云服务的提示词文件包。

用途：
- 把当前 Django 后端里 sceneUnderstand 的远程请求规则、结构化输出约束、关键空间语义约束整理成静态资产包。
- 后续只需要把这个文件夹和参考图一起交给任意支持图像理解的多模态模型，就可以不依赖当前后端代码，直接产出 result.json。
- 适合人工校审、不同模型横向对比、提示词微调、离线复现和迁移到其他云服务。

使用方式：
1. 阅读 system_prompt.md，确认场景理解的角色定义和核心规则。
2. 阅读 runtime_constraints.json，确认输入字段、坐标语义、结构判定规则、父子关系规则、多视角规则和截图约束。
3. 参考 result.schema.json，确保输出字段和类型完整。
4. 以 result.template.json 为骨架，填写最终 result.json。
5. 如果切换到新的场景，只需要替换参考图和用户补充文本，不需要改 schema 与运行约束。

输入约束：
- 输入是一组属于同一室内空间的参考图，可为单张或多张。
- 可以额外提供用户文本提示，用于补充风格、关注重点、结构约束或截图偏好。
- 所有参考图必须被视为同一空间的多视角证据，而不是多个独立场景。

输出目标：
- 最终交付文件名固定为 result.json。
- result.json 必须满足 result.schema.json。
- 结果核心不是自然语言描述，而是 roomShell、camera、keyElements、objects 组成的结构化场景理解结果。

关键原则：
- 先统一房间壳体，再补充 objects，不允许先按单张图局部拼凑。
- floor、wall、ceiling、window、door、opening 等硬装结构优先作为关键元素输出。
- position.y 表示物体底面高度，不是中心点高度。
- sourceImageIndex 必须唯一，imageRect 必须是该主图上的紧致截图框，不能默认整图。
- attached-to-wall、attached-to-ceiling、on-top、embedded-inside 这些关系必须明确，不允许把大量物体都放成 free。

建议工作流：
1. 先识别 roomShell、主地面、主要墙面和开口方向。
2. 再识别大型家具、固定安装、挂墙物和支撑关系。
3. 最后补小物件、成组关系、sameTypeGroup、imageRect 和 observedImageIndices。
4. 输出前检查：是否遗漏补图中新增对象，是否有错误悬空，是否存在整图级 imageRect。

交付约束：
- result.json 中每个非壳体对象都应有唯一 sourceImageIndex。
- result.json 中每个非壳体对象都应有可裁切的 imageRect。
- 如果场景存在多视角补图，objects 不能只覆盖第一张图可见内容。
- 如果对象属于固定构件，必须尽量标记 isKeyElement、keyElementType、fixedInRoom、mountType。