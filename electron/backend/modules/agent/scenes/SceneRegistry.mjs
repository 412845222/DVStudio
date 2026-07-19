import { DVSAgentType, AGENT_SCENE_CONFIGS } from '../types/AgentTypes.mjs'
import { WorkflowScene } from './WorkflowScene.mjs'
import { BlenderScene } from './BlenderScene.mjs'
import { BaseAgentScene } from './BaseScene.mjs'

const sceneInstances = new Map()

export function getScene(agentType) {
  if (sceneInstances.has(agentType)) {
    return sceneInstances.get(agentType)
  }

  const config = AGENT_SCENE_CONFIGS[agentType]
  if (!config) {
    return new BaseAgentScene({
      type: DVSAgentType.GENERAL,
      displayName: '通用助手',
      useCustomSystemPrompt: false,
      allowAllTools: true,
      injectBlueprintContext: false,
      injectProjectContext: true
    })
  }

  let scene
  switch (agentType) {
    case DVSAgentType.WORKFLOW:
      scene = new WorkflowScene(config)
      break
    case DVSAgentType.BLENDER:
      scene = new BlenderScene(config)
      break
    default:
      scene = new BaseAgentScene(config)
      break
  }

  sceneInstances.set(agentType, scene)
  return scene
}

export function getSceneConfig(agentType) {
  return AGENT_SCENE_CONFIGS[agentType] || null
}

export function shouldInjectBlueprintContext(agentType) {
  const config = getSceneConfig(agentType)
  return config?.injectBlueprintContext ?? false
}

export function shouldInjectProjectContext(agentType) {
  const config = getSceneConfig(agentType)
  return config?.injectProjectContext ?? true
}
