const fs = require('fs');
const path = require('path');

const blueprintPath = 'G:\\DVSTestProject\\展示示例\\Blueprints\\main.blueprint.json';
const assetsPath = 'G:\\DVSTestProject\\展示示例\\Content\\Media\\.dweb-assets.json';

const data = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
const assets = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));

const nodesById = {};
const nodes = data.nodes || data.nodesById || {};
if (Array.isArray(nodes)) {
    for (const n of nodes) if (n && n.id) nodesById[n.id] = n;
} else {
    Object.assign(nodesById, nodes);
}

const edges = data.edges || [];

const tableNodeId = 'wf-node-mqx7lh15-ff954e';
const tableNode = nodesById[tableNodeId];

console.log('=== 桌子节点完整数据 ===');
console.log(JSON.stringify(tableNode, null, 2));

console.log('\n=== 资源表结构(顶层键) ===');
console.log(Object.keys(assets));

let assetsList = [];
if (Array.isArray(assets)) {
    assetsList = assets;
} else if (assets.assets && Array.isArray(assets.assets)) {
    assetsList = assets.assets;
} else if (assets.resources && Array.isArray(assets.resources)) {
    assetsList = assets.resources;
} else {
    for (const [k, v] of Object.entries(assets)) {
        if (Array.isArray(v)) assetsList = assetsList.concat(v);
    }
}

console.log('\n资源总数:', assetsList.length);

console.log('\n=== 查找桌子节点相关资源（按019f1120搜索） ===');
for (const a of assetsList) {
    const s = JSON.stringify(a).toLowerCase();
    if (s.includes('019f1120')) {
        console.log(JSON.stringify(a, null, 2));
    }
}

console.log('\n=== 桌子节点的resourceId ===');
console.log('node.resourceId:', tableNode.resourceId);
const m3d = tableNode.model3dSettings || {};
console.log('model3dSettings.resourceId:', m3d.resourceId);

if (m3d.resourceId || tableNode.resourceId) {
    const rid = m3d.resourceId || tableNode.resourceId;
    console.log('\n=== 按resourceId查找资源:', rid, '===');
    for (const a of assetsList) {
        if (a.id === rid || a.resourceId === rid || a._id === rid) {
            console.log(JSON.stringify(a, null, 2));
        }
    }
}

console.log('\n=== Content/Media下meshy-3d-019f1120文件 ===');
const mediaDir = 'G:\\DVSTestProject\\展示示例\\Content\\Media';
try {
    const files = fs.readdirSync(mediaDir);
    for (const f of files) {
        if (f.includes('019f1120')) {
            const fullPath = path.join(mediaDir, f);
            const stat = fs.statSync(fullPath);
            console.log(`  ${f} (${stat.size} bytes)`);
        }
    }
} catch(e) {
    console.error(e);
}

console.log('\n=== model3dSettings.meshyModelSettings ===');
if (m3d.meshyModelSettings) {
    console.log(JSON.stringify(m3d.meshyModelSettings, null, 2));
}
