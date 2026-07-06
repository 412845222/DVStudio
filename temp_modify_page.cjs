const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/views/AIWorkflow/AIWorkflowPage.vue');
let content = fs.readFileSync(filePath, 'utf8');

// Step 1: Add @open-template-center event and dialog components after BlueprintProjectToolbar
const toolbarEnd = '@open-gemini-task-panel="() => {}"\n\t\t\t\t/>';
const toolbarEndWithAdditions = '@open-gemini-task-panel="() => {}"\n\t\t\t\t@open-template-center="onOpenTemplateCenter"\n\t\t\t\t/>\n\n\t\t\t\t<TemplateCenterDialog\n\t\t\t\t\tv-model:open="templateCenterOpen"\n\t\t\t\t\t@apply-template="onTemplateSelectForApply"\n\t\t\t\t/>\n\n\t\t\t\t<TemplateApplyDialog\n\t\t\t\t\tv-model:open="templateApplyDialogOpen"\n\t\t\t\t\t:template="selectedTemplateForApply"\n\t\t\t\t\t@confirm="onConfirmApplyTemplate"\n\t\t\t\t/>';

if (content.includes(toolbarEnd)) {
	content = content.replace(toolbarEnd, toolbarEndWithAdditions);
	console.log('Step 1: Added template center dialog components');
} else {
	console.log('Step 1 FAILED: Could not find toolbar end');
	// Try alternative
	const altSearch = '@open-gemini-task-panel="() => {}"';
	const altReplace = '@open-gemini-task-panel="() => {}"\n\t\t\t\t@open-template-center="onOpenTemplateCenter"';
	if (content.includes(altSearch)) {
		content = content.replace(altSearch, altReplace);
		console.log('Step 1 alternative: Added event listener only');
	}
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('File written');
