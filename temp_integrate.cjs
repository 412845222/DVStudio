const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/views/AIWorkflow/AIWorkflowPage.vue');
let content = fs.readFileSync(filePath, 'utf8');

// Step 1: Add @open-template-center event and dialogs after BlueprintProjectToolbar
// Look for the exact pattern after @open-gemini-task-panel
const geminiLine = '@open-gemini-task-panel="() => {}"';
const geminiWithEvent = '@open-gemini-task-panel="() => {}"\n\t\t\t\t@open-template-center="onOpenTemplateCenter"';

if (content.includes(geminiLine)) {
	content = content.replace(geminiLine, geminiWithEvent);
	console.log('Added @open-template-center event listener');
} else {
	console.log('Could not find gemini line');
}

// Now add the dialog components after the BlueprintProjectToolbar closing tag
// Find: \t\t\t\t/>\n\n\t\t\t\t<div v-if="performancePriorityMode"
const toolbarClose = '\t\t\t\t/>\n\n\t\t\t\t<div v-if="performancePriorityMode"';
const toolbarCloseWithDialogs = '\t\t\t\t/>\n\n\t\t\t\t<TemplateCenterDialog\n\t\t\t\t\tv-model:open="templateCenterOpen"\n\t\t\t\t\t@apply-template="onTemplateSelectForApply"\n\t\t\t\t/>\n\n\t\t\t\t<TemplateApplyDialog\n\t\t\t\t\tv-model:open="templateApplyDialogOpen"\n\t\t\t\t\t:template="selectedTemplateForApply"\n\t\t\t\t\t@confirm="onConfirmApplyTemplate"\n\t\t\t\t/>\n\n\t\t\t\t<div v-if="performancePriorityMode"';

if (content.includes(toolbarClose)) {
	content = content.replace(toolbarClose, toolbarCloseWithDialogs);
	console.log('Added TemplateCenterDialog and TemplateApplyDialog components');
} else {
	console.log('Could not find toolbar close pattern, trying alternative...');
	// Try finding it after adding the event
	const altClose = '\t\t\t\t/>\n\n\t\t\t\t<div v-if="performancePriorityMode"';
	if (content.includes(altClose)) {
		content = content.replace(altClose, toolbarCloseWithDialogs);
		console.log('Added dialogs via alternative pattern');
	}
}

// Step 2: Add state variables near projectToolbarRef
const refMarker = 'const projectToolbarRef = ref<InstanceType<typeof BlueprintProjectToolbar> | null>(null)';
const refWithState = `const projectToolbarRef = ref<InstanceType<typeof BlueprintProjectToolbar> | null>(null)
const templateCenterOpen = ref(false)
const templateApplyDialogOpen = ref(false)
const selectedTemplateForApply = ref<TemplateItem | null>(null)`;

if (content.includes(refMarker)) {
	content = content.replace(refMarker, refWithState);
	console.log('Added template center state refs');
} else {
	console.log('Could not find projectToolbarRef');
}

// Step 3: Add handler functions. Let's find a good place - after onRequestExportProjectPackage maybe
// Let's add them near other toolbar handlers. Find "function onRequestExportProjectPackage" or similar
// Actually let's just add them before the closing </script> or at a reasonable spot
// Let's find "function onOpenArkTaskPanel" and add after it
const handlerMarker = 'function onOpenGeminiTaskPanel() {';
// Actually let's look for onOpenArkTaskPanel
const arkHandler = 'function onOpenArkTaskPanel()';
let handlerCode = `
function onOpenTemplateCenter() {
	templateCenterOpen.value = true
}

function onTemplateSelectForApply(template: TemplateItem) {
	selectedTemplateForApply.value = template
	templateCenterOpen.value = false
	templateApplyDialogOpen.value = true
}

async function onConfirmApplyTemplate(options: TemplateApplyOptions) {
	templateApplyDialogOpen.value = false
	selectedTemplateForApply.value = null
	console.log('Apply template:', options)
}
`;

// Find a good insertion point - after onOpenArkTaskPanel function
const arkFuncEnd = 'onOpenArkTaskPanel';
if (content.includes(arkFuncEnd)) {
	// Find the line with onOpenArkTaskPanel and add after its closing
	// Let's search for the pattern: open-gemini-task-panel placeholder
	const emptyGemini = '@open-gemini-task-panel="() => {}"';
	if (content.includes('onOpenGeminiTaskPanel')) {
		// Add after that function
		const geminiFuncSearch = 'function onOpenGeminiTaskPanel()';
		const idx = content.indexOf(geminiFuncSearch);
		if (idx >= 0) {
			// Find the next closing brace at the right indentation
			// For simplicity, let's just add before the last closing brace area
			// Or add near the onOpenArkTaskPanel function
		}
	}
	
	// Simpler approach: add after all the onOpenX functions
	// Let's just insert before a known marker like the first "const " after those functions
	// Actually let's just add the functions right after the state refs we just added
	const stateEnd = 'const selectedTemplateForApply = ref<TemplateItem | null>(null)';
	if (content.includes(stateEnd)) {
		content = content.replace(stateEnd, stateEnd + '\n' + handlerCode);
		console.log('Added handler functions after state refs');
	}
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Integration complete!');
