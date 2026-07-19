export class BaseAgentScene {
  constructor(config) {
    this.config = config
  }

  buildSystemPrompt(context, options = {}) {
    if (this.config.useCustomSystemPrompt && options.customSystemPrompt) {
      return options.customSystemPrompt
    }
    return this.buildDefaultSystemPrompt(context, options)
  }

  buildDefaultSystemPrompt(_context, _options = {}) {
    return ''
  }

  filterTools(allTools, requestedTools = []) {
    if (this.config.allowAllTools) {
      return allTools
    }
    const whitelist = new Set(this.config.toolWhitelist || [])
    if (requestedTools.length > 0) {
      const requestedSet = new Set(requestedTools.map(t => String(t)))
      return allTools.filter(t => whitelist.has(t.function.name) && requestedSet.has(t.function.name))
    }
    return allTools.filter(t => whitelist.has(t.function.name))
  }
}
