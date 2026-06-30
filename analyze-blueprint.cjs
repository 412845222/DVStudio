const fs = require('fs');
const path = require('path');
const blueprintPath = 'G:\\DVSTestProject\\展示示例\\Blueprints\\main.blueprint.json';
const content = fs.readFileSync(blueprintPath, 'utf8');
const blueprint = JSON.parse(content);
const nodesById = blueprint.nodesById || {};
const edgesById = blueprint.edgesById || {};

const sceneLayoutNodeId = 'wf-node-mqx7lh2w-piiwqp';

// Get all edges to scene layout
const edgesToSL = Object.values(edgesById).filter(e => e.toNodeId === sceneLayoutNodeId);
const connectedModelNodeIds = new Set();
edgesToSL.forEach(e => {
    const fromNode = nodesById[e.fromNodeId];
    if (fromNode?.type === 'model3d' || fromNode?.type === 'meshy') {
        connectedModelNodeIds.add(e.fromNodeId);
    }
});

console.log('=== Model3d nodes WITH modelUrl AND connected to scene layout ===\n');
const model3dNodes = Object.values(nodesById).filter(n => n.type === 'model3d');
let validCount = 0;
let binCount = 0;
let differentProjectCount = 0;
let notConnectedCount = 0;

for (const n of model3dNodes) {
    const s = n.model3dSettings || {};
    const url = s.modelUrl || '';
    if (!url) continue;
    
    const isConnected = connectedModelNodeIds.has(n.id);
    const isBinFormat = url.includes('.dvcache/bin/') || url.endsWith('.bin');
    const projectIdMatch = url.match(/projectId=(\d+)/);
    const projectId = projectIdMatch ? projectIdMatch[1] : 'unknown';
    const isCurrentProject = projectId === '1';
    
    console.log(`${n.id} (${n.title})`);
    console.log(`  Connected to SL: ${isConnected ? 'YES' : 'NO'}`);
    console.log(`  URL: ${url.substring(0, 120)}`);
    console.log(`  projectId: ${projectId} ${isCurrentProject ? '(current)' : '(DIFFERENT PROJECT!)'}`);
    console.log(`  Format: ${isBinFormat ? '.bin (NOT GLB!)' : 'glb/gltf'}`);
    console.log(`  modelAssetPath: ${s.modelAssetPath || '(empty)'}`);
    console.log(`  modelSourcePath: ${s.modelSourcePath || '(empty)'}`);
    console.log();
    
    if (!isConnected) notConnectedCount++;
    else if (isBinFormat) binCount++;
    else if (!isCurrentProject) differentProjectCount++;
    else validCount++;
}

console.log(`\n=== Summary ===`);
console.log(`Valid models (connected + glb + current project): ${validCount}`);
console.log(`Connected but using .bin format: ${binCount}`);
console.log(`Connected but from different project: ${differentProjectCount}`);
console.log(`Has URL but not connected to scene layout: ${notConnectedCount}`);

// Check Unreal DVStudio contents recursively
console.log('\n=== Unreal project DVStudio contents ===');
const dvStudioDir = 'C:\\Unreal5_projects\\RoomTest2\\Content\\DVStudio';
try {
    const listFiles = (dir, prefix = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                console.log(`${prefix}[DIR] ${entry.name}`);
                listFiles(fullPath, prefix + '  ');
            } else {
                console.log(`${prefix}${entry.name} (${fs.statSync(fullPath).size} bytes)`);
            }
        }
    };
    listFiles(dvStudioDir);
} catch (e) {
    console.log(`Error: ${e.message}`);
}

// Check if .bin files are actually glb
console.log('\n=== Checking if .bin files are actually GLB ===');
const binFiles = [
    'G:\\DVSTestProject\\展示示例\\.dvcache\\bin\\meshy_019f1120-ebbc-789e-9977-58dfdbfa7084.bin',
    'G:\\DVSTestProject\\展示示例\\.dvcache\\bin\\meshy_019f1174-f02d-7f58-8927-ff6a9f955da4.bin'
];
binFiles.forEach(f => {
    try {
        const buf = fs.readFileSync(f);
        const header = buf.slice(0, 4).toString('ascii');
        const isGlb = header === 'glTF';
        console.log(`${path.basename(f)}: header="${header}", isGLB=${isGlb}, size=${buf.length} bytes`);
    } catch (e) {
        console.log(`${path.basename(f)}: ERROR - ${e.message}`);
    }
});

// Check what GLB files exist in Content/Media
console.log('\n=== GLB files in Content/Media ===');
const mediaDir = 'G:\\DVSTestProject\\展示示例\\Content\\Media';
const mediaFiles = fs.readdirSync(mediaDir);
const glbFiles = mediaFiles.filter(f => f.toLowerCase().endsWith('.glb') || f.toLowerCase().endsWith('.gltf'));
glbFiles.forEach(f => {
    const fullPath = path.join(mediaDir, f);
    const stat = fs.statSync(fullPath);
    console.log(`  ${f} (${stat.size} bytes)`);
});
