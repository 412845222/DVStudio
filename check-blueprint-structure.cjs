const fs = require('fs');

const blueprintPath = 'G:\\DVSTestProject\\展示示例\\Blueprints\\main.blueprint.json';
const data = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

console.log('=== 蓝图文件顶层keys ===');
console.log(Object.keys(data));

console.log('\n=== 顶层结构类型 ===');
Object.entries(data).forEach(([key, value]) => {
  const type = Array.isArray(value) ? 'array' : typeof value;
  if (type === 'array') {
    console.log(`  ${key}: array (长度: ${value.length})`);
  } else if (type === 'object' && value !== null) {
    console.log(`  ${key}: object (keys: ${Object.keys(value).slice(0, 10).join(', ')}${Object.keys(value).length > 10 ? '...' : ''})`);
  } else {
    console.log(`  ${key}: ${type} = ${value}`);
  }
});

// 如果有 nodes 是数组的情况
if (Array.isArray(data.nodes)) {
  console.log(`\nnodes 是数组，长度: ${data.nodes.length}`);
  console.log('第一个节点:', JSON.stringify(data.nodes[0], null, 2).substring(0, 500));
}

// 检查是否是包装在其他key下
if (data.graph) {
  console.log('\n=== data.graph keys ===');
  console.log(Object.keys(data.graph));
  if (data.graph.nodes) {
    console.log(`graph.nodes 类型: ${Array.isArray(data.graph.nodes) ? 'array' : typeof data.graph.nodes}`);
    if (Array.isArray(data.graph.nodes)) {
      console.log(`graph.nodes 长度: ${data.graph.nodes.length}`);
    } else {
      console.log(`graph.nodes keys: ${Object.keys(data.graph.nodes).slice(0, 5)}`);
    }
  }
}

if (data.blueprint) {
  console.log('\n=== data.blueprint keys ===');
  console.log(Object.keys(data.blueprint));
}

// 检查所有包含 node 的key
console.log('\n=== 搜索包含node的key ===');
const findNodeKeys = (obj, prefix = '') => {
  if (!obj || typeof obj !== 'object') return;
  Object.keys(obj).forEach(key => {
    if (key.toLowerCase().includes('node')) {
      console.log(`  ${prefix}${key}: ${Array.isArray(obj[key]) ? 'array(' + obj[key].length + ')' : typeof obj[key]}`);
    }
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      findNodeKeys(obj[key], prefix + key + '.');
    }
  });
};
findNodeKeys(data);
