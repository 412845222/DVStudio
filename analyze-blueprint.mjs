const fs = require('fs');
const path = require('path');

const blueprintPath = 'G:\\DVSTestProject\\展示示例\\Blueprints\\main.blueprint.json';
const assetsPath = 'G:\\DVSTestProject\\展示示例\\Content\\Media\\.dweb-assets.json';

const data = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
const assets = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));

console.log('=== 蓝图顶层键 ===');
console.log(Object.keys(data));

const nodes = data.nodes || data.nodesById || {};
const edges = data.edges || [];

console.log('\n=== 节点数量 ===', Array.isArray(nodes) ? nodes.length : Object.keys(nodes).length);
console.log('=== 边数量 ===', Array.isArray(edges) ? edges.length : 'not array');

const nodesById = {};
if (Array.isArray(nodes)) {
    for (const n of nodes) {
        if (n && n.id) nodesById[n.id] = n;
    }
} else {
    Object.assign(nodesById, nodes);
}

console.log('\n=== 所有节点类型统计 ===');
const typeCount = {};
for (const [id, node] of Object.entries(nodesById)) {
    const t = node.type || 'unknown';
    typeCount[t] = (typeCount[t] || 0) + 1;
}
console.log(typeCount);

console.log('\n=== 查找unreal节点和scene-layout节点 ===');
let unrealNode = null;
let sceneLayoutNode = null;
for (const [id, node] of Object.entries(nodesById)) {
    if (node.type === 'unreal-export' || node.type === 'unreal') {
        unrealNode = { id, ...node };
        console.log('Unreal节点:', id, node.title || node.alias);
    }
    if (node.type === 'scene-layout') {
        sceneLayoutNode = { id, ...node };
        console.log('场景布局节点:', id, node.title || node.alias);
    }
}

if (sceneLayoutNode) {
    console.log('\n=== 场景布局节点的所有入边 ===');
    const incomingToScene = edges.filter(e => e.toNodeId === sceneLayoutNode.id || e.to === sceneLayoutNode.id);
    console.log(`入边数量: ${incomingToScene.length}`);
    
    for (const edge of incomingToScene) {
        const fromId = edge.fromNodeId || edge.from || edge.source;
        const toId = edge.toNodeId || edge.to || edge.target;
        const fromAnchor = edge.fromAnchorId || edge.fromAnchor || edge.sourceAnchor;
        const toAnchor = edge.toAnchorId || edge.toAnchor || edge.targetAnchor;
        const fromNode = nodesById[fromId];
        console.log(`\n边: from=${fromId} (${fromNode?.type || '?'}) -> to=${toId}`);
        console.log(`  fromAnchor: ${fromAnchor}`);
        console.log(`  toAnchor: ${toAnchor}`);
        if (fromNode) {
            console.log(`  fromNode类型: ${fromNode.type}`);
            console.log(`  fromNode标题: ${fromNode.title || fromNode.alias || 'unnamed'}`);
        }
    }

    console.log('\n=== 场景布局节点的sceneLayoutSettings ===');
    const sls = sceneLayoutNode.sceneLayoutSettings || {};
    console.log('layoutItems数量:', Array.isArray(sls.layoutItems) ? sls.layoutItems.length : 0);
    console.log('manualModelBindings数量:', Array.isArray(sls.manualModelBindings) ? sls.manualModelBindings.length : 0);
    
    if (Array.isArray(sls.layoutItems)) {
        console.log('\n--- 所有layoutItems ---');
        for (const item of sls.layoutItems) {
            console.log(`  id=${item.id}, name=${item.name || 'unnamed'}`);
        }
    }
    
    if (Array.isArray(sls.manualModelBindings)) {
        console.log('\n--- manualModelBindings ---');
        for (const mb of sls.manualModelBindings) {
            console.log(`  objectId=${mb.objectId}, modelUrl=${mb.modelUrl?.substring(0, 80)}, modelAssetPath=${mb.modelAssetPath?.substring(0, 80)}, modelSourcePath=${mb.modelSourcePath?.substring(0, 80)}`);
        }
    }
}

console.log('\n=== 所有model3d/meshy节点及其路径信息 ===');
for (const [id, node] of Object.entries(nodesById)) {
    if (node.type !== 'model3d' && node.type !== 'meshy') continue;
    const title = node.title || node.alias || '';
    console.log(`\n节点 ${id} [${node.type}]: ${title}`);
    
    const m3d = node.model3dSettings || {};
    console.log(`  model3dSettings.modelUrl: ${(m3d.modelUrl || '').substring(0, 100)}`);
    console.log(`  model3dSettings.modelAssetUrl: ${(m3d.modelAssetUrl || '').substring(0, 100)}`);
    console.log(`  model3dSettings.modelSourcePath: ${(m3d.modelSourcePath || '').substring(0, 100)}`);
    console.log(`  model3dSettings.modelAssetPath: ${(m3d.modelAssetPath || '').substring(0, 100)}`);
    console.log(`  model3dSettings.modelFormat: ${m3d.modelFormat}`);
    console.log(`  model3dSettings.modelSourceName: ${m3d.modelSourceName}`);
    console.log(`  model3dSettings.resourceId: ${m3d.resourceId}`);
    
    if (m3d.meshyModelSettings) {
        console.log(`  model3dSettings.meshyModelSettings 存在:`, Object.keys(m3d.meshyModelSettings));
    }
    
    const ms = node.meshySettings || {};
    if (Object.keys(ms).length > 0) {
        console.log(`  meshySettings 存在:`, Object.keys(ms).slice(0, 10));
    }
    
    console.log(`  node.resourceId: ${node.resourceId}`);
    console.log(`  node.modelUrl: ${(node.modelUrl || '').substring(0, 100)}`);
    
    const settings = node.settings || {};
    if (settings && (settings.modelUrl || settings.modelAssetPath || settings.modelSourcePath)) {
        console.log(`  settings.modelUrl: ${(settings.modelUrl || '').substring(0, 100)}`);
        console.log(`  settings.modelAssetPath: ${(settings.modelAssetPath || '').substring(0, 100)}`);
        console.log(`  settings.modelSourcePath: ${(settings.modelSourcePath || '').substring(0, 100)}`);
    }
}

console.log('\n=== 查找包含"桌"或"table"或"meshy-3d-019f1120"的节点 ===');
for (const [id, node] of Object.entries(nodesById)) {
    const str = JSON.stringify(node).toLowerCase();
    const title = (node.title || node.alias || '').toLowerCase();
    if (title.includes('桌') || title.includes('table') || title.includes('left') || str.includes('019f1120') || str.includes('meshy-3d-019f1120')) {
        console.log(`\n*** 疑似桌子节点: ${id} [${node.type}] ${node.title || node.alias}`);
        console.log(JSON.stringify(node, null, 2).substring(0, 3000));
    }
}

console.log('\n=== .dweb-assets.json 中的资源（前10个） ===');
const assetsList = Array.isArray(assets) ? assets : (assets.assets || Object.values(assets));
if (Array.isArray(assetsList)) {
    for (const a of assetsList.slice(0, 5)) {
        console.log(' ', a.id || a.resourceId, '|', a.name, '|', (a.absolutePath || a.sourcePath || a.url || '').substring(0, 100));
    }
    console.log('资源总数:', assetsList.length);
    
    console.log('\n=== 查找包含meshy-3d-019f1120的资源 ===');
    for (const a of assetsList) {
        const s = JSON.stringify(a).toLowerCase();
        if (s.includes('019f1120') || s.includes('meshy-3d-019f1120')) {
            console.log('*** 找到桌子相关资源:', JSON.stringify(a, null, 2));
        }
    }
}
