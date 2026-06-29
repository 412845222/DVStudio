export type AgentChatMode = 'standard' | 'agent' | 'cli'

export type AgentTool = {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export type AgentContextItem = {
  type: 'file' | 'selection' | 'project' | 'custom'
  label: string
  value: string
}

export type CLISessionInfo = {
  sessionId: string
  adapterId: string
  createdAt: string
  status: 'active' | 'stopped' | 'error'
  lastMessageAt?: string
}

export type CLIAdapterInfo = {
  id: string
  name: string
  description?: string
  version?: string
  available: boolean
  requirements?: string[]
}
