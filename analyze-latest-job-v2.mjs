import fs from 'fs';
import path from 'path';

const jobDir = 'C:\\Unreal5_projects\\RoomTest2\\Saved\\DwebImports';

const jobs = fs.readdirSync(jobDir).filter(f => f.startsWith('job_')).sort();
const latestJob = jobs[jobs.length - 1];
console.log('=== Latest job:', latestJob, '===\n');

function readJson(p) {
  let buf = fs.readFileSync(p);
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    buf = buf.slice(3);
  }
  let text = buf.toString('utf8');
  while (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  return JSON.parse(text);
}

const exportPath = path.join(jobDir, latestJob, 'scene_export.json');
const planPath = path.join(jobDir, latestJob, 'scene_asset_plan.json');

const exportData = readJson(exportPath);
const planData = readJson(planPath);

console.log('=== Export Payload Info ===');
console.log('dwebProjectRootPath:', exportData.dwebProjectRootPath);
console.log('projectRootPath:', exportData.projectRootPath);
console.log('modelBindingCount:', exportData.modelBindingCount);
console.log('resolvedSlotCount:', exportData.resolvedSlotCount);
console.log('manualModelBindingCount:', exportData.manualModelBindingCount);
console.log('');

console.log('=== modelBindings (', exportData.modelBindings?.length || 0, ') ===');
const modelBindings = exportData.modelBindings || [];
for (let i = 0; i < modelBindings.length; i++) {
  const b = modelBindings[i];
  console.log(`\n[${i}] objectId: ${b.objectId}`);
  console.log(`    objectName: ${b.objectName}`);
  console.log(`    sourceNodeId: ${b.sourceNodeId}`);
  console.log(`    modelUrl: ${b.modelUrl}`);
  console.log(`    modelAssetUrl: ${b.modelAssetUrl}`);
  console.log(`    modelAssetPath: ${b.modelAssetPath}`);
  console.log(`    modelSourcePath: ${b.modelSourcePath}`);
  console.log(`    modelFormat: ${b.modelFormat}`);
}

console.log('\n\n=== resolvedLayoutSlots (', exportData.resolvedLayoutSlots?.length || 0, ') ===');
const slots = exportData.resolvedLayoutSlots || [];
for (let i = 0; i < slots.length; i++) {
  const s = slots[i];
  console.log(`\n[${i}] sourceObjectId: ${s.sourceObjectId}`);
  console.log(`    slotId: ${s.slotId}`);
  console.log(`    displayName: ${s.displayName}`);
}

// Check matching
console.log('\n\n=== ID Matching Analysis ===');
const bindingIds = new Set(modelBindings.map(b => String(b.objectId).trim()));
const slotIds = slots.map(s => String(s.sourceObjectId).trim());
const slotIdSet = new Set(slotIds);

console.log('Binding IDs:', [...bindingIds]);
console.log('Slot IDs:', slotIds);

const unmatchedBindings = [...bindingIds].filter(id => !slotIdSet.has(id));
const unmatchedSlots = slotIds.filter(id => !bindingIds.has(id));

console.log('\nBindings not in slots:', unmatchedBindings);
console.log('Slots not in bindings:', unmatchedSlots);

// Check for duplicate source paths
console.log('\n\n=== Source Path Analysis ===');
const sourcePaths = new Map();
for (const b of modelBindings) {
  const paths = [b.modelSourcePath, b.modelAssetPath, b.modelAssetUrl, b.modelUrl].filter(p => p && String(p).trim());
  for (const p of paths) {
    const key = String(p).trim();
    if (!sourcePaths.has(key)) {
      sourcePaths.set(key, []);
    }
    sourcePaths.get(key).push(b.objectId);
  }
}
for (const [p, ids] of sourcePaths) {
  console.log(`\nPath: ${p}`);
  console.log(`  Used by: ${ids.join(', ')} (count: ${ids.length})`);
}
