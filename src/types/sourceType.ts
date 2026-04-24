export type SourceType = 'pdf' | 'txt' | 'md'

export const VALID_SOURCE_TYPES: SourceType[] = ['pdf', 'txt', 'md']

export function isValidSourceType(value: string): value is SourceType {
  return (VALID_SOURCE_TYPES as string[]).includes(value)
}

export function getSourceTypeDisplayName(type: SourceType): string {
  const displayNames: Record<SourceType, string> = {
    pdf: 'PDF',
    txt: 'TXT',
    md: 'Markdown',
  }
  return displayNames[type]
}

export function inferSourceType(path: string): SourceType {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.txt') return 'txt'
  if (['.md', '.markdown'].includes(ext)) return 'md'
  return 'txt'
}
