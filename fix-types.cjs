const fs = require('fs');
const path = require('path');

const files = [
  'src/ui/VideoScene/parts/nodeDetail/forms/NodeFiltersForm.vue',
  'src/ui/VideoScene/parts/nodeDetail/forms/CommonTransformForm.vue',
  'src/ui/VideoScene/parts/nodeDetail/forms/LineNodeForm.vue',
  'src/ui/VideoScene/parts/nodeDetail/forms/RectNodeForm.vue',
  'src/ui/VideoScene/parts/nodeDetail/forms/TextNodeForm.vue',
  'src/ui/VideoScene/parts/nodeControlPoints/ResizeControlPoints.vue',
  'src/ui/VideoScene/parts/nodeControlPoints/LineControlPoints.vue',
  'src/ui/WorkFlow/WorlFlowNodes/WorkflowImageNode.vue',
  'src/ui/WorkFlow/WorlFlowNodes/WorkflowComfyUINode.vue',
  'src/ui/WorkFlow/WorlFlowNodes/WorkflowTextMergeNode.vue',
  'src/ui/VideoScene/panels/AiSubtitleUnderstandingPanel.vue',
  'src/ui/AIChat/AIChatDialog.vue',
  'src/views/AIWorkflow/AIWorkflowPage.vue',
];

function fixTemplateParams(content, filePath) {
  let result = content;
  let count = 0;

  // 处理带修饰符的事件：@event.mod1.mod2="(e) =>"
  // 给 e 参数加 Event 类型
  const eventPattern = /(@[\w-]+(?:\.[\w-]+)*\s*=\s*")\(e\)(\s*=>)/g;
  const m1 = result.match(eventPattern);
  if (m1) {
    count += m1.length;
    result = result.replace(eventPattern, '$1(e: Event)$2');
  }

  const eventPattern2 = /(@[\w-]+(?:\.[\w-]+)*\s*=\s*")\(e,/g;
  const m2 = result.match(eventPattern2);
  if (m2) {
    count += m2.length;
    result = result.replace(eventPattern2, '$1(e: Event,');
  }

  // 单引号版本
  const eventPattern3 = /(@[\w-]+(?:\.[\w-]+)*\s*=\s*')\(e\)(\s*=>)/g;
  const m3 = result.match(eventPattern3);
  if (m3) {
    count += m3.length;
    result = result.replace(eventPattern3, '$1(e: Event)$2');
  }

  const eventPattern4 = /(@[\w-]+(?:\.[\w-]+)*\s*=\s*')\(e,/g;
  const m4 = result.match(eventPattern4);
  if (m4) {
    count += m4.length;
    result = result.replace(eventPattern4, '$1(e: Event,');
  }

  return { content: result, count };
}

let totalFixed = 0;
for (const file of files) {
  const fullPath = path.join(process.cwd(), file);
  if (!fs.existsSync(fullPath)) {
    console.log('Skip (not found):', file);
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const { content: fixed, count } = fixTemplateParams(content, file);
  if (count > 0) {
    fs.writeFileSync(fullPath, fixed, 'utf-8');
    console.log('Fixed', count, 'in', file);
    totalFixed += count;
  } else {
    console.log('No changes in', file);
  }
}
console.log('Total fixed:', totalFixed);
