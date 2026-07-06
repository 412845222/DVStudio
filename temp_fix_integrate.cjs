const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/views/AIWorkflow/AIWorkflowPage.vue');
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: Fix indentation of @open-template-center
// Currently it's incorrectly indented
const badIndent = '\t\t\t\t@open-gemini-task-panel="() => {}"\n\t\t\t@open-template-center="onOpenTemplateCenter"\n\t\t\t/>';
const goodIndent = '\t\t\t\t@open-gemini-task-panel="() => {}"\n\t\t\t\t@open-template-center="onOpenTemplateCenter"\n\t\t\t\t/>';

if (content.includes(badIndent)) {
	content = content.replace(badIndent, goodIndent);
	console.log('Fixed indentation of @open-template-center');
} else {
	console.log('Bad indent pattern not found, checking current state...');
	// Try to find whatever is there
	const lines = content.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes('@open-template-center')) {
			console.log('Line', i+1, ':', JSON.stringify(lines[i]));
			// Fix this line's indentation to 5 tabs
			lines[i] = '\t\t\t\t@open-template-center="onOpenTemplateCenter"';
			// Check next line for />
			if (i+1 < lines.length && lines[i+1].includes('/>')) {
				lines[i+1] = '\t\t\t\t/>';
				console.log('Fixed line', i+2, 'closing tag too');
			}
			break;
		}
	}
	content = lines.join('\n');
}

// Fix 2: Add dialog components after the BlueprintProjectToolbar closing tag
const afterToolbar = '\t\t\t\t/>\n\n\t\t\t\t<div v-if="performancePriorityMode"';
const dialogComponents = '\t\t\t\t/>\n\n\t\t\t\t<TemplateCenterDialog\n\t\t\t\t\tv-model:open="templateCenterOpen"\n\t\t\t\t\t@apply-template="onTemplateSelectForApply"\n\t\t\t\t/>\n\n\t\t\t\t<TemplateApplyDialog\n\t\t\t\t\tv-model:open="templateApplyDialogOpen"\n\t\t\t\t\t:template="selectedTemplateForApply"\n\t\t\t\t\t@confirm="onConfirmApplyTemplate"\n\t\t\t\t/>\n\n\t\t\t\t<div v-if="performancePriorityMode"';

if (content.includes(afterToolbar)) {
	content = content.replace(afterToolbar, dialogComponents);
	console.log('Added dialog components');
} else {
	console.log('Could not find afterToolbar pattern');
	// Try with more flexible matching
	const justClose = '\t\t\t\t/>\n\n';
	const parts = content.split(justClose);
	if (parts.length > 1) {
		// Find the part that comes after BlueprintProjectToolbar (near performancePriorityMode)
		for (let i = 0; i < parts.length; i++) {
			if (parts[i].includes('<div v-if="performancePriorityMode"')) {
				parts[i] = dialogComponents.replace(afterToolbar, '') + parts[i];
				content = parts.join(justClose);
				console.log('Added dialogs via split method');
				break;
			}
		}
	}
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixes applied');
