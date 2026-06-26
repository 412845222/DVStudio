import os

dir_path = r'g:\DwebStudio\DwebVideoStudio\DVStudio\src\ui\WorkFlow\WorlFlowNodes'

vue_files = [
    'WorkflowComfyUINode.vue',
    'WorkflowMeshyModelNode.vue',
    'WorkflowModel3DNode.vue',
    'WorkflowVideoNode.vue',
    'WorkflowTextNode.vue',
    'WorkflowTextMergeNode.vue',
    'WorkflowRotateImageNode.vue',
    'WorkflowSceneDecomposeNode.vue',
    'WorkflowSceneUnderstandingNode.vue',
    'WorkflowSceneLayoutNode.vue',
    'WorkflowStoryNode.vue',
    'WorkflowUnrealExportNode.vue',
]

handlers = '''

const onStartLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number; event: PointerEvent }) => { emit('start-link', payload) }
const onEndLink = (payload: { nodeId: string; anchorId: string; anchorIndex: number }) => { emit('end-link', payload) }
const onSetType = (type: 'base' | 'text' | 'text-merge' | 'image' | 'rotate-image' | 'video' | 'scene-understanding' | 'scene-decompose' | 'scene-layout' | 'unreal-export' | 'story' | 'comfyui' | 'model3d' | 'meshy') => { emit('set-type', type) }
const onResize = (payload: { width: number; height: number; worldX: number; worldY: number }) => { emit('resize', payload) }

'''

for filename in vue_files:
    filepath = os.path.join(dir_path, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    pos = content.find('}>()\n\nconst ')
    if pos == -1:
        pos = content.find('}>()\nconst ')
        if pos == -1:
            print(f'Skipping {filename} - no insertion point found')
            continue
    
    insert_pos = pos + 4
    content = content[:insert_pos] + handlers + content[insert_pos:]
    
    content = content.replace("@start-link=\"(payload: any) => emit('start-link', payload)\"", "@start-link=\"onStartLink\"")
    content = content.replace("@end-link=\"(payload: any) => emit('end-link', payload)\"", "@end-link=\"onEndLink\"")
    content = content.replace("@set-type=\"(type: any) => emit('set-type', type)\"", "@set-type=\"onSetType\"")
    content = content.replace("@resize=\"(payload: any) => emit('resize', payload)\"", "@resize=\"onResize\"")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'Updated: {filename}')

print('Done!')
