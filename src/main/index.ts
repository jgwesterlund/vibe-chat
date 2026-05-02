import { app, shell, BrowserWindow, ipcMain, nativeTheme, session, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  AVAILABLE_MODELS,
  OLLAMA_MODEL_PREFIX,
  runtimeModelName,
  type AppProviderConfig,
  type PiAiProviderConfig
} from '@shared/types'
import {
  locateMLX,
  installMLX,
  startServer,
  stopServer,
  listLocalModels,
  type MLXChatMessage
} from './mlx'
import {
  TOOLS,
  chatSystemPrompt,
  codeSystemPrompt,
  piAiChatSystemPrompt,
  piAiCodeSystemPrompt,
  findNextAction,
  emitSafeBoundary,
  runTool,
  cleanFileContent,
  type ToolContext
} from './tools'
import {
  ensureWorkspace,
  startWorkspaceServer,
  stopWorkspaceServer,
  getWorkspaceServerPort,
  previewUrl,
  listTree,
  workspaceDir,
  assertInWorkspace,
  wsWriteFile
} from './workspace'
import type {
  BuildQuestion,
  BuildQuestionnaireCopy,
  BuildQuestionnaireGenerationRequest,
  BuildQuestionnaireGenerationResponse,
  ChatRequest,
  ConversationDesign,
  DesignExtractionRequest,
  StreamChunk,
  ToolCall
} from '../shared/types'
import { streamLocalMlx } from './providers/localMlxProvider'
import { streamLocalOllama } from './providers/localOllamaProvider'
import {
  listPiAiModels,
  listPiAiProviders,
  resolvePiAiModel,
  streamPiAi
} from './providers/piAiProvider'
import { defaultProviderSelection } from './providers/types'
import { ensureOllamaModel, listOllamaModels } from './ollama'
import {
  readProviderConfig,
  writeProviderConfig
} from './providers/config'
import { detectPromptLanguage } from '../shared/buildQuestionnaire'
import {
  clearPiAiCredentials,
  coerceOAuthPrompt,
  getPiAiAuthStatus,
  loginPiAiOAuth,
  refreshPiAiOAuth,
  resolvePiAiApiKey,
  setPiAiApiKey
} from './auth/piAiAuth'
import {
  cancelDesignExtraction,
  cleanupLegacyWorkspaceDesign,
  clearInstalledDesign,
  installDesign,
  installCustomDesign,
  listCustomDesigns,
  listDesignCatalog,
  readDesignContext,
  startDesignExtraction
} from './designs'
import {
  DESIGN_GUARD_MAX_REPAIR_ROUNDS,
  DESIGN_GUARD_MAX_MUTATIONS_PER_REPAIR,
  designGuardFinalWarning,
  designGuardRepairPrompt,
  formatDesignGuardScanResult,
  scanWorkspaceDesignGuard,
  type DesignGuardReport
} from './designGuard'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 820,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1f1421',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (is.dev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function send(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload)
}

let mlxPython: string | null = null

async function ensureMLXRunning(model: string): Promise<string> {
  let mlx = locateMLX()
  if (!mlx) {
    throw new Error(
      'Python 3.10–3.13 not found. Install via Homebrew: brew install python@3.13'
    )
  }

  let pythonToUse = mlx.python

  if (!mlx.installed) {
    send('setup:status', {
      stage: 'installing-mlx',
      message: 'Installing MLX runtime…'
    })
    // installMLX creates the venv and returns the venv python path
    pythonToUse = await installMLX((p) => {
      send('setup:status', {
        stage: 'installing-mlx',
        message: p.message
      })
    })
  }

  mlxPython = pythonToUse

  const label = AVAILABLE_MODELS.find((m) => m.name === model)?.label ?? model
  send('setup:status', { stage: 'starting-mlx', message: 'Starting model runtime…' })
  send('setup:status', {
    stage: 'downloading-model',
    message: `Loading ${label}… (first run downloads the model)`
  })
  await startServer(pythonToUse, model, (p) => {
    send('setup:status', {
      stage: 'downloading-model',
      message: p.message,
      progress: p.progress
    })
  })
  return pythonToUse
}

async function ensureOllamaRunning(model: string): Promise<void> {
  const label =
    AVAILABLE_MODELS.find((m) => m.name === model)?.label ?? runtimeModelName(model)
  send('setup:status', {
    stage: 'connecting-ollama',
    message: `Connecting to Ollama for ${label}…`
  })
  await ensureOllamaModel(model)
}

async function handleSetup(model: string): Promise<void> {
  try {
    send('setup:status', { stage: 'checking', message: 'Checking system…' })
    await ensureMLXRunning(model)
    send('setup:status', { stage: 'ready', message: 'Ready to chat.' })
  } catch (e) {
    send('setup:status', {
      stage: 'error',
      message: 'Setup failed',
      error: (e as Error).message
    })
  }
}

const MAX_TOOL_ROUNDS_CHAT = 6
const MAX_TOOL_ROUNDS_CODE = 60
const TOOL_ROUND_GRACE_BUFFER = 2
const BUILD_TOOL_LIMIT_MESSAGE =
  'I reached the build tool limit and stopped cleanly with the current workspace saved. Send another message to continue from here.'
const DESIGN_GUARD_MUTATING_TOOLS = new Set(['write_file', 'edit_file', 'delete_file', 'run_bash'])

function isDesignGuardMutatingTool(name: string): boolean {
  return DESIGN_GUARD_MUTATING_TOOLS.has(name)
}

function actionTarget(_name: string, args: Record<string, unknown>): string | undefined {
  if (typeof args.path === 'string') return args.path
  if (typeof args.query === 'string') return String(args.query)
  if (typeof args.url === 'string') return String(args.url)
  if (typeof args.command === 'string')
    return String(args.command).slice(0, 80)
  return undefined
}

async function handleChat(req: ChatRequest, channel: string): Promise<void> {
  const abort = new AbortController()
  chatAbortControllers.set(req.conversationId, abort)

  const emit = (chunk: StreamChunk): void => send(channel, chunk)

  try {
    const baseMessages: MLXChatMessage[] = []
    let codeWorkspacePath: string | null = null
    const provider = req.provider ?? defaultProviderSelection(req.model)
    const isPiAi = provider.id === 'pi-ai'
    const designGuardEnabled = req.mode === 'code' && req.designGuardEnabled !== false
    if (provider.id === 'ollama') {
      await ensureOllamaRunning(provider.model)
    }

    if (req.mode === 'code') {
      const wsPath = await ensureWorkspace(req.conversationId)
      await cleanupLegacyWorkspaceDesign(req.conversationId)
      codeWorkspacePath = wsPath
      const href = previewUrl(req.conversationId)
      const designMarkdown = req.design
        ? await readDesignContext(req.conversationId, req.design)
        : null
      const designContext =
        req.design && designMarkdown ? { design: req.design, markdown: designMarkdown } : null
      baseMessages.push({
        role: 'system',
        content: isPiAi
          ? piAiCodeSystemPrompt(
              wsPath,
              href,
              designContext,
              designGuardEnabled,
              req.buildBrief
            )
          : codeSystemPrompt(
              wsPath,
              href,
              designContext,
              designGuardEnabled,
              req.buildBrief
            )
      })
    } else {
      baseMessages.push({
        role: 'system',
        content: isPiAi ? piAiChatSystemPrompt(req.enableTools) : chatSystemPrompt(req.enableTools)
      })
    }

    for (const m of req.messages) {
      baseMessages.push({ role: m.role as MLXChatMessage['role'], content: m.content })
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          if (tc.result != null) {
            baseMessages.push({
              role: 'tool',
              content: `Result of <action name="${tc.name}">: ${tc.result}`
            })
          }
        }
      }
    }

    const ctx: ToolContext = {
      conversationId: req.conversationId,
      onFileChange: () => send('workspace:changed', { conversationId: req.conversationId })
    }

    const useTools = req.mode === 'code' || req.enableTools
    const maxRounds = req.mode === 'code' ? MAX_TOOL_ROUNDS_CODE : MAX_TOOL_ROUNDS_CHAT
    const piAiApiKey = provider.id === 'pi-ai' ? await resolvePiAiApiKey(provider.config) : undefined
    let designGuardReport: DesignGuardReport | null = null
    let designGuardRepairRounds = 0
    let designGuardRepairMutations = 0
    let designGuardRepairActive = false
    let designGuardAutoRepairPaused = false

    const scanDesignGuard = async (): Promise<DesignGuardReport | null> => {
      if (!designGuardEnabled || !codeWorkspacePath) return null
      emit({
        type: 'activity',
        activity: { kind: 'tool', tool: 'design_guard_scan', target: 'workspace' }
      })
      try {
        designGuardReport = await scanWorkspaceDesignGuard(codeWorkspacePath)
      } catch (e) {
        designGuardReport = { findings: [], errors: [`workspace: ${(e as Error).message}`] }
      }
      return designGuardReport
    }

    const emitDesignGuardResult = (report: DesignGuardReport): void => {
      const call: ToolCall = {
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: 'design_guard_scan',
        args: { target: 'workspace' },
        running: true
      }
      emit({ type: 'tool_call', call })
      emit({
        type: 'activity',
        activity: { kind: 'tool', tool: 'design_guard_scan', target: 'workspace' }
      })
      emit({ type: 'tool_result', id: call.id, result: formatDesignGuardScanResult(report) })
    }

    const designGuardWarning = (report: DesignGuardReport, reason?: string): string =>
      designGuardFinalWarning(
        report,
        reason
          ? `Design guard warning: ${report.findings.length} design issue${report.findings.length === 1 ? '' : 's'} remained. ${reason}`
          : undefined
      )

    const pauseDesignGuardAutoRepair = (reason: string): void => {
      if (designGuardAutoRepairPaused) return
      designGuardAutoRepairPaused = true
      designGuardRepairActive = false
      designGuardRepairMutations = 0
      baseMessages.push({
        role: 'user',
        content: [
          `Design guard automatic cleanup is paused for the rest of this turn: ${reason}`,
          'Do not continue making design-only cleanup edits for the same findings.',
          'Continue the user-requested build normally, use preview if useful, and finish with a concise summary. Do not mention this internal pause unless the user asks.'
        ].join('\n')
      })
    }

    const queueDesignGuardRepair = (
      report: DesignGuardReport,
      remainingToolRounds: number
    ): 'queued' | 'clean' | 'paused' | 'attempt-limit' | 'round-budget' => {
      if (report.findings.length === 0) return 'clean'
      if (designGuardAutoRepairPaused) return 'paused'
      if (designGuardRepairRounds >= DESIGN_GUARD_MAX_REPAIR_ROUNDS) return 'attempt-limit'
      if (remainingToolRounds <= TOOL_ROUND_GRACE_BUFFER) return 'round-budget'
      designGuardRepairRounds++
      designGuardRepairMutations = 0
      designGuardRepairActive = true
      emitDesignGuardResult(report)
      baseMessages.push({
        role: 'user',
        content: designGuardRepairPrompt(report, designGuardRepairRounds)
      })
      emit({ type: 'activity', activity: { kind: 'thinking', chars: 0 } })
      return 'queued'
    }

    const designGuardRepairStopReason = (
      result: Exclude<ReturnType<typeof queueDesignGuardRepair>, 'queued' | 'clean' | 'paused'>
    ): string =>
      result === 'round-budget'
        ? 'Automatic design cleanup paused because the build tool budget is nearly exhausted.'
        : `Automatic design cleanup paused after ${DESIGN_GUARD_MAX_REPAIR_ROUNDS} repair attempts.`

    emit({ type: 'activity', activity: { kind: 'thinking', chars: 0 } })

    for (let round = 0; round < maxRounds; round++) {
      let buffer = ''
      let emittedIdx = 0
      let firstToken = true
      let executedAction = false
      let lastActivityTs = 0
      let pendingAction: { name: string; target?: string } | null = null

      // Live-write state for write_file streaming
      let livePath: string | null = null
      let liveContentStart = -1
      let lastLiveWrite = 0
      let livePending: Promise<unknown> | null = null
      let lastEmittedContent = ''
      const writeLivePartial = (): void => {
        if (!livePath || liveContentStart < 0 || livePending) return
        let partial = buffer.slice(liveContentStart)
        if (partial.startsWith('\n')) partial = partial.slice(1)
        const closeIdx = partial.indexOf('</content>')
        if (closeIdx >= 0) partial = partial.slice(0, closeIdx)
        const cleaned = cleanFileContent(partial, livePath)
        if (cleaned !== lastEmittedContent) {
          lastEmittedContent = cleaned
          send('file:streaming', {
            conversationId: req.conversationId,
            path: livePath,
            content: cleaned,
            done: false
          })
        }
        livePending = wsWriteFile(req.conversationId, livePath, cleaned)
          .then(() => {
            send('workspace:changed', { conversationId: req.conversationId })
          })
          .catch(() => {
            /* tolerate partial write failures */
          })
          .finally(() => {
            livePending = null
          })
      }

      const emitActivity = (): void => {
        const now = Date.now()
        if (now - lastActivityTs < 400) return
        lastActivityTs = now
        if (pendingAction) {
          emit({
            type: 'activity',
            activity: {
              kind: 'tool',
              tool: pendingAction.name,
              target: pendingAction.target,
              chars: buffer.length
            }
          })
        } else {
          emit({ type: 'activity', activity: { kind: 'generating', chars: buffer.length } })
        }
      }

      const chunks =
        provider.id === 'pi-ai'
          ? streamPiAi({
              conversationId: req.conversationId,
              config: provider.config,
              messages: baseMessages,
              apiKey: piAiApiKey,
              signal: abort.signal
            })
          : provider.id === 'ollama'
            ? streamLocalOllama({
                conversationId: req.conversationId,
                model: provider.model,
                messages: baseMessages,
                signal: abort.signal
              })
            : streamLocalMlx({
                conversationId: req.conversationId,
                model: provider.model,
                messages: baseMessages,
                signal: abort.signal
              })

      streamLoop: for await (const chunk of chunks) {
        if (chunk.content) {
          if (firstToken) {
            firstToken = false
            emit({ type: 'activity', activity: { kind: 'generating', chars: 0 } })
          }
          buffer += chunk.content

          // Forward raw token to devtools console for debugging
          mainWindow?.webContents.send('chat:raw', {
            conversationId: req.conversationId,
            chunk: chunk.content
          })

          // Detect if we've started an action (for activity label + live writes)
          if (!pendingAction) {
            const openMatch = buffer
              .slice(emittedIdx)
              .match(/<action\s+name\s*=\s*["']?([a-zA-Z_][\w]*)["']?\s*>/i)
            if (openMatch) {
              const name = openMatch[1]
              const rest = buffer.slice(emittedIdx + (openMatch.index ?? 0))
              const pathM = rest.match(/<path>([^<]+?)<\/path>/i)
              const urlM = rest.match(/<url>([^<]+?)<\/url>/i)
              const qM = rest.match(/<query>([^<]+?)<\/query>/i)
              const cmdM = rest.match(/<command>([^<\n]+)/i)
              pendingAction = {
                name,
                target: pathM?.[1] || urlM?.[1] || qM?.[1] || cmdM?.[1]
              }
            }
          } else if (!pendingAction.target) {
            const rest = buffer.slice(emittedIdx)
            const pathM = rest.match(/<path>([^<]+?)<\/path>/i)
            const urlM = rest.match(/<url>([^<]+?)<\/url>/i)
            const qM = rest.match(/<query>([^<]+?)<\/query>/i)
            const cmdM = rest.match(/<command>([^<\n]+)/i)
            const t = pathM?.[1] || urlM?.[1] || qM?.[1] || cmdM?.[1]
            if (t) pendingAction.target = t
          }

          // Live write_file streaming — create/update the file as <content> grows
          if (pendingAction?.name === 'write_file' && pendingAction.target && !livePath) {
            livePath = pendingAction.target
          }
          if (livePath && liveContentStart < 0) {
            const idx = buffer.indexOf('<content>')
            if (idx >= 0) liveContentStart = idx + '<content>'.length
          }
          if (livePath && liveContentStart >= 0) {
            const now = Date.now()
            if (now - lastLiveWrite > 450) {
              lastLiveWrite = now
              writeLivePartial()
            }
          }

          emitActivity()

          while (true) {
            if (!useTools) {
              // No tool parsing: stream tokens as they arrive
              if (emittedIdx < buffer.length) {
                emit({ type: 'token', text: buffer.slice(emittedIdx) })
                emittedIdx = buffer.length
              }
              break
            }

            const found = findNextAction(buffer, emittedIdx)

            if (found === null) {
              // No action starting in the remaining buffer: emit safe text
              const safe = emitSafeBoundary(buffer, emittedIdx)
              if (safe > emittedIdx) {
                emit({ type: 'token', text: buffer.slice(emittedIdx, safe) })
                emittedIdx = safe
              }
              break
            }

            if (found === 'incomplete') {
              // Action has started but not closed. Emit text up to the open tag.
              const openIdx = buffer.indexOf('<action', emittedIdx)
              if (openIdx > emittedIdx) {
                emit({ type: 'token', text: buffer.slice(emittedIdx, openIdx) })
                emittedIdx = openIdx
              }
              break
            }

            // Emit any text between last emit and action start
            if (found.start > emittedIdx) {
              emit({ type: 'token', text: buffer.slice(emittedIdx, found.start) })
            }
            emittedIdx = found.end

            const call: ToolCall = {
              id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              name: found.name,
              args: found.args,
              running: true
            }
            emit({ type: 'tool_call', call })
            emit({
              type: 'activity',
              activity: { kind: 'tool', tool: found.name, target: actionTarget(found.name, found.args) }
            })

            let result: string
            let hadError = false
            try {
              result = await runTool(found.name, found.args, ctx)
              emit({ type: 'tool_result', id: call.id, result })
            } catch (e) {
              result = `Error: ${(e as Error).message}`
              hadError = true
              emit({ type: 'tool_result', id: call.id, error: result })
            }

            baseMessages.push({ role: 'assistant', content: buffer.slice(0, emittedIdx) })
            baseMessages.push({
              role: 'tool',
              content: `[${hadError ? 'error' : 'ok'}] ${found.name}: ${result}`
            })
            executedAction = true
            const remainingToolRounds = maxRounds - round - 1
            if (livePath) {
              send('file:streaming', {
                conversationId: req.conversationId,
                path: livePath,
                content: lastEmittedContent,
                done: true
              })
            }
            if (designGuardEnabled && isDesignGuardMutatingTool(found.name)) {
              const report = await scanDesignGuard()
              if (designGuardRepairActive) {
                designGuardRepairMutations++
                if (report?.findings.length === 0) {
                  designGuardRepairActive = false
                  designGuardRepairMutations = 0
                } else if (
                  report &&
                  designGuardRepairMutations >= DESIGN_GUARD_MAX_MUTATIONS_PER_REPAIR
                ) {
                  pauseDesignGuardAutoRepair(
                    `Automatic design cleanup reached ${DESIGN_GUARD_MAX_MUTATIONS_PER_REPAIR} file-changing actions in one repair pass.`
                  )
                }
              }
            }
            if (designGuardEnabled && found.name === 'open_preview') {
              const report = designGuardReport ?? (await scanDesignGuard())
              if (report?.findings.length) {
                const repairQueued = queueDesignGuardRepair(report, remainingToolRounds)
                if (
                  repairQueued !== 'queued' &&
                  repairQueued !== 'clean' &&
                  repairQueued !== 'paused'
                ) {
                  pauseDesignGuardAutoRepair(designGuardRepairStopReason(repairQueued))
                }
              } else {
                designGuardRepairActive = false
                designGuardRepairMutations = 0
              }
            }
            pendingAction = null
            livePath = null
            liveContentStart = -1
            lastEmittedContent = ''
            emit({ type: 'activity', activity: { kind: 'thinking', chars: 0 } })
            // Break out of the current stream — we need to start a new
            // request with the updated conversation including the tool result.
            break streamLoop
          }
        }
        if (chunk.done) {
          break streamLoop
        }
      }

      if (!executedAction) {
        // In Build mode, if the model just described a plan without writing code,
        // nudge it to start coding immediately instead of ending the turn.
        if (req.mode === 'code' && round === 0 && buffer.trim().length > 0) {
          // Flush the plan text to the UI
          if (emittedIdx < buffer.length) {
            emit({ type: 'token', text: buffer.slice(emittedIdx) })
          }
          baseMessages.push({ role: 'assistant', content: buffer })
          baseMessages.push({
            role: 'user',
            content:
              'Good plan. Now start building — emit a write_file action with the first file immediately.'
          })
          emit({ type: 'activity', activity: { kind: 'thinking', chars: 0 } })
          continue // go to round 1
        }
        if (designGuardEnabled) {
          const report = designGuardReport ?? (await scanDesignGuard())
          if (report && report.findings.length > 0) {
            if (emittedIdx < buffer.length) {
              emit({ type: 'token', text: buffer.slice(emittedIdx) })
            }
            if (buffer.trim()) {
              baseMessages.push({ role: 'assistant', content: buffer })
            }
            const repairQueued = queueDesignGuardRepair(report, maxRounds - round - 1)
            if (repairQueued === 'queued') continue
            if (repairQueued !== 'clean' && repairQueued !== 'paused') {
              emit({
                type: 'token',
                text: `${buffer.trim() ? '\n\n' : ''}${designGuardWarning(
                  report,
                  designGuardRepairStopReason(repairQueued)
                )}`
              })
            }
          }
        }
        emit({ type: 'activity', activity: { kind: 'idle' } })
        emit({ type: 'done' })
        return
      }
    }
    emit({ type: 'activity', activity: { kind: 'idle' } })
    if (req.mode === 'code') {
      emit({ type: 'token', text: `\n\n${BUILD_TOOL_LIMIT_MESSAGE}` })
      emit({ type: 'done' })
      return
    }
    emit({
      type: 'error',
      error: `Reached max tool rounds (${maxRounds}). Ask the model to finish up and try again.`
    })
  } catch (e) {
    emit({ type: 'activity', activity: { kind: 'idle' } })
    if ((e as Error).name === 'AbortError') {
      emit({ type: 'done' })
    } else {
      emit({ type: 'error', error: (e as Error).message })
    }
  } finally {
    chatAbortControllers.delete(req.conversationId)
  }
}

const chatAbortControllers = new Map<string, AbortController>()
const oauthPromptResolvers = new Map<string, (value: string) => void>()

function oauthRequestId(): string {
  return `oauth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function providerRuntimeList() {
  return [
    {
      id: 'local-mlx' as const,
      label: 'Local MLX',
      description: 'Runs local Gemma models through the existing MLX runtime.'
    },
    {
      id: 'ollama' as const,
      label: 'Ollama',
      description: 'Connects to a locally running Ollama server.'
    },
    {
      id: 'pi-ai' as const,
      label: 'AI Provider',
      description: 'Routes cloud and compatible models through the provider runtime.'
    }
  ]
}

async function testPiAiProvider(config: PiAiProviderConfig): Promise<{ ok: true }> {
  resolvePiAiModel(config)
  const apiKey = await resolvePiAiApiKey(config)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const chunks = streamPiAi({
      conversationId: `test_${Date.now()}`,
      config,
      apiKey,
      signal: controller.signal,
      messages: [
        { role: 'system', content: 'Reply with OK.' },
        { role: 'user', content: 'OK' }
      ]
    })
    for await (const chunk of chunks) {
      if (chunk.content || chunk.done) break
    }
    return { ok: true }
  } finally {
    clearTimeout(timeout)
  }
}

const QUESTION_GENERATION_TIMEOUT_MS = 18000
const QUESTION_GENERATION_MAX_CHARS = 24000

async function generateBuildQuestionnaire(
  req: BuildQuestionnaireGenerationRequest
): Promise<BuildQuestionnaireGenerationResponse> {
  const provider = req.provider ?? defaultProviderSelection(req.model)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), QUESTION_GENERATION_TIMEOUT_MS)
  const messages: MLXChatMessage[] = [
    {
      role: 'system',
      content: [
        'You generate a short pre-build design questionnaire for a coding agent UI.',
        'Return only strict JSON. No markdown, no commentary.',
        'Generate exactly five questions customized to the user prompt. Do not use a generic template.',
        'Ask only design, product, UX, content, audience, visual style, interaction, or layout questions that materially improve the build.',
        'Do not ask about code frameworks, deployment, file names, or implementation details.',
        'Use the same language as the user prompt for every human-facing string.',
        'Each question must have kind "single" or "multiple", a stable kebab-case id, a concise title, 3 to 5 options, and optional otherLabel/otherPlaceholder.',
        'Each option must have a stable kebab-case id, a concise label, and a short description.',
        'The ui object should translate the provided UI copy into the prompt language.',
        'The focus field should be a short English slug describing the questionnaire focus, based on the prompt.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        userPrompt: req.prompt,
        requiredShape: {
          language: 'BCP-47 language code, for example en, sv, es, fr',
          focus: 'short English slug, for example landing-page-for-fintech-startup',
          ui: req.ui,
          questions: [
            {
              id: 'kebab-case-id',
              kind: 'single | multiple',
              title: 'Question title in the user prompt language',
              options: [
                {
                  id: 'kebab-case-option-id',
                  label: 'Option label in the user prompt language',
                  description: 'Option description in the user prompt language'
                }
              ],
              otherLabel: 'Other label in the user prompt language',
              otherPlaceholder: 'Other placeholder in the user prompt language'
            }
          ]
        }
      })
    }
  ]

  if (provider.id === 'ollama') {
    await ensureOllamaRunning(provider.model)
  }

  const piAiApiKey = provider.id === 'pi-ai' ? await resolvePiAiApiKey(provider.config) : undefined
  let text = ''
  try {
    const chunks =
      provider.id === 'pi-ai'
        ? streamPiAi({
            conversationId: `questionnaire_${Date.now()}`,
            config: provider.config,
            messages,
            apiKey: piAiApiKey,
            signal: controller.signal
          })
        : provider.id === 'ollama'
          ? streamLocalOllama({
              conversationId: `questionnaire_${Date.now()}`,
              model: provider.model,
              messages,
              signal: controller.signal
            })
          : streamLocalMlx({
              conversationId: `questionnaire_${Date.now()}`,
              model: provider.model,
              messages,
              signal: controller.signal
            })

    for await (const chunk of chunks) {
      if (chunk.content) {
        text += chunk.content
        if (text.length > QUESTION_GENERATION_MAX_CHARS) {
          throw new Error('Question generation response was too large.')
        }
      }
      if (chunk.done) break
    }
  } finally {
    clearTimeout(timeout)
  }

  const parsed = parseQuestionGenerationJson(text)
  const questions = validateGeneratedQuestions(parsed.questions)
  const ui = validateGeneratedUi(req.ui, parsed.ui)
  const language =
    typeof parsed.language === 'string' && parsed.language.trim()
      ? parsed.language.trim().slice(0, 24)
      : detectPromptLanguage(req.prompt)
  const focus = slugishString(parsed.focus, 'custom-build-questionnaire')

  return { language, focus, questions, ui }
}

function parseQuestionGenerationJson(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('Question generation did not return JSON.')
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
  }
}

function validateGeneratedQuestions(generated: unknown): BuildQuestion[] {
  if (!Array.isArray(generated)) throw new Error('Generated questions must be an array.')
  if (generated.length !== 5) throw new Error('Generated questionnaire must contain exactly five questions.')

  const questionIds = new Set<string>()
  return generated.map((candidate, index) => {
    if (!isObject(candidate)) throw new Error(`Question ${index + 1} is invalid.`)
    const id = kebabId(candidate.id, `question-${index + 1}`)
    if (questionIds.has(id)) throw new Error(`Duplicate question id: ${id}`)
    questionIds.add(id)
    const kind = candidate.kind === 'multiple' ? 'multiple' : candidate.kind === 'single' ? 'single' : null
    if (!kind) throw new Error(`Question ${id} has invalid kind.`)
    const options = validateGeneratedOptions(id, candidate.options)
    return {
      id,
      kind,
      title: nonEmptyString(candidate.title, `Question ${index + 1}`),
      options,
      otherLabel: optionalString(candidate.otherLabel, 'Other'),
      otherPlaceholder: optionalString(candidate.otherPlaceholder, 'Describe another direction')
    }
  })
}

function validateGeneratedOptions(
  questionId: string,
  generated: unknown
): BuildQuestion['options'] {
  if (!Array.isArray(generated)) throw new Error(`Options missing for ${questionId}.`)
  if (generated.length < 3 || generated.length > 5) {
    throw new Error(`Question ${questionId} must have 3 to 5 options.`)
  }
  const optionIds = new Set<string>()
  return generated.map((candidate, index) => {
    if (!isObject(candidate)) throw new Error(`Option ${index + 1} is invalid for ${questionId}.`)
    const id = kebabId(candidate.id, `option-${index + 1}`)
    if (optionIds.has(id)) throw new Error(`Duplicate option id: ${id}`)
    optionIds.add(id)
    return {
      id,
      label: nonEmptyString(candidate.label, `Option ${index + 1}`),
      description: optionalString(candidate.description)
    }
  })
}

function validateGeneratedUi(
  source: BuildQuestionnaireCopy,
  generated: unknown
): BuildQuestionnaireCopy {
  if (!isObject(generated)) return source
  return {
    title: nonEmptyString(generated.title, source.title),
    selectOne: nonEmptyString(generated.selectOne, source.selectOne),
    selectMultiple: nonEmptyString(generated.selectMultiple, source.selectMultiple),
    otherLabel: nonEmptyString(generated.otherLabel, source.otherLabel),
    otherPlaceholder: nonEmptyString(generated.otherPlaceholder, source.otherPlaceholder),
    previous: nonEmptyString(generated.previous, source.previous),
    next: nonEmptyString(generated.next, source.next),
    skipAll: nonEmptyString(generated.skipAll, source.skipAll),
    submit: nonEmptyString(generated.submit, source.submit),
    preparing: nonEmptyString(generated.preparing, source.preparing),
    errorNotice: nonEmptyString(generated.errorNotice, source.errorNotice)
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function optionalString(value: unknown, fallback?: string): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return fallback
}

function kebabId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function slugishString(value: unknown, fallback: string): string {
  return kebabId(value, fallback).slice(0, 80) || fallback
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.ammaar.vibechat')
  nativeTheme.themeSource = 'dark'

  // Set dock icon (macOS) so the Vibe Chat icon shows in dev mode.
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await startWorkspaceServer()

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem') {
      callback(true)
      return
    }
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler(() => true)

  ipcMain.handle('setup:start', async (_e, model: string) => {
    const config = await readProviderConfig()
    await writeProviderConfig({ ...config, selectedProvider: 'local-mlx', localModel: model })
    await handleSetup(model)
  })

  ipcMain.handle('model:switch', async (_e, model: string) => {
    const label = AVAILABLE_MODELS.find((m) => m.name === model)?.label ?? model
    send('setup:status', {
      stage: 'downloading-model',
      message: `Switching to ${label}…`
    })
    try {
      await stopServer()
      if (!mlxPython) {
        throw new Error('MLX Python path not available. Please restart the app.')
      }
      await startServer(mlxPython, model, (p) => {
        send('setup:status', {
          stage: 'downloading-model',
          message: p.message,
          progress: p.progress
        })
      })
      const config = await readProviderConfig()
      await writeProviderConfig({ ...config, selectedProvider: 'local-mlx', localModel: model })
      send('setup:status', { stage: 'ready', message: 'Ready to chat.' })
    } catch (e) {
      send('setup:status', {
        stage: 'error',
        message: 'Model switch failed',
        error: (e as Error).message
      })
    }
  })

  ipcMain.handle('setup:status', async () => {
    const mlx = locateMLX()
    const ollamaModels = await listOllamaModels()
    return {
      hasMLX: !!(mlx && mlx.installed),
      hasOllama: ollamaModels.length > 0
    }
  })

  ipcMain.handle('models:list-local', async () => {
    const [mlxModels, ollamaModels] = await Promise.all([
      listLocalModels(),
      listOllamaModels()
    ])
    return [
      ...mlxModels,
      ...ollamaModels.map((model) => `${OLLAMA_MODEL_PREFIX}${model}`)
    ]
  })

  ipcMain.handle('providers:list', async () => {
    return {
      providers: providerRuntimeList(),
      piAiProviders: listPiAiProviders()
    }
  })

  ipcMain.handle('providers:models:list', async (_e, providerId: string) => {
    return listPiAiModels(providerId)
  })

  ipcMain.handle('providers:config:get', async () => {
    return readProviderConfig()
  })

  ipcMain.handle('providers:config:save', async (_e, config: AppProviderConfig) => {
    return writeProviderConfig(config)
  })

  ipcMain.handle('designs:list', async () => {
    return listDesignCatalog()
  })

  ipcMain.handle('designs:custom:list', async () => {
    return listCustomDesigns()
  })

  ipcMain.handle(
    'designs:install',
    async (_e, { conversationId, slug }: { conversationId: string; slug: string }) => {
      const design = await installDesign(conversationId, slug)
      send('workspace:changed', { conversationId })
      return design
    }
  )

  ipcMain.handle(
    'designs:custom:install',
    async (_e, { conversationId, customId }: { conversationId: string; customId: string }) => {
      const design = await installCustomDesign(conversationId, customId)
      send('workspace:changed', { conversationId })
      return design
    }
  )

  ipcMain.handle(
    'designs:clear',
    async (_e, { conversationId, design }: { conversationId: string; design?: ConversationDesign }) => {
      const result = await clearInstalledDesign(conversationId, design)
      if (result.removed) send('workspace:changed', { conversationId })
      return result
    }
  )

  ipcMain.handle('designs:extract:start', async (_e, request: DesignExtractionRequest) => {
    return startDesignExtraction(request, (event) => {
      send('designs:extract:event', event)
      if (event.type === 'done') {
        send('workspace:changed', { conversationId: request.conversationId })
      }
    })
  })

  ipcMain.handle(
    'questionnaire:generate',
    async (_e, request: BuildQuestionnaireGenerationRequest) => {
      return generateBuildQuestionnaire(request)
    }
  )

  ipcMain.handle('designs:extract:cancel', async (_e, jobId: string) => {
    return { cancelled: cancelDesignExtraction(jobId) }
  })

  ipcMain.handle('providers:auth:getStatus', async (_e, config: PiAiProviderConfig) => {
    return getPiAiAuthStatus(config)
  })

  ipcMain.handle(
    'providers:auth:setApiKey',
    async (_e, { config, apiKey }: { config: PiAiProviderConfig; apiKey: string }) => {
      return setPiAiApiKey(config, apiKey)
    }
  )

  ipcMain.handle('providers:auth:clear', async (_e, config: PiAiProviderConfig) => {
    return clearPiAiCredentials(config)
  })

  ipcMain.handle('providers:auth:refresh', async (_e, config: PiAiProviderConfig) => {
    return refreshPiAiOAuth(config)
  })

  ipcMain.handle('providers:auth:test', async (_e, config: PiAiProviderConfig) => {
    return testPiAiProvider(config)
  })

  ipcMain.handle(
    'providers:auth:promptResponse',
    async (_e, { promptId, value }: { promptId: string; value: string }) => {
      const resolve = oauthPromptResolvers.get(promptId)
      if (resolve) {
        oauthPromptResolvers.delete(promptId)
        resolve(value)
      }
    }
  )

  ipcMain.handle('providers:auth:openExternal', async (_e, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle('providers:auth:loginOAuth', async (_e, config: PiAiProviderConfig) => {
    const requestId = oauthRequestId()
    const promptRenderer = (message: string, placeholder?: string, allowEmpty?: boolean): Promise<string> =>
      new Promise((resolve) => {
        const promptId = oauthRequestId()
        oauthPromptResolvers.set(promptId, resolve)
        send('providers:auth:event', {
          type: 'prompt',
          requestId,
          promptId,
          message,
          placeholder,
          allowEmpty
        })
      })

    try {
      const status = await loginPiAiOAuth(config, {
        onAuth: (info) => {
          send('providers:auth:event', {
            type: 'auth',
            requestId,
            url: info.url,
            instructions: info.instructions
          })
        },
        onPrompt: (prompt) => {
          const safePrompt = coerceOAuthPrompt(prompt)
          return promptRenderer(
            safePrompt.message,
            safePrompt.placeholder,
            safePrompt.allowEmpty
          )
        },
        onProgress: (message) => {
          send('providers:auth:event', { type: 'progress', requestId, message })
        },
        onManualCodeInput: () => promptRenderer('Paste the OAuth authorization code.', 'Code')
      })
      send('providers:auth:event', { type: 'complete', requestId, status })
      return status
    } catch (e) {
      send('providers:auth:event', {
        type: 'error',
        requestId,
        error: (e as Error).message
      })
      throw e
    }
  })

  ipcMain.handle('chat:send', async (_e, req: ChatRequest) => {
    const channel = `chat:stream:${req.conversationId}`
    handleChat(req, channel).catch((err) => console.error('chat handler error', err))
    return { channel }
  })

  ipcMain.handle('chat:abort', async (_e, conversationId: string) => {
    const c = chatAbortControllers.get(conversationId)
    if (c) c.abort()
  })

  ipcMain.handle('tools:list', async () => {
    return Object.values(TOOLS).map((t) => ({
      name: t.name,
      description: t.description,
      mode: t.mode
    }))
  })

  ipcMain.handle('workspace:info', async (_e, conversationId: string) => {
    await ensureWorkspace(conversationId)
    await cleanupLegacyWorkspaceDesign(conversationId)
    return {
      conversationId,
      path: workspaceDir(conversationId),
      previewUrl: previewUrl(conversationId)
    }
  })

  ipcMain.handle('workspace:list', async (_e, conversationId: string) => {
    const base = await ensureWorkspace(conversationId)
    await cleanupLegacyWorkspaceDesign(conversationId)
    return listTree(base, 300)
  })

  ipcMain.handle('workspace:open-external', async (_e, conversationId: string) => {
    await ensureWorkspace(conversationId)
    await cleanupLegacyWorkspaceDesign(conversationId)
    shell.openPath(workspaceDir(conversationId))
  })

  ipcMain.handle(
    'workspace:open-preview-external',
    async (_e, { conversationId, path }: { conversationId: string; path?: string }) => {
      await ensureWorkspace(conversationId)
      await cleanupLegacyWorkspaceDesign(conversationId)

      const preview = new URL(previewUrl(conversationId))
      const cleanPath = path?.replace(/^\/+/, '')
      if (cleanPath) {
        assertInWorkspace(workspaceDir(conversationId), cleanPath)
        preview.pathname += cleanPath.split('/').map(encodeURIComponent).join('/')
      }

      await shell.openExternal(preview.toString())
    }
  )

  ipcMain.handle('workspace:server-port', async () => getWorkspaceServerPort())

  ipcMain.handle(
    'audio:transcribe',
    async (_e, { base64: _base64, model: _model }: { base64: string; model: string }) => {
      // Audio transcription via MLX is not yet supported
      // Return empty text so the UI doesn't break
      return { text: '' }
    }
  )

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // On macOS, keep the app alive in the dock so reopening is instant and the
  // MLX subprocess + workspace server stay warm. Only non-darwin platforms
  // quit on last-window-close.
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopServer()
  stopWorkspaceServer()
})
