export const DVSAgentType = {
  WORKFLOW: 'workflow',
  BLENDER: 'blender',
  VIDEO_EDITOR: 'video_editor',
  NODE_CHAT: 'node_chat',
  GENERAL: 'general'
}

export const AGENT_SCENE_CONFIGS = {
  [DVSAgentType.WORKFLOW]: {
    type: DVSAgentType.WORKFLOW,
    displayName: '工作流助手',
    useCustomSystemPrompt: false,
    allowAllTools: true,
    injectBlueprintContext: true,
    injectProjectContext: true
  },
  [DVSAgentType.BLENDER]: {
    type: DVSAgentType.BLENDER,
    displayName: 'Blender控制助手',
    useCustomSystemPrompt: true,
    allowAllTools: false,
    toolWhitelist: [
      'blender_execute_blender_code',
      'blender_get_objects_summary',
      'blender_get_object_detail_summary',
      'blender_get_blendfile_summary_datablocks',
      'blender_get_blendfile_summary_missing_files',
      'blender_get_blendfile_summary_of_linked_libraries',
      'blender_get_blendfile_summary_path_info',
      'blender_get_blendfile_summary_usage_guess',
      'blender_get_screenshot_of_area_as_image',
      'blender_get_screenshot_of_window_as_image',
      'blender_get_screenshot_of_window_as_json',
      'blender_jump_to_tab_by_name',
      'blender_jump_to_tab_by_space_type',
      'blender_jump_to_view3d_object_by_name',
      'blender_jump_to_view3d_object_data_by_name',
      'blender_import_model',
      'blender_read_workspace_image',
      'blender_list_workspace_images'
    ],
    injectBlueprintContext: false,
    injectProjectContext: false
  },
  [DVSAgentType.VIDEO_EDITOR]: {
    type: DVSAgentType.VIDEO_EDITOR,
    displayName: '视频编辑器助手',
    useCustomSystemPrompt: true,
    allowAllTools: false,
    toolWhitelist: [],
    injectBlueprintContext: false,
    injectProjectContext: false
  },
  [DVSAgentType.NODE_CHAT]: {
    type: DVSAgentType.NODE_CHAT,
    displayName: '节点对话助手',
    useCustomSystemPrompt: false,
    allowAllTools: false,
    toolWhitelist: [],
    injectBlueprintContext: false,
    injectProjectContext: true
  },
  [DVSAgentType.GENERAL]: {
    type: DVSAgentType.GENERAL,
    displayName: '通用助手',
    useCustomSystemPrompt: false,
    allowAllTools: true,
    injectBlueprintContext: false,
    injectProjectContext: true
  }
}
