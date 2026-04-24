import { useState, useEffect, useCallback, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import * as databaseService from '../services/databaseService'
import { RxCross2, RxChevronLeft, RxChevronRight } from 'react-icons/rx'

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

type ReadMode = 'paginated' | 'scroll'
type ThemeMode = 'dark' | 'light' | 'sepia'

interface ThemeColors {
  bg: string
  text: string
  secondary: string
  panel: string
  border: string
  codeBg: string
  quoteBorder: string
  linkColor: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THEMES: Record<ThemeMode, ThemeColors> = {
  dark: {
    bg: '#1A1A1A',
    text: '#E0E0E0',
    secondary: '#909090',
    panel: '#212121',
    border: '#363636',
    codeBg: '#2A2A2A',
    quoteBorder: '#555555',
    linkColor: '#CBE93A',
  },
  light: {
    bg: '#FFFFFF',
    text: '#1A1A1A',
    secondary: '#666666',
    panel: '#F5F5F5',
    border: '#E0E0E0',
    codeBg: '#F0F0F0',
    quoteBorder: '#CCCCCC',
    linkColor: '#6B8E23',
  },
  sepia: {
    bg: '#F4ECD8',
    text: '#5B4636',
    secondary: '#8B7355',
    panel: '#EDE4D0',
    border: '#D4C5A9',
    codeBg: '#EDE4D0',
    quoteBorder: '#C4B59A',
    linkColor: '#6B8E23',
  },
}

const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 36
const FONT_SIZE_STEP = 2
const LINE_HEIGHT_MIN = 1.2
const LINE_HEIGHT_MAX = 3.0
const LINE_HEIGHT_STEP = 0.2

/** Base characters per page for TXT at font-size 18px */
const CHARS_PER_PAGE_BASE = 1200

// ---------------------------------------------------------------------------
// Helper: split plain text into page-sized chunks
// ---------------------------------------------------------------------------

function splitTextIntoPages(text: string, charsPerPage: number): string[] {
  if (!text) return ['']
  const pages: string[] = []
  let pos = 0
  while (pos < text.length) {
    let end = Math.min(pos + charsPerPage, text.length)
    // Try to break at a newline or space to avoid mid-word splits
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n', end)
      const lastSpace = text.lastIndexOf(' ', end)
      if (lastNewline > pos + charsPerPage * 0.5) {
        end = lastNewline + 1
      } else if (lastSpace > pos + charsPerPage * 0.5) {
        end = lastSpace + 1
      }
    }
    pages.push(text.substring(pos, end))
    pos = end
  }
  return pages.length > 0 ? pages : ['']
}

// ---------------------------------------------------------------------------
// Inline CSS for rendered Markdown content (scoped via .novel-md-content)
// ---------------------------------------------------------------------------

const MD_CONTENT_STYLES = `
.novel-md-content h1 { font-size: 1.8em; font-weight: 700; margin: 0.8em 0 0.4em; line-height: 1.3; }
.novel-md-content h2 { font-size: 1.5em; font-weight: 700; margin: 0.7em 0 0.35em; line-height: 1.3; }
.novel-md-content h3 { font-size: 1.25em; font-weight: 600; margin: 0.6em 0 0.3em; line-height: 1.3; }
.novel-md-content h4 { font-size: 1.1em; font-weight: 600; margin: 0.5em 0 0.25em; line-height: 1.3; }
.novel-md-content h5, .novel-md-content h6 { font-size: 1em; font-weight: 600; margin: 0.4em 0 0.2em; }
.novel-md-content p { margin: 0 0 0.8em; }
.novel-md-content ul, .novel-md-content ol { margin: 0 0 0.8em; padding-left: 1.8em; }
.novel-md-content li { margin-bottom: 0.25em; }
.novel-md-content blockquote {
  margin: 0 0 0.8em;
  padding: 0.4em 1em;
  border-left: 3px solid var(--md-quote-border);
  opacity: 0.9;
}
.novel-md-content pre {
  margin: 0 0 0.8em;
  padding: 0.8em 1em;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.88em;
  line-height: 1.5;
  background: var(--md-code-bg);
}
.novel-md-content code {
  font-size: 0.88em;
  padding: 0.15em 0.35em;
  border-radius: 3px;
  background: var(--md-code-bg);
}
.novel-md-content pre code { padding: 0; background: none; }
.novel-md-content a { color: var(--md-link); text-decoration: underline; }
.novel-md-content hr { border: none; border-top: 1px solid var(--md-border); margin: 1.2em 0; }
.novel-md-content table { border-collapse: collapse; margin: 0 0 0.8em; width: 100%; }
.novel-md-content th, .novel-md-content td { border: 1px solid var(--md-border); padding: 0.4em 0.6em; text-align: left; }
.novel-md-content th { font-weight: 600; }
.novel-md-content img { display: none; }
.novel-md-content strong { font-weight: 700; }
.novel-md-content em { font-style: italic; }
`

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ReaderView() {
  // ---- Book identity ----
  const [bookId, setBookId] = useState<number | null>(null)
  const [bookTitle, setBookTitle] = useState('')
  const [_bookPath, setBookPath] = useState('')
  const [sourceType, setSourceType] = useState<'pdf' | 'txt' | 'md'>('txt')

  // ---- Loading & error ----
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ---- Reading settings ----
  const [readMode, setReadMode] = useState<ReadMode>('paginated')
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [fontSize, setFontSize] = useState(18)
  const [lineHeight, setLineHeight] = useState(1.8)

  // ---- Content data ----
  const [pdfPages, setPdfPages] = useState<databaseService.PdfTextPage[]>([])
  const [txtText, setTxtText] = useState('')
  const [txtChapters, setTxtChapters] = useState<databaseService.TxtChapter[]>([])
  const [mdHtml, setMdHtml] = useState('')
  const [mdChapters, setMdChapters] = useState<databaseService.MdChapter[]>([])

  // ---- Navigation ----
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [currentChapter, setCurrentChapter] = useState<number | null>(null)

  // ---- UI state ----
  const [notification, setNotification] = useState<string | null>(null)
  const notificationTimerRef = useRef<number | null>(null)
  const [showChapterPanel, setShowChapterPanel] = useState(false)
  const [scrollPercentage, setScrollPercentage] = useState(0)

  // ---- Refs ----
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const initialLoadRef = useRef(false)

  // ---- Derived: TXT pages ----
  const charsPerPage = Math.round(CHARS_PER_PAGE_BASE * (18 / fontSize))
  const txtPages = splitTextIntoPages(txtText, charsPerPage)

  // ---- Derived: effective total pages ----
  const effectiveTotalPages = totalPages

  // =========================================================================
  // Notification helper
  // =========================================================================

  const showNotification = useCallback((message: string) => {
    setNotification(message)
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current)
    notificationTimerRef.current = window.setTimeout(() => setNotification(null), 2000)
  }, [])

  // =========================================================================
  // Content loading
  // =========================================================================

  const loadContent = useCallback(async (path: string, type: 'pdf' | 'txt' | 'md') => {
    setIsLoading(true)
    setError(null)
    try {
      if (type === 'pdf') {
        const result = await databaseService.extractPdfText(path)
        setPdfPages(result.pages)
        setTotalPages(result.total_pages || result.pages.length)
      } else if (type === 'txt') {
        const result = await databaseService.parseTxtFile(path)
        setTxtText(result.text)
        setTxtChapters(result.chapters)
      } else if (type === 'md') {
        const result = await databaseService.parseMdFile(path)
        setMdHtml(result.html_content)
        setMdChapters(result.chapters)
      }
      setCurrentPage(1)
      setCurrentChapter(null)
    } catch (err) {
      console.error('Failed to load content:', err)
      setError('Failed to load file content')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // =========================================================================
  // Initialise from window hash
  // =========================================================================

  useEffect(() => {
    const hash = window.location.hash
    let title = ''
    let path = ''
    let type: 'pdf' | 'txt' | 'md' = 'txt'

    if (hash.startsWith('#reader#')) {
      const parts = hash.replace('#reader#', '').split('#')
      // parts[0] = id
      title = parts[1] ? decodeURIComponent(parts[1]) : ''
      path = parts[2] ? decodeURIComponent(parts[2]) : ''
      type = (parts[3] || 'txt') as 'pdf' | 'txt' | 'md'
    }

    setBookTitle(title || 'Unknown Book')
    setBookPath(path)
    setSourceType(type)

    if (path && !initialLoadRef.current) {
      initialLoadRef.current = true
      loadContent(path, type)

      databaseService.getBookByPath(path).then(book => {
        if (book && book.id) setBookId(book.id)
      }).catch(err => console.error('Failed to get book ID:', err))
    }
  }, [loadContent])

  // =========================================================================
  // Recalculate total pages when content or settings change
  // =========================================================================

  useEffect(() => {
    if (sourceType === 'pdf') {
      setTotalPages(pdfPages.length)
    } else if (sourceType === 'txt') {
      setTotalPages(txtPages.length)
    }
    // MD total pages are calculated after render (see below)
  }, [sourceType, pdfPages.length, txtPages.length])

  // =========================================================================
  // MD paginated mode: measure content height and compute total pages
  // =========================================================================

  useEffect(() => {
    if (sourceType !== 'md') return
    if (readMode !== 'paginated') return
    if (!contentRef.current) return

    const measure = () => {
      const container = contentRef.current
      if (!container) return
      const contentHeight = container.scrollHeight
      const viewportHeight = container.clientHeight
      if (viewportHeight > 0 && contentHeight > 0) {
        const pages = Math.max(1, Math.ceil(contentHeight / viewportHeight))
        setTotalPages(pages)
      }
    }

    // Delay to allow rendering to complete
    const timer = setTimeout(measure, 150)

    // Also observe resize
    const observer = new ResizeObserver(() => {
      measure()
    })
    observer.observe(contentRef.current)

    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [sourceType, readMode, mdHtml, fontSize, lineHeight])

  // =========================================================================
  // Clamp currentPage when totalPages changes
  // =========================================================================

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [totalPages, currentPage])

  // =========================================================================
  // MD paginated: scroll content container when page changes
  // =========================================================================

  useEffect(() => {
    if (sourceType !== 'md' || readMode !== 'paginated') return
    const container = contentRef.current
    if (!container) return
    const viewportHeight = container.clientHeight
    if (viewportHeight > 0) {
      container.scrollTop = (currentPage - 1) * viewportHeight
    }
  }, [sourceType, readMode, currentPage])

  // =========================================================================
  // Navigation
  // =========================================================================

  const goToPage = useCallback((page: number) => {
    const target = Math.max(1, Math.min(effectiveTotalPages, page))
    setCurrentPage(target)
  }, [effectiveTotalPages])

  const goPrev = useCallback(() => {
    setCurrentPage(prev => Math.max(1, prev - 1))
  }, [])

  const goNext = useCallback(() => {
    setCurrentPage(prev => Math.min(effectiveTotalPages, prev + 1))
  }, [effectiveTotalPages])

  // =========================================================================
  // Keyboard navigation
  // =========================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault()
        goNext()
      } else if (e.key === 'Home') {
        e.preventDefault()
        goToPage(1)
      } else if (e.key === 'End') {
        e.preventDefault()
        goToPage(effectiveTotalPages)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goPrev, goNext, goToPage, effectiveTotalPages])

  // =========================================================================
  // Wheel navigation (paginated mode only)
  // =========================================================================

  useEffect(() => {
    if (readMode !== 'paginated') return
    let wheelTimer: number | null = null
    const WHEEL_THROTTLE_MS = 300

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (wheelTimer) return
      wheelTimer = window.setTimeout(() => { wheelTimer = null }, WHEEL_THROTTLE_MS)
      if (e.deltaY > 0) goNext()
      else if (e.deltaY < 0) goPrev()
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', handleWheel)
      if (wheelTimer) clearTimeout(wheelTimer)
    }
  }, [readMode, goNext, goPrev])

  // =========================================================================
  // Scroll mode: track scroll percentage
  // =========================================================================

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    const maxScroll = scrollHeight - clientHeight
    const percentage = maxScroll > 0 ? Math.round((scrollTop / maxScroll) * 100) : 0
    setScrollPercentage(percentage)
  }, [])

  // =========================================================================
  // Progress: save / restore
  // =========================================================================

  const handleSaveProgress = useCallback(async () => {
    if (!bookId) {
      showNotification('Cannot save: book ID not found')
      return
    }
    try {
      await databaseService.saveReadingProgress(
        bookId,
        currentPage,
        effectiveTotalPages,
        currentChapter ?? undefined,
      )
      showNotification(`Progress saved: Page ${currentPage}`)
    } catch (err) {
      showNotification('Failed to save progress')
      console.error('Save progress error:', err)
    }
  }, [bookId, currentPage, effectiveTotalPages, currentChapter, showNotification])

  const handleRestoreProgress = useCallback(async () => {
    if (!bookId) {
      showNotification('Cannot restore: book ID not found')
      return
    }
    try {
      const progress = await databaseService.getReadingProgress(bookId)
      if (progress && progress.current_page > 1) {
        goToPage(progress.current_page)
        showNotification(`Restored to page ${progress.current_page}`)
      } else {
        showNotification('No saved progress found')
      }
    } catch (err) {
      showNotification('Failed to restore progress')
      console.error('Restore progress error:', err)
    }
  }, [bookId, goToPage, showNotification])

  // =========================================================================
  // Chapter navigation
  // =========================================================================

  const goToChapter = useCallback((chapterNumber: number) => {
    setCurrentChapter(chapterNumber)

    if (sourceType === 'txt') {
      const chapter = txtChapters.find(c => c.chapter_number === chapterNumber)
      if (chapter) {
        // Find which TXT page contains the chapter start offset
        let offset = 0
        for (let i = 0; i < txtPages.length; i++) {
          if (offset + txtPages[i].length > chapter.start_offset) {
            goToPage(i + 1)
            break
          }
          offset += txtPages[i].length
        }
      }
    } else if (sourceType === 'md') {
      // Find the heading element in the DOM matching the chapter title
      const chapter = mdChapters.find(c => c.chapter_number === chapterNumber)
      if (!chapter) return

      const headings = (readMode === 'scroll' ? scrollContainerRef.current : contentRef.current)
        ?.querySelectorAll('h1, h2, h3, h4, h5, h6')
      if (!headings) return

      const targetElement = Array.from(headings).find(
        el => el.textContent?.trim() === chapter.title,
      )
      if (!targetElement) return

      if (readMode === 'scroll') {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        // Paginated: calculate which page the heading is on
        const container = contentRef.current
        if (container) {
          const containerRect = container.getBoundingClientRect()
          const elementRect = targetElement.getBoundingClientRect()
          const relativeTop = elementRect.top - containerRect.top + container.scrollTop
          const viewportHeight = container.clientHeight
          const targetPage = Math.floor(relativeTop / viewportHeight) + 1
          goToPage(targetPage)
        }
      }
    }

    setShowChapterPanel(false)
  }, [sourceType, txtChapters, txtPages, mdChapters, readMode, goToPage])

  // =========================================================================
  // Close window (auto-save progress)
  // =========================================================================

  const handleClose = useCallback(async () => {
    try {
      if (bookId && effectiveTotalPages > 0) {
        await databaseService.saveReadingProgress(
          bookId,
          currentPage,
          effectiveTotalPages,
          currentChapter ?? undefined,
        )
      }
      const currentWindow = getCurrentWindow()
      await currentWindow.close()
    } catch (err) {
      console.error('Close window error:', err)
    }
  }, [bookId, currentPage, effectiveTotalPages, currentChapter])

  // =========================================================================
  // Cleanup on unmount
  // =========================================================================

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current)
    }
  }, [])

  // =========================================================================
  // Derived content for current page
  // =========================================================================

  const currentPdfPageText = sourceType === 'pdf' && pdfPages.length > 0
    ? (pdfPages.find(p => p.page_number === currentPage)?.text
      || pdfPages[currentPage - 1]?.text
      || '')
    : ''

  const currentTxtPageText = sourceType === 'txt' && txtPages.length > 0
    ? txtPages[Math.min(currentPage - 1, txtPages.length - 1)] || ''
    : ''

  const chapters = sourceType === 'txt'
    ? txtChapters
    : sourceType === 'md'
      ? mdChapters
      : []

  const themeColors = THEMES[theme]

  // =========================================================================
  // Render: content area
  // =========================================================================

  const renderContent = () => {
    const contentStyle: React.CSSProperties = {
      fontSize: `${fontSize}px`,
      lineHeight: lineHeight,
      color: themeColors.text,
    }

    if (isLoading) {
      return (
        <div
          className="flex-1 flex items-center justify-center"
          style={{ backgroundColor: themeColors.bg }}
        >
          <p style={{ color: themeColors.secondary }}>Loading...</p>
        </div>
      )
    }

    if (error) {
      return (
        <div
          className="flex-1 flex items-center justify-center"
          style={{ backgroundColor: themeColors.bg }}
        >
          <p style={{ color: '#E05050' }}>{error}</p>
        </div>
      )
    }

    // ---- Scroll mode ----
    if (readMode === 'scroll') {
      return (
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto"
          style={{ backgroundColor: themeColors.bg }}
          onScroll={handleScroll}
        >
          <div
            className="mx-auto"
            style={{
              maxWidth: '800px',
              padding: '32px 40px',
              ...contentStyle,
            }}
          >
            {sourceType === 'pdf' && pdfPages.map(page => (
              <div key={page.page_number} style={{ marginBottom: '2em' }}>
                <div style={{
                  color: themeColors.secondary,
                  fontSize: '12px',
                  marginBottom: '8px',
                  textAlign: 'center',
                  opacity: 0.6,
                }}>
                  — Page {page.page_number} —
                </div>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {page.text || '(No text on this page)'}
                </div>
              </div>
            ))}

            {sourceType === 'txt' && (
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {txtText}
              </div>
            )}

            {sourceType === 'md' && (
              <div
                className="novel-md-content"
                style={{
                  '--md-code-bg': themeColors.codeBg,
                  '--md-quote-border': themeColors.quoteBorder,
                  '--md-link': themeColors.linkColor,
                  '--md-border': themeColors.border,
                } as React.CSSProperties}
                dangerouslySetInnerHTML={{ __html: mdHtml }}
              />
            )}
          </div>

          {/* Scroll-to-top button */}
          <button
            onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-12 right-8 w-10 h-10 bg-accent text-accent-text rounded-full shadow-lg flex items-center justify-center hover:bg-accent-hover transition-colors text-lg font-bold"
            title="Scroll to top"
          >
            ↑
          </button>
        </div>
      )
    }

    // ---- Paginated mode ----
    return (
      <div
        className="flex-1 flex items-center justify-center relative group"
        style={{ backgroundColor: themeColors.bg }}
      >
        <div
          ref={contentRef}
          className="overflow-hidden"
          style={{
            maxWidth: '800px',
            width: '100%',
            height: '100%',
            padding: '32px 40px',
            ...contentStyle,
            overflowY: sourceType === 'md' ? 'hidden' : undefined,
          }}
        >
          {sourceType === 'pdf' && (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {currentPdfPageText || '(No text on this page)'}
            </div>
          )}

          {sourceType === 'txt' && (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {currentTxtPageText || '(Empty page)'}
            </div>
          )}

          {sourceType === 'md' && (
            <div
              className="novel-md-content"
              style={{
                '--md-code-bg': themeColors.codeBg,
                '--md-quote-border': themeColors.quoteBorder,
                '--md-link': themeColors.linkColor,
                '--md-border': themeColors.border,
              } as React.CSSProperties}
              dangerouslySetInnerHTML={{ __html: mdHtml }}
            />
          )}
        </div>

        {/* Previous page button */}
        <button
          onClick={goPrev}
          disabled={currentPage <= 1}
          className="fixed left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-bg-panel/80 hover:bg-bg-panel text-text-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 z-10"
          title="Previous page"
          aria-label="Previous page"
        >
          <RxChevronLeft className="w-6 h-6" />
        </button>

        {/* Next page button */}
        <button
          onClick={goNext}
          disabled={currentPage >= effectiveTotalPages}
          className="fixed right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-bg-panel/80 hover:bg-bg-panel text-text-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 z-10"
          title="Next page"
          aria-label="Next page"
        >
          <RxChevronRight className="w-6 h-6" />
        </button>
      </div>
    )
  }

  // =========================================================================
  // Main render
  // =========================================================================

  return (
    <div className="h-full w-full bg-bg-main flex flex-col overflow-hidden">
      {/* Inject MD content styles */}
      <style>{MD_CONTENT_STYLES}</style>

      {/* ---- Top toolbar ---- */}
      <div
        className="flex items-center justify-between px-3 bg-bg-panel border-b border-border-1 flex-shrink-0"
        style={{ height: '40px' }}
      >
        {/* Left: title + notification */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-text-primary text-sm font-medium truncate">{bookTitle}</span>
          {notification && (
            <span className="text-sm font-medium flex-shrink-0" style={{ color: '#CBE93A' }}>
              {notification}
            </span>
          )}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Read mode toggle */}
          <button
            onClick={() => setReadMode(readMode === 'paginated' ? 'scroll' : 'paginated')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              readMode === 'scroll'
                ? 'bg-accent text-accent-text'
                : 'bg-bg-input text-text-secondary border border-border-1 hover:text-text-primary'
            }`}
            title={readMode === 'paginated' ? 'Switch to scroll mode' : 'Switch to paginated mode'}
          >
            {readMode === 'paginated' ? 'Paginated' : 'Scroll'}
          </button>

          {/* Font size controls */}
          <div className="flex items-center gap-1 bg-bg-input border border-border-1 rounded px-2 py-1">
            <button
              onClick={() => setFontSize(Math.max(FONT_SIZE_MIN, fontSize - FONT_SIZE_STEP))}
              disabled={fontSize <= FONT_SIZE_MIN}
              className="text-text-secondary hover:text-text-primary disabled:text-text-muted text-sm leading-none"
              title="Decrease font size"
              aria-label="Decrease font size"
            >
              A-
            </button>
            <span className="text-text-secondary text-xs min-w-[28px] text-center">{fontSize}</span>
            <button
              onClick={() => setFontSize(Math.min(FONT_SIZE_MAX, fontSize + FONT_SIZE_STEP))}
              disabled={fontSize >= FONT_SIZE_MAX}
              className="text-text-secondary hover:text-text-primary disabled:text-text-muted text-sm leading-none"
              title="Increase font size"
              aria-label="Increase font size"
            >
              A+
            </button>
          </div>

          {/* Line height controls */}
          <div className="flex items-center gap-1 bg-bg-input border border-border-1 rounded px-2 py-1">
            <button
              onClick={() => setLineHeight(
                Math.max(LINE_HEIGHT_MIN, parseFloat((lineHeight - LINE_HEIGHT_STEP).toFixed(1))),
              )}
              disabled={lineHeight <= LINE_HEIGHT_MIN}
              className="text-text-secondary hover:text-text-primary disabled:text-text-muted text-xs leading-none"
              title="Decrease line height"
              aria-label="Decrease line height"
            >
              L-
            </button>
            <span className="text-text-secondary text-xs min-w-[28px] text-center">
              {lineHeight.toFixed(1)}
            </span>
            <button
              onClick={() => setLineHeight(
                Math.min(LINE_HEIGHT_MAX, parseFloat((lineHeight + LINE_HEIGHT_STEP).toFixed(1))),
              )}
              disabled={lineHeight >= LINE_HEIGHT_MAX}
              className="text-text-secondary hover:text-text-primary disabled:text-text-muted text-xs leading-none"
              title="Increase line height"
              aria-label="Increase line height"
            >
              L+
            </button>
          </div>

          {/* Theme selector */}
          <div className="flex items-center gap-1 bg-bg-input border border-border-1 rounded px-1.5 py-1">
            {(['dark', 'light', 'sepia'] as ThemeMode[]).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`w-5 h-5 rounded-full border-2 transition-colors ${
                  theme === t ? 'border-accent' : 'border-border-2 hover:border-border-1'
                }`}
                style={{ backgroundColor: THEMES[t].bg }}
                title={`${t.charAt(0).toUpperCase() + t.slice(1)} theme`}
                aria-label={`${t} theme`}
              />
            ))}
          </div>

          {/* Chapter panel toggle */}
          {chapters.length > 0 && (
            <button
              onClick={() => setShowChapterPanel(!showChapterPanel)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                showChapterPanel
                  ? 'bg-accent text-accent-text font-medium'
                  : 'bg-bg-hover hover:bg-toolbar-hover text-text-primary'
              }`}
              title="Table of contents"
            >
              Chapters
            </button>
          )}

          {/* Save / Restore progress */}
          <button
            onClick={handleSaveProgress}
            className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm"
            title="Save reading progress"
          >
            Save
          </button>
          <button
            onClick={handleRestoreProgress}
            className="px-3 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary text-sm"
            title="Restore reading progress"
          >
            Restore
          </button>

          {/* Close */}
          <button
            onClick={handleClose}
            className="px-2 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary"
            title="Close"
            aria-label="Close reader"
          >
            <RxCross2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ---- Main content area ---- */}
      <div className="flex flex-1 overflow-hidden">
        {renderContent()}

        {/* Chapter sidebar panel */}
        {showChapterPanel && chapters.length > 0 && (
          <div
            className="flex-shrink-0 bg-bg-panel border-l border-border-1 flex flex-col overflow-hidden"
            style={{ width: '260px' }}
          >
            <div className="p-2 border-b border-border-1 flex items-center justify-between">
              <span className="text-text-primary text-xs font-medium">Table of Contents</span>
              <button
                onClick={() => setShowChapterPanel(false)}
                className="text-text-muted hover:text-text-primary"
                aria-label="Close chapter panel"
              >
                <RxCross2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {chapters.map(ch => {
                const indentLevel = sourceType === 'md' ? (ch as databaseService.MdChapter).level || 1 : 1
                return (
                  <button
                    key={ch.chapter_number}
                    onClick={() => goToChapter(ch.chapter_number)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      currentChapter === ch.chapter_number
                        ? 'bg-accent/10 text-accent'
                        : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                    }`}
                    style={{ paddingLeft: `${indentLevel * 12 + 12}px` }}
                  >
                    {ch.title}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ---- Bottom info bar ---- */}
      <div
        className="flex-shrink-0 flex items-center select-none"
        style={{ height: '32px', backgroundColor: '#212121', borderTop: '1px solid #2E2E2E' }}
      >
        <div className="flex-1 px-3">
          <span style={{ fontSize: '11px', color: '#505050' }}>
            {readMode === 'scroll' ? 'Scroll mode' : 'Paginated mode'}
          </span>
        </div>
        <div className="flex items-center">
          {readMode === 'scroll' ? (
            <span style={{ fontSize: '14px', color: '#D0D0D0' }}>{scrollPercentage}%</span>
          ) : (
            <>
              <span style={{ fontSize: '14px', color: '#D0D0D0' }}>{currentPage}</span>
              <span style={{ fontSize: '14px', color: '#505050', margin: '0 4px' }}>/</span>
              <span style={{ fontSize: '14px', color: '#D0D0D0' }}>{effectiveTotalPages}</span>
            </>
          )}
        </div>
        <div className="flex-1 px-3 text-right">
          <span style={{ fontSize: '11px', color: '#505050' }}>
            {sourceType.toUpperCase()}
          </span>
        </div>
      </div>

      {/* ---- Page slider (paginated mode only) ---- */}
      {readMode === 'paginated' && effectiveTotalPages > 1 && (
        <div
          className="flex-shrink-0 flex items-center gap-3 px-3 select-none"
          style={{ height: '32px', backgroundColor: '#212121', borderTop: '1px solid #2E2E2E' }}
        >
          <span style={{ fontSize: '12px', color: '#707070', fontWeight: 500, minWidth: '20px' }}>
            1
          </span>
          <input
            type="range"
            min={1}
            max={effectiveTotalPages}
            value={currentPage}
            onChange={(e) => goToPage(Number(e.target.value))}
            className="page-slider flex-1"
            style={{
              '--slider-fill': `${((currentPage - 1) / Math.max(1, effectiveTotalPages - 1)) * 100}%`,
            } as React.CSSProperties}
            aria-label="Page slider"
          />
          <span style={{ fontSize: '12px', color: '#707070', fontWeight: 500, minWidth: '20px' }}>
            {effectiveTotalPages}
          </span>
        </div>
      )}

      {/* ---- Error toast ---- */}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-700 rounded-lg shadow-xl px-4 py-2 text-sm text-red-100 max-w-md">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-300 hover:text-red-100"
          >
            <RxCross2 className="w-4 h-4 inline" />
          </button>
        </div>
      )}
    </div>
  )
}

export default ReaderView
