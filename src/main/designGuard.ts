import { readFile } from 'fs/promises'
import { extname, relative } from 'path'
import {
  SCANNABLE_EXTENSIONS,
  detectHtml,
  detectText,
  walkDir,
  type ImpeccableFinding
} from 'impeccable'

export const DESIGN_GUARD_MAX_REPAIR_ROUNDS = 3
export const DESIGN_GUARD_MAX_MUTATIONS_PER_REPAIR = 3

const HTML_EXTENSIONS = new Set(['.html', '.htm'])
const MAX_PROMPT_FINDINGS = 12

export interface DesignGuardFinding {
  antipattern: string
  name: string
  description: string
  path: string
  line?: number
  snippet: string
  importedBy?: string[]
}

export interface DesignGuardReport {
  findings: DesignGuardFinding[]
  errors: string[]
}

export async function scanWorkspaceDesignGuard(workspacePath: string): Promise<DesignGuardReport> {
  const findings: DesignGuardFinding[] = []
  const errors: string[] = []
  const files = walkDir(workspacePath).filter((file) =>
    SCANNABLE_EXTENSIONS.has(extname(file).toLowerCase())
  )

  for (const file of files) {
    try {
      const rawFindings = await scanFile(file)
      findings.push(...rawFindings.map((finding) => normalizeFinding(finding, workspacePath)))
    } catch (e) {
      errors.push(`${normalizePath(relative(workspacePath, file))}: ${(e as Error).message}`)
    }
  }

  return {
    findings: dedupeFindings(findings).sort(compareFindings),
    errors
  }
}

export function designGuardRepairPrompt(
  report: DesignGuardReport,
  attempt: number,
  maxAttempts = DESIGN_GUARD_MAX_REPAIR_ROUNDS,
  mutationLimit = DESIGN_GUARD_MAX_MUTATIONS_PER_REPAIR
): string {
  return [
    `Design guard scan found ${report.findings.length} design issue${report.findings.length === 1 ? '' : 's'} in the generated workspace. Repair attempt ${attempt}/${maxAttempts}.`,
    'Revise the UI now using write_file or edit_file actions. Preserve the requested functionality, content, and any explicit user visual choices.',
    `Group related fixes together: prefer one write_file per affected file over many tiny edit_file actions. You have at most ${mutationLimit} file-changing actions for this repair pass before automatic design cleanup pauses.`,
    'Do not summarize yet. Remove the listed design issues unless the user explicitly required them.',
    '',
    formatDesignGuardFindings(report)
  ].join('\n')
}

export function formatDesignGuardScanResult(report: DesignGuardReport): string {
  if (report.findings.length === 0) {
    return report.errors.length
      ? `Design guard found no design issues, but ${report.errors.length} file scan failed.`
      : 'Design guard found no design issues.'
  }

  return formatDesignGuardFindings(report)
}

export function designGuardFinalWarning(report: DesignGuardReport, reason?: string): string {
  return [
    reason ??
      `Design guard warning: ${report.findings.length} design issue${report.findings.length === 1 ? '' : 's'} remained after ${DESIGN_GUARD_MAX_REPAIR_ROUNDS} repair attempts.`,
    formatDesignGuardFindings(report, 6)
  ].join('\n')
}

async function scanFile(file: string): Promise<ImpeccableFinding[]> {
  const ext = extname(file).toLowerCase()
  if (HTML_EXTENSIONS.has(ext)) {
    return detectHtml(file)
  }

  return detectText(await readFile(file, 'utf-8'), file)
}

function normalizeFinding(
  finding: ImpeccableFinding,
  workspacePath: string
): DesignGuardFinding {
  return {
    antipattern: finding.antipattern,
    name: finding.name,
    description: finding.description,
    path: normalizePath(relative(workspacePath, finding.file)),
    line: finding.line && finding.line > 0 ? finding.line : undefined,
    snippet: finding.snippet,
    importedBy: finding.importedBy?.map(normalizePath)
  }
}

function dedupeFindings(findings: DesignGuardFinding[]): DesignGuardFinding[] {
  const seen = new Set<string>()
  const deduped: DesignGuardFinding[] = []

  for (const finding of findings) {
    const key = [
      finding.path,
      finding.line ?? 0,
      finding.antipattern,
      finding.snippet
    ].join('\u0000')
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(finding)
  }

  return deduped
}

function compareFindings(a: DesignGuardFinding, b: DesignGuardFinding): number {
  const byPath = a.path.localeCompare(b.path)
  if (byPath !== 0) return byPath
  return (a.line ?? 0) - (b.line ?? 0)
}

function formatDesignGuardFindings(
  report: DesignGuardReport,
  maxFindings = MAX_PROMPT_FINDINGS
): string {
  const lines = report.findings.slice(0, maxFindings).map((finding) => {
    const location = finding.line ? `${finding.path}:${finding.line}` : finding.path
    return `- ${location} [${finding.name}] ${finding.snippet} — ${finding.description}`
  })

  const remaining = report.findings.length - lines.length
  if (remaining > 0) {
    lines.push(`- ...and ${remaining} more finding${remaining === 1 ? '' : 's'}.`)
  }

  if (report.errors.length > 0) {
    lines.push(`Scan errors: ${report.errors.slice(0, 3).join('; ')}`)
  }

  return lines.join('\n')
}

function normalizePath(path: string): string {
  return path.split('\\').join('/')
}
