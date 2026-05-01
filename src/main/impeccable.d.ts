declare module 'impeccable' {
  export interface ImpeccableFinding {
    antipattern: string
    name: string
    description: string
    file: string
    line?: number
    snippet: string
    importedBy?: string[]
  }

  export const SCANNABLE_EXTENSIONS: Set<string>
  export function walkDir(dir: string): string[]
  export function detectHtml(filePath: string): Promise<ImpeccableFinding[]>
  export function detectText(content: string, filePath: string): ImpeccableFinding[]
}
