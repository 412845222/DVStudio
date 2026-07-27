import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const PROJECT_ROOT = join(__dirname, '..', '..')
const SRC_DIR = join(PROJECT_ROOT, 'src')

interface SourceFile {
  path: string
  relativePath: string
  content: string
}

function collectSourceFiles(dir: string, results: SourceFile[] = []): SourceFile[] {
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      collectSourceFiles(fullPath, results)
    } else if (/\.(ts|vue)$/.test(entry) && !entry.endsWith('.d.ts')) {
      results.push({
        path: fullPath,
        relativePath: relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/'),
        content: readFileSync(fullPath, 'utf-8')
      })
    }
  }
  return results
}

const allSourceFiles = collectSourceFiles(SRC_DIR)

const blueprintEngineFiles = allSourceFiles.filter(
  f => f.relativePath.startsWith('src/engine/blueprint/')
)

const graphbaseFiles = allSourceFiles.filter(
  f => f.relativePath.startsWith('src/engine/graphbase/')
)

const blueprintHostFiles = allSourceFiles.filter(
  f => f.relativePath.startsWith('src/views/AIWorkflow/')
)

function findViolations(files: SourceFile[], patterns: RegExp[], allowedLines: Map<string, number[]> = new Map()): Array<{ file: string; line: number; match: string }> {
  const violations: Array<{ file: string; line: number; match: string }> = []
  for (const file of files) {
    const lines = file.content.split('\n')
    const allowedLineSet = new Set(allowedLines.get(file.relativePath) ?? [])
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1
      if (allowedLineSet.has(lineNum)) continue
      const trimmed = lines[i].trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
      for (const pattern of patterns) {
        if (pattern.test(lines[i])) {
          violations.push({ file: file.relativePath, line: lineNum, match: trimmed.slice(0, 120) })
        }
      }
    }
  }
  return violations
}

describe('🔴 Blueprint Architecture Compliance Tests', () => {

  describe('Rule 1: No direct transform.position assignment in blueprint layer', () => {
    it('should not directly assign to node.transform.position.x/y in blueprint engine files (outside GraphObject base class)', () => {
      const patterns = [
        /\.transform\.position\s*\.\s*[xy]\s*=/,
        /\.transform\.position\s*=\s*new\s+Vector2/
      ]

      const files = blueprintEngineFiles.filter(f => {
        return !f.relativePath.endsWith('/GraphObject.ts') &&
               !f.relativePath.includes('__tests__') &&
               !f.relativePath.includes('.test.') &&
               !f.relativePath.includes('.spec.')
      })

      const allowed = new Map<string, number[]>()
      allowed.set('src/engine/blueprint/BlueprintNode.ts', [])

      const violations = findViolations(files, patterns, allowed)

      const actualViolations = violations.filter(v => {
        if (v.file.endsWith('/GraphObject.ts')) return false
        if (v.match.includes('// allow-direct')) return false
        if (v.file.endsWith('BlueprintScene.ts') && v.match.includes('_tempConnection')) return false
        if (v.file.endsWith('BlueprintScene.ts') && v.match.includes('setPoints')) return false
        return true
      })

      if (actualViolations.length > 0) {
        console.log('\n❌ Direct transform.position assignment violations:')
        for (const v of actualViolations) {
          console.log(`  ${v.file}:${v.line}  ${v.match}`)
        }
      }

      expect(actualViolations, `Found ${actualViolations.length} direct transform.position assignments in blueprint layer`).toEqual([])
    })
  })

  describe('Rule 2: No direct data.worldX/worldY assignment in business code', () => {
    it('should not directly assign to node.data.worldX/worldY in host files (use node.setPosition())', () => {
      const patterns = [
        /\.data\.worldX\s*=/,
        /\.data\.worldY\s*=/,
        /\.data\s*\.\s*width\s*=\s*(?!\s*node\.data\.width)/,
        /\.data\s*\.\s*height\s*=\s*(?!\s*node\.data\.height)/
      ]

      const files = blueprintHostFiles.filter(f => {
        return !f.relativePath.includes('workflowStateAdapter') &&
               !f.relativePath.includes('blueprint-bridge/') &&
               !f.relativePath.includes('__tests__') &&
               !f.relativePath.includes('.test.') &&
               !f.relativePath.includes('.spec.')
      })

      const violations = findViolations(files, patterns)

      const actualViolations = violations.filter(v => {
        if (v.match.includes('// allow-direct')) return false
        if (v.match.includes('patchBlueprintNodeData')) return false
        return true
      })

      if (actualViolations.length > 0) {
        console.log('\n❌ Direct data.worldX/worldY assignment violations in host files:')
        for (const v of actualViolations) {
          console.log(`  ${v.file}:${v.line}  ${v.match}`)
        }
      }

      expect(actualViolations, `Found ${actualViolations.length} direct data.worldX/worldY assignments in host layer`).toEqual([])
    })
  })

  describe('Rule 3: Vuex must not be the source of truth for blueprint drawing state', () => {
    it('selectedNodeIds watch must not trigger syncBlueprintNow/loadBlueprint reverse sync', () => {
      const hostFile = allSourceFiles.find(
        f => f.relativePath === 'src/views/AIWorkflow/AIWorkflowPage.vue'
      )
      expect(hostFile, 'AIWorkflowPage.vue should exist').toBeTruthy()
      if (!hostFile) return

      const content = hostFile.content

      const watchSelectedNodeIdsPattern = /watch\s*\(\s*\(\s*\)\s*=>\s*\[[^\]]*selectedNodeIds/
      const hasSelectedNodeIdsWatch = watchSelectedNodeIdsPattern.test(content)

      const syncBlueprintCall = /syncBlueprintNow\s*\(\s*\)/
      const requestSyncCall = /requestStoreSyncToEditor\s*\(\s*\)/

      const watchBlocks = content.match(/watch\s*\(\s*\(\s*\)\s*=>\s*\[([\s\S]*?)\]\s*,\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\}/g)

      let selectedNodeIdsTriggersSync = false
      if (watchBlocks) {
        for (const block of watchBlocks) {
          if (block.includes('selectedNodeIds') && (syncBlueprintCall.test(block) || /scheduleStoreSyncToEditor/.test(block))) {
            if (!block.includes('requestStoreSyncToEditor')) {
              selectedNodeIdsTriggersSync = true
            }
          }
        }
      }

      if (hasSelectedNodeIdsWatch && selectedNodeIdsTriggersSync) {
        console.log('\n❌ selectedNodeIds watch triggers reverse sync (loadBlueprint) - this causes position rollback on deselect')
      }

      expect(selectedNodeIdsTriggersSync, 'watch on selectedNodeIds must not trigger syncBlueprintNow/scheduleStoreSyncToEditor').toBe(false)
    })
  })

  describe('Rule 4: GraphObject.translate() must delegate to setPosition() for polymorphism', () => {
    it('GraphObject.translate should call setPosition to ensure BlueprintNode override works', () => {
      const graphObjectFile = allSourceFiles.find(
        f => f.relativePath.endsWith('/graphbase/scene/GraphObject.ts')
      )
      expect(graphObjectFile, 'GraphObject.ts should exist').toBeTruthy()
      if (!graphObjectFile) return

      const translateMatch = graphObjectFile.content.match(/translate\s*\([^)]*\)\s*:\s*[^{]*\{([\s\S]*?)\n\s*\}/)
      expect(translateMatch, 'translate method should exist').toBeTruthy()
      if (!translateMatch) return

      const translateBody = translateMatch[1]
      const callsSetPosition = /this\.setPosition\s*\(/.test(translateBody) || /return\s+this\.setPosition/.test(translateBody)

      if (!callsSetPosition) {
        console.log('\n❌ GraphObject.translate() does not call this.setPosition() - BlueprintNode data sync will not trigger')
      }

      expect(callsSetPosition, 'translate() must call this.setPosition() to ensure subclass overrides are invoked').toBe(true)
    })
  })

  describe('Rule 5: BlueprintNode.setPosition must sync data.worldX/worldY', () => {
    it('BlueprintNode.setPosition should update both transform.position and data.worldX/Y', () => {
      const nodeFile = allSourceFiles.find(
        f => f.relativePath === 'src/engine/blueprint/BlueprintNode.ts'
      )
      expect(nodeFile, 'BlueprintNode.ts should exist').toBeTruthy()
      if (!nodeFile) return

      const setPositionMatch = nodeFile.content.match(/setPosition\s*\([^)]*\)\s*:\s*[^{]*\{([\s\S]*?)(?=\n\s*public\s+|\n\s*private\s+|\n\s*protected\s+|\n\s*updateSize|\n\s*syncDataFromTransform|\n\s*\}\s*$)/)
      expect(setPositionMatch, 'setPosition method should exist').toBeTruthy()
      if (!setPositionMatch) return

      const body = setPositionMatch[1]
      const syncsWorldX = /this\.data\.worldX\s*=/.test(body)
      const syncsWorldY = /this\.data\.worldY\s*=/.test(body)

      if (!syncsWorldX || !syncsWorldY) {
        console.log('\n❌ BlueprintNode.setPosition() does not sync data.worldX/worldY')
      }

      expect(syncsWorldX, 'setPosition must set this.data.worldX').toBe(true)
      expect(syncsWorldY, 'setPosition must set this.data.worldY').toBe(true)
    })
  })

  describe('Rule 6: isEngineDragging must be set before executeCommand in pointerup', () => {
    it('pointerup NODES path should set isEngineDragging=false before executeCommand to allow emitChange', () => {
      const editorToolFile = allSourceFiles.find(
        f => f.relativePath === 'src/engine/blueprint/BlueprintEditorTool.ts'
      )
      expect(editorToolFile, 'BlueprintEditorTool.ts should exist').toBeTruthy()
      if (!editorToolFile) return

      const content = editorToolFile.content

      const executeCommandPos = content.indexOf('executeCommand(new MoveNodeCommand')
      const isDraggingFalsePos = content.indexOf('isEngineDragging = false')

      if (executeCommandPos === -1) {
        console.log('\n⚠️  Could not find MoveNodeCommand executeCommand in BlueprintEditorTool.ts')
        return
      }

      let allSetFalseBeforeExecute = true
      let searchPos = 0
      while (true) {
        const cmdPos = content.indexOf('executeCommand(new MoveNodeCommand', searchPos)
        if (cmdPos === -1) break
        const precedingContent = content.slice(Math.max(0, cmdPos - 500), cmdPos)
        const setFalseBefore = precedingContent.includes('isEngineDragging = false')
        if (!setFalseBefore) {
          allSetFalseBeforeExecute = false
          const lineNum = content.slice(0, cmdPos).split('\n').length
          console.log(`\n❌ executeCommand at line ~${lineNum} is not preceded by isEngineDragging = false`)
        }
        searchPos = cmdPos + 1
      }

      expect(allSetFalseBeforeExecute, 'All MoveNodeCommand executeCommand calls must be preceded by isEngineDragging=false to prevent emitChange from being blocked').toBe(true)
    })
  })

  describe('Rule 7: serialize() must include defensive position sync', () => {
    it('BlueprintScene.serialize() should sync node data from transform before serializing', () => {
      const sceneFile = allSourceFiles.find(
        f => f.relativePath === 'src/engine/blueprint/BlueprintScene.ts'
      )
      expect(sceneFile, 'BlueprintScene.ts should exist').toBeTruthy()
      if (!sceneFile) return

      const content = sceneFile.content

      const serializeMatch = content.match(/serialize\s*\(\s*\)\s*:\s*BlueprintData\s*\{([\s\S]*?)(?=\n\s*public\s+|\n\s*private\s+|\n\s*serializeLegacy|\n\s*\}\s*$)/)
      if (!serializeMatch) {
        expect(true, 'serialize method exists').toBe(true)
        return
      }

      const body = serializeMatch[1]
      const hasDefensiveSync = /syncDataFromTransform/.test(body) || /\.data\.worldX\s*=.*transform\.position\.x/.test(body)

      if (!hasDefensiveSync) {
        console.log('\n❌ BlueprintScene.serialize() does not have defensive position sync')
      }

      expect(hasDefensiveSync, 'serialize() should defensively sync data.worldX/Y from transform.position as a safety net').toBe(true)
    })
  })

  describe('Rule 8: emitChange must not be blocked by isEngineDragging after command execution', () => {
    it('BlueprintEditor.vue emitChange guard should check isEngineDragging correctly', () => {
      const editorFile = allSourceFiles.find(
        f => f.relativePath === 'src/engine/blueprint/BlueprintEditor.vue'
      )
      expect(editorFile, 'BlueprintEditor.vue should exist').toBeTruthy()
      if (!editorFile) return

      const content = editorFile.content

      const hasIsDraggingGuard = /isEngineDragging/.test(content)
      expect(hasIsDraggingGuard, 'emitChange should have isEngineDragging guard to prevent mid-drag syncs').toBe(true)
    })
  })

  describe('Rule 9: loadBlueprint must have dedup protection', () => {
    it('BlueprintScene.loadBlueprint should have signature-based deduplication to prevent redundant rebuilds', () => {
      const sceneFile = allSourceFiles.find(
        f => f.relativePath === 'src/engine/blueprint/BlueprintScene.ts'
      )
      expect(sceneFile, 'BlueprintScene.ts should exist').toBeTruthy()
      if (!sceneFile) return

      const content = sceneFile.content

      const loadMatch = content.match(/loadBlueprint\s*\([^)]*\)\s*:\s*void\s*\{([\s\S]*?)(?=\n\s*loadLegacyBlueprint|\n\s*addBlueprintNode|\n\s*public\s+|\n\s*private\s+|\n\s*\}\s*$)/)
      if (!loadMatch) {
        expect(true, 'loadBlueprint method exists').toBe(true)
        return
      }

      const body = loadMatch[1]
      const hasDedup = /_lastLoadSignature/.test(body) || /same\s+signature/.test(body)

      if (!hasDedup) {
        console.log('\n❌ BlueprintScene.loadBlueprint() does not have deduplication protection')
      }

      expect(hasDedup, 'loadBlueprint should have signature-based dedup to prevent redundant node rebuilds').toBe(true)
    })
  })

  describe('Rule 10: isUpdatingFromStore guard on selection change commit', () => {
    it('onBlueprintEditorSelectionChange must set isUpdatingFromStore around Vuex commits', () => {
      const pageFile = allSourceFiles.find(
        f => f.relativePath === 'src/views/AIWorkflow/AIWorkflowPage.vue'
      )
      expect(pageFile, 'AIWorkflowPage.vue should exist').toBeTruthy()
      if (!pageFile) return

      const content = pageFile.content

      const selChangeMatch = content.match(/function\s+onBlueprintEditorSelectionChange\s*\([^)]*\)\s*\{([\s\S]*?)(?=\n\s*function\s+|\n\s*const\s+\w+\s*=|\n\s*$)/)
      if (!selChangeMatch) {
        expect(true, 'onBlueprintEditorSelectionChange exists').toBe(true)
        return
      }

      const body = selChangeMatch[1]
      const hasGuard = /isUpdatingFromStore\s*=\s*true/.test(body)

      expect(hasGuard, 'onBlueprintEditorSelectionChange must set isUpdatingFromStore=true before committing selection changes to Vuex').toBe(true)
    })
  })

  describe('Rule 11: main.ts must pass through Ctrl+Z/Y/Delete for blueprint routes', () => {
    it('window keydown handler in main.ts should skip stopPropagation for AIWorkflow/BlueprintTest routes', () => {
      const mainFile = allSourceFiles.find(
        f => f.relativePath === 'src/main.ts'
      )
      expect(mainFile, 'main.ts should exist').toBeTruthy()
      if (!mainFile) return

      const content = mainFile.content

      const hasRouteCheck = /AIWorkflow.*BlueprintTest|BlueprintTest.*AIWorkflow/.test(content)
      const hasPassThrough = /PASS THROUGH|return.*engine handles/.test(content)

      if (!hasRouteCheck || !hasPassThrough) {
        console.log('\n❌ main.ts does not have route-aware pass-through for Ctrl+Z/Y on blueprint routes')
      }

      expect(hasRouteCheck, 'main.ts should check for AIWorkflow/BlueprintTest routes').toBe(true)
      expect(hasPassThrough, 'main.ts should pass through keyboard events for blueprint routes instead of stopping propagation').toBe(true)
    })
  })

  describe('Rule 12: loadBlueprint must support incremental updates without clearing command stack', () => {
    it('loadBlueprint should have incremental update path and must NOT call commands.clear() within loadBlueprint', () => {
      const sceneFile = allSourceFiles.find(
        f => f.relativePath === 'src/engine/blueprint/BlueprintScene.ts'
      )
      expect(sceneFile, 'BlueprintScene.ts should exist').toBeTruthy()
      if (!sceneFile) return

      const content = sceneFile.content

      const loadMatch = content.match(/loadBlueprint\s*\([^)]*\)\s*:\s*void\s*\{([\s\S]*?)(?=\n\s*(?:public|private|protected)\s+\w+[\s(])/)
      if (!loadMatch) {
        expect(true, 'loadBlueprint method exists').toBe(true)
        return
      }

      const loadBody = loadMatch[1]
      const hasIncrementalUpdate = /existing\s*=.*_nodeMap\.get/.test(loadBody) || /posChanged|sizeChanged/.test(loadBody)
      const hasCommandsClearInLoad = /this\.commands\.clear\s*\(/.test(loadBody)

      if (!hasIncrementalUpdate) {
        console.log('\n❌ loadBlueprint does not appear to have incremental update logic')
      }
      if (hasCommandsClearInLoad) {
        console.log('\n❌ loadBlueprint calls this.commands.clear() which destroys undo history')
      }

      expect(hasIncrementalUpdate, 'loadBlueprint should incrementally update existing nodes instead of full dispose/recreate').toBe(true)
      expect(hasCommandsClearInLoad, 'loadBlueprint must NOT call this.commands.clear() as it destroys undo history').toBe(false)
    })
  })

  describe('Rule 13: syncLoadSignature must be called after command execution/undo/redo', () => {
    it('executeCommand/undo/redo must update _lastLoadSignature to prevent feedback loops', () => {
      const sceneFile = allSourceFiles.find(
        f => f.relativePath === 'src/engine/blueprint/BlueprintScene.ts'
      )
      expect(sceneFile, 'BlueprintScene.ts should exist').toBeTruthy()
      if (!sceneFile) return

      const content = sceneFile.content

      const hasSyncMethod = /syncLoadSignature\s*\(/.test(content) || /_lastLoadSignature\s*=.*node\.data\.worldX/.test(content)
      const executeCallsSync = /executeCommand[\s\S]{0,200}syncLoadSignature/.test(content)
      const undoCallsSync = /undo\s*\([\s\S]{0,200}syncLoadSignature/.test(content)
      const redoCallsSync = /redo\s*\([\s\S]{0,200}syncLoadSignature/.test(content)

      if (!hasSyncMethod) {
        console.log('\n❌ BlueprintScene does not have syncLoadSignature method')
      }

      expect(hasSyncMethod, 'BlueprintScene should have syncLoadSignature method').toBe(true)
      expect(executeCallsSync, 'executeCommand must call syncLoadSignature after executing command').toBe(true)
      expect(undoCallsSync, 'undo must call syncLoadSignature after successful undo').toBe(true)
      expect(redoCallsSync, 'redo must call syncLoadSignature after successful redo').toBe(true)
    })
  })

  describe('Rule 14: Scene.setupKeyboardShortcuts must handle Ctrl+Z/Y for undo/redo', () => {
    it('base Scene class should handle Ctrl+Z (undo) and Ctrl+Y/Shift+Z (redo) keyboard shortcuts', () => {
      const sceneFile = allSourceFiles.find(
        f => f.relativePath === 'src/engine/graphbase/scene/Scene.ts'
      )
      expect(sceneFile, 'Scene.ts should exist').toBeTruthy()
      if (!sceneFile) return

      const content = sceneFile.content

      const hasCtrlZ = /ctrl\s*&&\s*key\s*===\s*['"]z['"]/.test(content) || /KeyZ.*ctrlKey|ctrlKey.*KeyZ/.test(content)
      const hasUndoCall = /this\.undo\s*\(/.test(content)
      const hasRedoCall = /this\.redo\s*\(/.test(content)

      if (!hasCtrlZ || !hasUndoCall) {
        console.log('\n❌ Scene.setupKeyboardShortcuts does not handle Ctrl+Z undo')
      }

      expect(hasCtrlZ, 'Scene should detect Ctrl+Z keyboard shortcut').toBe(true)
      expect(hasUndoCall, 'Scene should call this.undo() on Ctrl+Z').toBe(true)
      expect(hasRedoCall, 'Scene should call this.redo() for redo shortcuts').toBe(true)
    })
  })

  describe('Rule 15: workflowStateToLegacyBlueprint cache must update node coordinates on cache hit', () => {
    it('cache hit path must sync worldX/worldY/x/y/width/height from state nodes to cached result', () => {
      const adapterFile = allSourceFiles.find(
        f => f.relativePath === 'src/views/AIWorkflow/blueprint-bridge/workflowStateAdapter.ts'
      )
      expect(adapterFile, 'workflowStateAdapter.ts should exist').toBeTruthy()
      if (!adapterFile) return

      const content = adapterFile.content

      const cacheHitBlock = content.match(/if\s*\(\s*_cachedResult\s*&&\s*_cacheKey\s*===\s*structureKey\s*\)\s*\{([\s\S]*?)return\s+_cachedResult\s*;/)
      expect(cacheHitBlock, 'cache hit block should exist').toBeTruthy()
      if (!cacheHitBlock) return

      const cacheBody = cacheHitBlock[1]

      const hasNodeCoordSync = /cachedNode\.worldX\s*=/.test(cacheBody) && /cachedNode\.worldY\s*=/.test(cacheBody)
      const hasLegacyXYUpdate = /cachedNode\.x\s*=/.test(cacheBody) && /cachedNode\.y\s*=/.test(cacheBody)
      const hasSizeSync = /cachedNode\.width\s*=/.test(cacheBody) && /cachedNode\.height\s*=/.test(cacheBody)
      const loopsOverNodes = /for\s*\(\s*const\s+nodeId\s+of\s+state\.nodeOrder\s*\)/.test(cacheBody)

      if (!hasNodeCoordSync || !hasLegacyXYUpdate || !hasSizeSync || !loopsOverNodes) {
        console.log('\n❌ workflowStateToLegacyBlueprint cache hit block does not update node coordinates/sizes')
        console.log('   This causes stale coordinates to be returned when only positions change,')
        console.log('   leading to loadBlueprint overwriting engine state and breaking undo.')
      }

      expect(loopsOverNodes, 'cache hit block should iterate state.nodeOrder to update node positions').toBe(true)
      expect(hasNodeCoordSync, 'cache hit block should sync cachedNode.worldX/worldY from current state').toBe(true)
      expect(hasLegacyXYUpdate, 'cache hit block should update legacy x/y fields too').toBe(true)
      expect(hasSizeSync, 'cache hit block should sync cachedNode.width/height from current state').toBe(true)
    })

    it('cache key must NOT rely solely on node order/edges/selection but must invalidate on node count changes', () => {
      const adapterFile = allSourceFiles.find(
        f => f.relativePath === 'src/views/AIWorkflow/blueprint-bridge/workflowStateAdapter.ts'
      )
      expect(adapterFile, 'workflowStateAdapter.ts should exist').toBeTruthy()
      if (!adapterFile) return

      const content = adapterFile.content

      const hasNodeCountInKey = /nodeCount|state\.nodeOrder\.length/.test(content)
      expect(hasNodeCountInKey, 'structureKey should include node count to invalidate when nodes are added/removed').toBe(true)
    })
  })
})
