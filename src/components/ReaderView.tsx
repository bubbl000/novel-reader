import { useState, useEffect, useCallback, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import * as databaseService from '../services/databaseService'
import { useTranslation } from '../i18n/useTranslation'
import {
  RxCross2,
  RxChevronLeft,
  RxChevronRight,
  RxMagnifyingGlass,
  RxBookmark,
  RxBookmarkFilled,
} from 'react-icons/rx'

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
const LINE_HEIGHT_STEP = 0.1

/** Base characters per page for TXT at font-size 18px */
const CHARS_PER_PAGE_BASE = 1200

const HIGHLIGHT_COLORS = ['#CBE93A', '#3AE9C8', '#E93AC8', '#E9C83A']

const AUTO_SAVE_DEBOUNCE_MS = 3000

// ---------------------------------------------------------------------------
// Helper: split plain text into page-sized chunks
// ---------------------------------------------------------------------------

function splitTextIntoPages(text: string, charsPerPage: number): string[] {
  if (!text) return ['']
  const pages: string[] = []
  let pos = 0
  while (pos < text.length) {
    let end = Math.min(pos + charsPerPage, text.length)
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
// Helper: format seconds into "Xh Ym Zs" or "Xm Ys" or "Ys"
// ---------------------------------------------------------------------------

function formatReadingTime(totalSeconds: number, translate: (key: string, params?: Record<string, string | number>) => string): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}${translate('reader.timeHour')}${minutes}${translate('reader.timeMinute')}${seconds}${translate('reader.timeSecond')}`
  if (minutes > 0) return `${minutes}${translate('reader.timeMinute')}${seconds}${translate('reader.timeSecond')}`
  return `${seconds}${translate('reader.timeSecond')}`
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
  const { t } = useTranslation()

  // ---- Book identity ----
  const [bookId, setBookId] = useState<number | null>(null)
  const [bookTitle, setBookTitle] = useState('')
  const [bookPath, setBookPath] = useState('')
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

  // ---- Auto-save progress ----
  const autoSaveTimerRef = useRef<number | null>(null)

  // ---- Bookmarks ----
  const [bookmarks, setBookmarks] = useState<databaseService.Bookmark[]>([])
  const [showBookmarkPanel, setShowBookmarkPanel] = useState(false)

  // ---- Highlights ----
  const [highlights, setHighlights] = useState<databaseService.Highlight[]>([])
  const [showHighlightPanel, setShowHighlightPanel] = useState(false)
  const [selectionToolbar, setSelectionToolbar] = useState<{
    visible: boolean
    top: number
    left: number
    selectedText: string
    startOffset: number
    endOffset: number
  } | null>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [noteInput, setNoteInput] = useState<{ visible: boolean; color: string }>({
    visible: false,
    color: HIGHLIGHT_COLORS[0],
  })
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)

  // ---- Search ----
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<databaseService.SearchResult[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ---- Reading statistics ----
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [pagesReadToday, setPagesReadToday] = useState(0)
  const [totalReadingStats, setTotalReadingStats] = useState<databaseService.ReadingStats | null>(null)
  const sessionStartPageRef = useRef(1)
  const statsTimerRef = useRef<number | null>(null)

  // ---- Refs ----
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const initialLoadRef = useRef(false)

  // ---- Derived: TXT pages ----
  const charsPerPage = Math.round(CHARS_PER_PAGE_BASE * (18 / fontSize))
  const txtPages = splitTextIntoPages(txtText, charsPerPage)

  // ---- Derived: effective total pages ----
  const effectiveTotalPages = totalPages

  const themeColors = THEMES[theme]

  // =========================================================================
  // Notification helper
  // =========================================================================

  const showNotification = useCallback((message: string) => {
    setNotification(message)
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current)
    notificationTimerRef.current = window.setTimeout(() => setNotification(null), 2500)
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
      setError(t('reader.loadFailed'))
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
      title = parts[1] ? decodeURIComponent(parts[1]) : ''
      path = parts[2] ? decodeURIComponent(parts[2]) : ''
      type = (parts[3] || 'txt') as 'pdf' | 'txt' | 'md'
    }

    setBookTitle(title || t('reader.unknownBook'))
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

    const timer = setTimeout(measure, 150)
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
      // Don't intercept when typing in search or note inputs
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          setShowSearch(false)
          setNoteInput({ visible: false, color: HIGHLIGHT_COLORS[0] })
        }
        if (showSearch && e.key === 'Enter') {
          e.preventDefault()
          if (e.shiftKey) navigateSearchPrev()
          else navigateSearchNext()
        }
        return
      }

      if (e.key === 'Escape') {
        if (showSearch) {
          setShowSearch(false)
          return
        }
        if (selectionToolbar) {
          setSelectionToolbar(null)
          setShowColorPicker(false)
          return
        }
      }
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
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goPrev, goNext, goToPage, effectiveTotalPages, showSearch, selectionToolbar])

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
  // Auto-save progress (debounced 3 seconds after page change)
  // =========================================================================

  useEffect(() => {
    if (!bookId || effectiveTotalPages <= 0 || currentPage <= 1) return

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = window.setTimeout(async () => {
      try {
        await databaseService.saveReadingProgress(
          bookId,
          currentPage,
          effectiveTotalPages,
          currentChapter ?? undefined,
        )
      } catch (err) {
        console.error('Auto-save progress error:', err)
      }
    }, AUTO_SAVE_DEBOUNCE_MS)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [bookId, currentPage, effectiveTotalPages, currentChapter])

  // =========================================================================
  // Auto-restore progress on book open
  // =========================================================================

  useEffect(() => {
    if (!bookId || isLoading) return

    const restoreProgress = async () => {
      try {
        const progress = await databaseService.getReadingProgress(bookId)
        if (progress && progress.current_page > 1) {
          goToPage(progress.current_page)
          showNotification(t('reader.restoredToPage', {0: progress.current_page}))
        }
      } catch (err) {
        console.error('Auto-restore progress error:', err)
      }
    }
    restoreProgress()
  }, [bookId, isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // =========================================================================
  // Save progress before window close
  // =========================================================================

  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (bookId && effectiveTotalPages > 0) {
        try {
          await databaseService.saveReadingProgress(
            bookId,
            currentPage,
            effectiveTotalPages,
            currentChapter ?? undefined,
          )
        } catch (err) {
          console.error('Before-unload save error:', err)
        }
      }
    }

    const currentWindow = getCurrentWindow()
    const unlisten = currentWindow.onCloseRequested(async (_event) => {
      await handleBeforeUnload()
      if (sessionId) {
        const pagesRead = Math.abs(currentPage - sessionStartPageRef.current)
        try {
          await databaseService.endReadingSession(sessionId, pagesRead)
        } catch (err) {
          console.error('End session on close error:', err)
        }
      }
    })

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      unlisten.then(fn => fn()).catch(() => {})
    }
  }, [bookId, currentPage, effectiveTotalPages, currentChapter, sessionId])

  // =========================================================================
  // Chapter navigation
  // =========================================================================

  const goToChapter = useCallback((chapterNumber: number) => {
    setCurrentChapter(chapterNumber)

    if (sourceType === 'txt') {
      const chapter = txtChapters.find(c => c.chapter_number === chapterNumber)
      if (chapter) {
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
      if (sessionId) {
        const pagesRead = Math.abs(currentPage - sessionStartPageRef.current)
        await databaseService.endReadingSession(sessionId, pagesRead)
      }
      const currentWindow = getCurrentWindow()
      await currentWindow.destroy()
    } catch (err) {
      console.error('Close window error:', err)
      try {
        const currentWindow = getCurrentWindow()
        await currentWindow.close()
      } catch (fallbackErr) {
        console.error('Fallback close error:', fallbackErr)
      }
    }
  }, [bookId, currentPage, effectiveTotalPages, currentChapter, sessionId])

  // =========================================================================
  // Bookmarks: load, add, delete
  // =========================================================================

  const loadBookmarks = useCallback(async () => {
    if (!bookId) return
    try {
      const result = await databaseService.getBookmarks(bookId)
      setBookmarks(result)
    } catch (err) {
      console.error('Load bookmarks error:', err)
    }
  }, [bookId])

  useEffect(() => {
    loadBookmarks()
  }, [loadBookmarks])

  const handleAddBookmark = useCallback(async () => {
    if (!bookId) return
    try {
      const title = t('reader.pageDash', {0: currentPage})
      const offset = currentPage
      await databaseService.addBookmark(bookId, currentChapter ?? null, offset, title)
      await loadBookmarks()
      showNotification(t('reader.bookmarkAdded', {0: title}))
    } catch (err) {
      console.error('Add bookmark error:', err)
      showNotification(t('reader.bookmarkAddFailed'))
    }
  }, [bookId, currentPage, currentChapter, loadBookmarks, showNotification, t])

  const handleDeleteBookmark = useCallback(async (bookmarkId: number) => {
    try {
      await databaseService.deleteBookmark(bookmarkId)
      await loadBookmarks()
      showNotification(t('reader.bookmarkDeleted'))
    } catch (err) {
      console.error('Delete bookmark error:', err)
    }
  }, [loadBookmarks, showNotification, t])

  const handleJumpToBookmark = useCallback((bookmark: databaseService.Bookmark) => {
    if (bookmark.offset) {
      goToPage(bookmark.offset)
    }
    setShowBookmarkPanel(false)
  }, [goToPage])

  // =========================================================================
  // Highlights: load, add, delete
  // =========================================================================

  const loadHighlights = useCallback(async () => {
    if (!bookId) return
    try {
      const result = await databaseService.getHighlights(bookId)
      setHighlights(result)
    } catch (err) {
      console.error('Load highlights error:', err)
    }
  }, [bookId])

  useEffect(() => {
    loadHighlights()
  }, [loadHighlights])

  const handleDeleteHighlight = useCallback(async (highlightId: number) => {
    try {
      await databaseService.deleteHighlight(highlightId)
      await loadHighlights()
      showNotification(t('reader.highlightDeleted'))
    } catch (err) {
      console.error('Delete highlight error:', err)
    }
  }, [loadHighlights, showNotification, t])

  const handleJumpToHighlight = useCallback((highlight: databaseService.Highlight) => {
    // For TXT: start_offset is character offset, find which page
    if (sourceType === 'txt') {
      let offset = 0
      for (let i = 0; i < txtPages.length; i++) {
        if (offset + txtPages[i].length > highlight.start_offset) {
          goToPage(i + 1)
          break
        }
        offset += txtPages[i].length
      }
    } else if (sourceType === 'pdf') {
      // For PDF: offset may be page number or character offset within page
      // Try to use as page number if reasonable
      if (highlight.chapter_id) {
        goToPage(highlight.chapter_id)
      }
    } else if (sourceType === 'md') {
      // For MD: find the heading or position by offset
      // Approximate by character count ratio
      if (effectiveTotalPages > 0) {
        const totalChars = mdHtml.length
        if (totalChars > 0) {
          const ratio = highlight.start_offset / totalChars
          const targetPage = Math.max(1, Math.ceil(ratio * effectiveTotalPages))
          goToPage(targetPage)
        }
      }
    }
    setShowHighlightPanel(false)
  }, [sourceType, txtPages, mdHtml, effectiveTotalPages, goToPage])

  // =========================================================================
  // Derived content for current page (needed before selection handler)
  // =========================================================================

  const currentPdfPageText = sourceType === 'pdf' && pdfPages.length > 0
    ? (pdfPages.find(p => p.page_number === currentPage)?.text
      || pdfPages[currentPage - 1]?.text
      || '')
    : ''

  // =========================================================================
  // Text selection handling for highlight/annotation
  // =========================================================================

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setSelectionToolbar(null)
      setShowColorPicker(false)
      return
    }

    const selectedText = selection.toString().trim()
    if (!selectedText) return

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    // Calculate character offsets based on source type
    let startOffset = 0
    let endOffset = 0

    if (sourceType === 'txt') {
      // For TXT: calculate offset within the full text
      // Use the current page text and add the offset of previous pages
      let pageOffset = 0
      for (let i = 0; i < currentPage - 1 && i < txtPages.length; i++) {
        pageOffset += txtPages[i].length
      }
      const pageText = txtPages[Math.min(currentPage - 1, txtPages.length - 1)] || ''
      const pageStart = pageText.indexOf(selectedText)
      if (pageStart >= 0) {
        startOffset = pageOffset + pageStart
        endOffset = startOffset + selectedText.length
      } else {
        // Fallback: use approximate offset
        startOffset = pageOffset
        endOffset = pageOffset + selectedText.length
      }
    } else if (sourceType === 'pdf') {
      // For PDF: offset within current page text
      const pageText = currentPdfPageText
      const textStart = pageText.indexOf(selectedText)
      if (textStart >= 0) {
        startOffset = textStart
        endOffset = textStart + selectedText.length
      } else {
        startOffset = 0
        endOffset = selectedText.length
      }
    } else if (sourceType === 'md') {
      // For MD: offset within the HTML content
      const htmlContent = mdHtml
      const textStart = htmlContent.indexOf(selectedText)
      if (textStart >= 0) {
        startOffset = textStart
        endOffset = textStart + selectedText.length
      } else {
        startOffset = 0
        endOffset = selectedText.length
      }
    }

    setSelectionToolbar({
      visible: true,
      top: rect.top - 44,
      left: rect.left + rect.width / 2,
      selectedText,
      startOffset,
      endOffset,
    })
    setShowColorPicker(false)
    setNoteInput({ visible: false, color: HIGHLIGHT_COLORS[0] })
  }, [sourceType, currentPage, txtPages, currentPdfPageText, mdHtml])

  const handleHighlightWithColor = useCallback(async (color: string) => {
    if (!bookId || !selectionToolbar) return
    try {
      await databaseService.addHighlight(
        bookId,
        currentChapter ?? null,
        selectionToolbar.startOffset,
        selectionToolbar.endOffset,
        selectionToolbar.selectedText,
        null,
        color,
      )
      await loadHighlights()
      showNotification(t('reader.highlightAdded'))
      setSelectionToolbar(null)
      setShowColorPicker(false)
      window.getSelection()?.removeAllRanges()
    } catch (err) {
      console.error('Add highlight error:', err)
      showNotification(t('reader.highlightAddFailed'))
    }
  }, [bookId, selectionToolbar, currentChapter, loadHighlights, showNotification])

  const handleAddNote = useCallback(async (note: string) => {
    if (!bookId || !selectionToolbar) return
    try {
      await databaseService.addHighlight(
        bookId,
        currentChapter ?? null,
        selectionToolbar.startOffset,
        selectionToolbar.endOffset,
        selectionToolbar.selectedText,
        note,
        noteInput.color,
      )
      await loadHighlights()
      showNotification(t('reader.noteAdded'))
      setSelectionToolbar(null)
      setNoteInput({ visible: false, color: HIGHLIGHT_COLORS[0] })
      window.getSelection()?.removeAllRanges()
    } catch (err) {
      console.error('Add note error:', err)
      showNotification(t('reader.noteAddFailed'))
    }
  }, [bookId, selectionToolbar, currentChapter, noteInput.color, loadHighlights, showNotification])

  // =========================================================================
  // Full-text search
  // =========================================================================

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || !bookPath) {
      setSearchResults([])
      setCurrentMatchIndex(-1)
      return
    }

    setIsSearching(true)
    try {
      let results: databaseService.SearchResults
      if (sourceType === 'pdf') {
        results = await databaseService.searchInPdf(bookPath, query)
      } else if (sourceType === 'txt') {
        results = await databaseService.searchInTxt(bookPath, query)
      } else {
        results = await databaseService.searchInMd(bookPath, query)
      }
      setSearchResults(results.results)
      setCurrentMatchIndex(results.results.length > 0 ? 0 : -1)
    } catch (err) {
      console.error('Search error:', err)
      setSearchResults([])
      setCurrentMatchIndex(-1)
    } finally {
      setIsSearching(false)
    }
  }, [bookPath, sourceType])

  const navigateSearchNext = useCallback(() => {
    if (searchResults.length === 0) return
    setCurrentMatchIndex(prev => (prev + 1) % searchResults.length)
  }, [searchResults.length])

  const navigateSearchPrev = useCallback(() => {
    if (searchResults.length === 0) return
    setCurrentMatchIndex(prev => (prev - 1 + searchResults.length) % searchResults.length)
  }, [searchResults.length])

  // Jump to current search match
  useEffect(() => {
    if (currentMatchIndex < 0 || searchResults.length === 0) return
    const match = searchResults[currentMatchIndex]
    if (!match) return
    goToPage(match.page_number)
  }, [currentMatchIndex, searchResults, goToPage])

  // Debounced search on query change
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setCurrentMatchIndex(-1)
      return
    }
    const timer = window.setTimeout(() => {
      performSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, performSearch])

  // =========================================================================
  // Reading statistics
  // =========================================================================

  // Start reading session when book opens
  useEffect(() => {
    if (!bookId || isLoading) return

    const startSession = async () => {
      try {
        const id = await databaseService.startReadingSession(bookId)
        setSessionId(id)
        sessionStartPageRef.current = currentPage

        // Load total stats
        const stats = await databaseService.getReadingStats(bookId)
        setTotalReadingStats(stats)
      } catch (err) {
        console.error('Start reading session error:', err)
      }
    }
    startSession()
  }, [bookId, isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Elapsed time timer
  useEffect(() => {
    statsTimerRef.current = window.setInterval(() => {
      setElapsedSeconds(prev => prev + 1)
    }, 1000)

    return () => {
      if (statsTimerRef.current) clearInterval(statsTimerRef.current)
    }
  }, [])

  // Track pages read today
  useEffect(() => {
    setPagesReadToday(prev => prev + 1)
  }, [currentPage])

  // =========================================================================
  // Cleanup on unmount
  // =========================================================================

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current)
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      if (statsTimerRef.current) clearInterval(statsTimerRef.current)
    }
  }, [])

  // =========================================================================
  // Derived content for current page
  // =========================================================================

  const currentTxtPageText = sourceType === 'txt' && txtPages.length > 0
    ? txtPages[Math.min(currentPage - 1, txtPages.length - 1)] || ''
    : ''

  const chapters = sourceType === 'txt'
    ? txtChapters
    : sourceType === 'md'
      ? mdChapters
      : []

  // ---- Chapter navigation helpers (for left/right buttons) ----
  const goPrevChapter = () => {
    if (chapters.length === 0) {
      goPrev()
      return
    }
    const target = (currentChapter ?? 1) - 1
    if (target >= 1) {
      goToChapter(target)
    }
  }

  const goNextChapter = () => {
    if (chapters.length === 0) {
      goNext()
      return
    }
    const target = (currentChapter ?? 1) + 1
    if (target <= chapters.length) {
      goToChapter(target)
    }
  }

  // =========================================================================
  // Apply highlights to text content
  // =========================================================================

  const applyHighlightsToText = useCallback((text: string, pageNumber: number): React.ReactNode[] => {
    if (highlights.length === 0) return [text]

    // Collect highlights relevant to this page
    const relevantHighlights: Array<{
      start: number
      end: number
      color: string
      id: number
    }> = []

    if (sourceType === 'txt') {
      let pageStartOffset = 0
      for (let i = 0; i < pageNumber - 1 && i < txtPages.length; i++) {
        pageStartOffset += txtPages[i].length
      }
      const pageEndOffset = pageStartOffset + text.length

      for (const h of highlights) {
        if (h.end_offset <= pageStartOffset || h.start_offset >= pageEndOffset) continue
        const localStart = Math.max(0, h.start_offset - pageStartOffset)
        const localEnd = Math.min(text.length, h.end_offset - pageStartOffset)
        relevantHighlights.push({ start: localStart, end: localEnd, color: h.color, id: h.id! })
      }
    } else if (sourceType === 'pdf') {
      // For PDF, highlights are offset within the page text
      for (const h of highlights) {
        if (h.start_offset < text.length) {
          const end = Math.min(h.end_offset, text.length)
          relevantHighlights.push({ start: h.start_offset, end, color: h.color, id: h.id! })
        }
      }
    }

    if (relevantHighlights.length === 0) return [text]

    // Sort by start offset
    relevantHighlights.sort((a, b) => a.start - b.start)

    const parts: React.ReactNode[] = []
    let lastEnd = 0

    for (const hl of relevantHighlights) {
      if (hl.start > lastEnd) {
        parts.push(text.substring(lastEnd, hl.start))
      }
      if (hl.start < lastEnd) continue // Overlapping, skip
      parts.push(
        <mark
          key={`hl-${hl.id}`}
          style={{
            backgroundColor: hl.color + '55',
            color: themeColors.text,
            borderRadius: '2px',
            padding: '0 2px',
          }}
        >
          {text.substring(hl.start, hl.end)}
        </mark>
      )
      lastEnd = hl.end
    }

    if (lastEnd < text.length) {
      parts.push(text.substring(lastEnd))
    }

    return parts
  }, [highlights, sourceType, txtPages, themeColors.text])

  // =========================================================================
  // Apply search highlights to text
  // =========================================================================

  const applySearchHighlights = useCallback((text: string): React.ReactNode[] => {
    if (!searchQuery || searchResults.length === 0) return [text]

    const caseInsensitiveText = text.toLowerCase()
    const query = searchQuery.toLowerCase()
    const parts: React.ReactNode[] = []
    let lastEnd = 0
    let matchCount = 0

    // Find all occurrences in this text
    let searchIndex = 0
    while (searchIndex < caseInsensitiveText.length) {
      const foundAt = caseInsensitiveText.indexOf(query, searchIndex)
      if (foundAt === -1) break

      if (foundAt > lastEnd) {
        parts.push(text.substring(lastEnd, foundAt))
      }

      // Check if this is the current match
      const isCurrentMatch = searchResults[currentMatchIndex]
        && searchResults[currentMatchIndex].page_number === currentPage
        && matchCount === 0 // Simplified: highlight first match on page

      parts.push(
        <mark
          key={`search-${foundAt}`}
          style={{
            backgroundColor: isCurrentMatch ? '#CBE93A' : '#CBE93A44',
            color: isCurrentMatch ? '#1A1A1A' : themeColors.text,
            borderRadius: '2px',
            padding: '0 1px',
          }}
        >
          {text.substring(foundAt, foundAt + query.length)}
        </mark>
      )

      lastEnd = foundAt + query.length
      searchIndex = foundAt + 1
      matchCount++
    }

    if (lastEnd < text.length) {
      parts.push(text.substring(lastEnd))
    }

    return parts.length > 0 ? parts : [text]
  }, [searchQuery, searchResults, currentMatchIndex, currentPage, themeColors.text])

  // =========================================================================
  // Combined text rendering with highlights and search
  // =========================================================================

  const renderAnnotatedText = useCallback((text: string, pageNumber: number): React.ReactNode[] => {
    // First apply highlights, then apply search highlights on top
    const highlightedParts = applyHighlightsToText(text, pageNumber)

    if (!searchQuery) return highlightedParts

    // Apply search highlighting to each part
    return highlightedParts.flatMap((part) => {
      if (typeof part === 'string') {
        return applySearchHighlights(part)
      }
      // Already a highlighted mark, keep as-is
      return [part]
    })
  }, [applyHighlightsToText, applySearchHighlights, searchQuery])

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
          <p style={{ color: themeColors.secondary }}>{t('reader.loading')}</p>
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
        <div className="flex-1 relative" style={{ backgroundColor: themeColors.bg }}>
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto h-full"
            onScroll={handleScroll}
            onMouseUp={handleMouseUp}
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
                    — {t('reader.pageDash', {0: page.page_number})} —
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {renderAnnotatedText(page.text || t('reader.noTextOnPage'), page.page_number)}
                  </div>
                </div>
              ))}

              {sourceType === 'txt' && (
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {renderAnnotatedText(txtText, currentPage)}
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
          </div>

          {/* Scroll-to-top button - outside scroll container */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            className="fixed bottom-12 right-8 w-10 h-10 bg-accent text-accent-text rounded-full shadow-lg flex items-center justify-center hover:bg-accent-hover transition-colors text-lg font-bold z-20"
            title={t('reader.backToTop')}
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
        onMouseUp={handleMouseUp}
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
              {renderAnnotatedText(currentPdfPageText || t('reader.noTextOnPage'), currentPage)}
            </div>
          )}

          {sourceType === 'txt' && (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {renderAnnotatedText(currentTxtPageText || t('reader.blankPage'), currentPage)}
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

        {/* Previous chapter/page button */}
        <button
          onClick={chapters.length > 0 ? goPrevChapter : goPrev}
          disabled={chapters.length > 0 ? (currentChapter ?? 1) <= 1 : currentPage <= 1}
          className="fixed left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-bg-panel/80 hover:bg-bg-panel text-text-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 z-10"
          title={chapters.length > 0 ? t('reader.previousChapter') : t('reader.previousPage')}
          aria-label={chapters.length > 0 ? t('reader.previousChapter') : t('reader.previousPage')}
        >
          <RxChevronLeft className="w-6 h-6" />
        </button>

        {/* Next chapter/page button */}
        <button
          onClick={chapters.length > 0 ? goNextChapter : goNext}
          disabled={chapters.length > 0 ? (currentChapter ?? 1) >= chapters.length : currentPage >= effectiveTotalPages}
          className="fixed right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-bg-panel/80 hover:bg-bg-panel text-text-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 z-10"
          title={chapters.length > 0 ? t('reader.nextChapter') : t('reader.nextPage')}
          aria-label={chapters.length > 0 ? t('reader.nextChapter') : t('reader.nextPage')}
        >
          <RxChevronRight className="w-6 h-6" />
        </button>
      </div>
    )
  }

  // =========================================================================
  // Main render
  // =========================================================================

  const isBookmarked = bookmarks.some(b => b.offset === currentPage)

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
        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Search button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowSearch(!showSearch)
              if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 50)
            }}
            className={`px-2 py-1 rounded text-sm transition-colors ${
              showSearch
                ? 'bg-accent text-accent-text'
                : 'bg-bg-hover hover:bg-toolbar-hover text-text-primary'
            }`}
            title={t('reader.searchShortcut')}
          >
            <RxMagnifyingGlass className="w-4 h-4" />
          </button>

          {/* Bookmark button */}
          <button
            onClick={(e) => { e.stopPropagation(); handleAddBookmark() }}
            className={`px-2 py-1 rounded text-sm transition-colors ${
              isBookmarked
                ? 'text-accent'
                : 'bg-bg-hover hover:bg-toolbar-hover text-text-primary'
            }`}
            title={t('reader.addBookmark')}
          >
            {isBookmarked ? <RxBookmarkFilled className="w-4 h-4" /> : <RxBookmark className="w-4 h-4" />}
          </button>

          {/* Bookmark panel toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowBookmarkPanel(!showBookmarkPanel)
              setShowHighlightPanel(false)
            }}
            className={`px-2 py-1 rounded text-sm transition-colors ${
              showBookmarkPanel
                ? 'bg-accent text-accent-text'
                : 'bg-bg-hover hover:bg-toolbar-hover text-text-primary'
            }`}
            title={t('reader.bookmarks')}
          >
            <span style={{ fontSize: '12px' }}>BM</span>
          </button>

          {/* Highlight panel toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowHighlightPanel(!showHighlightPanel)
              setShowBookmarkPanel(false)
            }}
            className={`px-2 py-1 rounded text-sm transition-colors ${
              showHighlightPanel
                ? 'bg-accent text-accent-text'
                : 'bg-bg-hover hover:bg-toolbar-hover text-text-primary'
            }`}
            title={t('reader.highlightAndNotes')}
          >
            <span style={{ fontSize: '12px' }}>HL</span>
          </button>

          {/* Read mode toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setReadMode(readMode === 'paginated' ? 'scroll' : 'paginated')
            }}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              readMode === 'scroll'
                ? 'bg-accent text-accent-text'
                : 'bg-bg-input text-text-secondary border border-border-1 hover:text-text-primary'
            }`}
            title={readMode === 'paginated' ? t('reader.switchToScroll') : t('reader.switchToPaginated')}
          >
            {readMode === 'paginated' ? t('reader.paginated') : t('reader.scroll')}
          </button>

          {/* Font size slider */}
          <div className="flex items-center gap-2 bg-bg-input border border-border-1 rounded px-2 py-1">
            <span className="text-text-secondary text-xs font-medium">A</span>
            <input
              type="range"
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              step={FONT_SIZE_STEP}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="page-slider"
              style={{
                width: '70px',
                '--slider-fill': `${((fontSize - FONT_SIZE_MIN) / (FONT_SIZE_MAX - FONT_SIZE_MIN)) * 100}%`,
              } as React.CSSProperties}
              aria-label={t('reader.fontSize')}
            />
            <span className="text-text-secondary text-xs min-w-[22px] text-center">{fontSize}</span>
          </div>

          {/* Line height slider */}
          <div className="flex items-center gap-2 bg-bg-input border border-border-1 rounded px-2 py-1">
            <span className="text-text-secondary text-xs font-medium">{t('reader.lineHeight')[0]}</span>
            <input
              type="range"
              min={LINE_HEIGHT_MIN}
              max={LINE_HEIGHT_MAX}
              step={LINE_HEIGHT_STEP}
              value={lineHeight}
              onChange={(e) => setLineHeight(Number(e.target.value))}
              className="page-slider"
              style={{
                width: '70px',
                '--slider-fill': `${((lineHeight - LINE_HEIGHT_MIN) / (LINE_HEIGHT_MAX - LINE_HEIGHT_MIN)) * 100}%`,
              } as React.CSSProperties}
              aria-label={t('reader.lineHeight')}
            />
            <span className="text-text-secondary text-xs min-w-[28px] text-center">{lineHeight.toFixed(1)}</span>
          </div>

          {/* Theme selector */}
          <div className="flex items-center gap-1 bg-bg-input border border-border-1 rounded px-1.5 py-1">
            {(['dark', 'light', 'sepia'] as ThemeMode[]).map(themeMode => (
              <button
                key={themeMode}
                onClick={(e) => { e.stopPropagation(); setTheme(themeMode) }}
                className={`w-5 h-5 rounded-full border-2 transition-colors ${
                  theme === themeMode ? 'border-accent' : 'border-border-2 hover:border-border-1'
                }`}
                style={{ backgroundColor: THEMES[themeMode].bg }}
                title={themeMode === 'dark' ? t('reader.darkTheme') : themeMode === 'light' ? t('reader.lightTheme') : t('reader.sepiaTheme')}
                aria-label={themeMode === 'dark' ? t('reader.darkTheme') : themeMode === 'light' ? t('reader.lightTheme') : t('reader.sepiaTheme')}
              />
            ))}
          </div>

          {/* Chapter panel toggle */}
          {chapters.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowChapterPanel(!showChapterPanel)
                setShowBookmarkPanel(false)
                setShowHighlightPanel(false)
              }}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                showChapterPanel
                  ? 'bg-accent text-accent-text font-medium'
                  : 'bg-bg-hover hover:bg-toolbar-hover text-text-primary'
              }`}
              title={t('reader.chapterList')}
            >
              {t('reader.chapter')}
            </button>
          )}

          {/* Close */}
          <button
            onClick={(e) => { e.stopPropagation(); handleClose() }}
            className="px-2 py-1 bg-bg-hover hover:bg-toolbar-hover rounded text-text-primary"
            title={t('reader.close')}
            aria-label={t('reader.closeReader')}
          >
            <RxCross2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ---- Search bar ---- */}
      {showSearch && (
        <div
          className="flex items-center gap-2 px-3 flex-shrink-0"
          style={{
            height: '36px',
            backgroundColor: '#212121',
            borderBottom: '1px solid #363636',
          }}
        >
          <RxMagnifyingGlass className="w-4 h-4 flex-shrink-0" style={{ color: '#909090' }} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('reader.searchPlaceholder')}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: '#E0E0E0' }}
            aria-label={t('reader.search')}
          />
          {isSearching && (
            <span style={{ fontSize: '11px', color: '#909090' }}>{t('reader.searching')}</span>
          )}
          {searchResults.length > 0 && (
            <span style={{ fontSize: '12px', color: '#E0E0E0' }}>
              {currentMatchIndex + 1}/{searchResults.length}
            </span>
          )}
          <button
            onClick={navigateSearchPrev}
            disabled={searchResults.length === 0}
            className="text-text-secondary hover:text-text-primary disabled:text-text-muted"
            title={t('reader.prevMatch')}
          >
            <RxChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={navigateSearchNext}
            disabled={searchResults.length === 0}
            className="text-text-secondary hover:text-text-primary disabled:text-text-muted"
            title={t('reader.nextMatch')}
          >
            <RxChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setShowSearch(false)
              setSearchQuery('')
              setSearchResults([])
              setCurrentMatchIndex(-1)
            }}
            className="text-text-muted hover:text-text-primary"
            title={t('reader.closeSearch')}
          >
            <RxCross2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ---- Selection floating toolbar ---- */}
      {selectionToolbar && selectionToolbar.visible && (
        <div
          className="fixed z-50 flex items-center gap-1 rounded-lg shadow-xl px-2 py-1.5"
          style={{
            top: `${selectionToolbar.top}px`,
            left: `${Math.max(8, Math.min(selectionToolbar.left - 80, window.innerWidth - 200))}px`,
            backgroundColor: '#272727',
            border: '1px solid #363636',
          }}
        >
          {/* Highlight button with color picker */}
          <div className="relative">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="px-2 py-1 rounded text-xs font-medium transition-colors"
              style={{
                backgroundColor: '#2E2E2E',
                color: '#E0E0E0',
                border: '1px solid #363636',
              }}
              title={t('reader.highlight')}
            >
              {t('reader.highlight')}
            </button>
            {showColorPicker && (
              <div
                className="absolute top-full left-0 mt-1 flex gap-1 p-1.5 rounded shadow-xl z-50"
                style={{
                  backgroundColor: '#272727',
                  border: '1px solid #363636',
                }}
              >
                {HIGHLIGHT_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => handleHighlightWithColor(color)}
                    className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: color,
                      borderColor: '#1A1A1A',
                    }}
                    title={color}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Note button */}
          <button
            onClick={() => {
              setNoteInput({ visible: true, color: noteInput.color })
              setTimeout(() => noteTextareaRef.current?.focus(), 50)
            }}
            className="px-2 py-1 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: '#2E2E2E',
              color: '#E0E0E0',
              border: '1px solid #363636',
            }}
            title={t('reader.note')}
          >
            {t('reader.note')}
          </button>

          <button
            onClick={() => {
              setSelectionToolbar(null)
              setShowColorPicker(false)
              window.getSelection()?.removeAllRanges()
            }}
            className="text-text-muted hover:text-text-primary px-1"
          >
            <RxCross2 className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ---- Note input popup ---- */}
      {noteInput.visible && selectionToolbar && (
        <div
          className="fixed z-50 rounded-lg shadow-xl p-3"
          style={{
            top: `${selectionToolbar.top - 120}px`,
            left: `${Math.max(8, Math.min(selectionToolbar.left - 100, window.innerWidth - 260))}px`,
            backgroundColor: '#272727',
            border: '1px solid #363636',
            width: '240px',
          }}
        >
          <div className="flex items-center gap-1 mb-2">
            <span style={{ fontSize: '11px', color: '#909090' }}>{t('reader.color')}</span>
            {HIGHLIGHT_COLORS.map(color => (
              <button
                key={color}
                onClick={() => setNoteInput(prev => ({ ...prev, color }))}
                className="w-4 h-4 rounded-full border-2 transition-transform"
                style={{
                  backgroundColor: color,
                  borderColor: noteInput.color === color ? '#E0E0E0' : '#1A1A1A',
                }}
              />
            ))}
          </div>
          <textarea
            ref={noteTextareaRef}
            placeholder={t('reader.addNotePlaceholder')}
            className="w-full rounded px-2 py-1.5 text-sm resize-none outline-none"
            style={{
              backgroundColor: '#2A2A2A',
              color: '#E0E0E0',
              border: '1px solid #363636',
              height: '60px',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setNoteInput({ visible: false, color: HIGHLIGHT_COLORS[0] })
              }
              e.stopPropagation()
            }}
            aria-label={t('reader.note')}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setNoteInput({ visible: false, color: HIGHLIGHT_COLORS[0] })}
              className="px-2 py-1 rounded text-xs"
              style={{ color: '#909090' }}
            >
              {t('reader.cancel')}
            </button>
            <button
              onClick={() => {
                const note = noteTextareaRef.current?.value || ''
                handleAddNote(note)
              }}
              className="px-3 py-1 rounded text-xs font-medium"
              style={{ backgroundColor: '#CBE93A', color: '#1A1A1A' }}
            >
              {t('reader.save')}
            </button>
          </div>
        </div>
      )}

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
              <span className="text-text-primary text-xs font-medium">{t('reader.chapterList')}</span>
              <button
                onClick={() => setShowChapterPanel(false)}
                className="text-text-muted hover:text-text-primary"
                aria-label={t('reader.closeChapterPanel')}
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

        {/* Bookmark sidebar panel */}
        {showBookmarkPanel && (
          <div
            className="flex-shrink-0 bg-bg-panel border-l border-border-1 flex flex-col overflow-hidden"
            style={{ width: '260px' }}
          >
            <div className="p-2 border-b border-border-1 flex items-center justify-between">
              <span className="text-text-primary text-xs font-medium">{t('reader.bookmarks')}</span>
              <button
                onClick={() => setShowBookmarkPanel(false)}
                className="text-text-muted hover:text-text-primary"
                aria-label={t('reader.closeBookmarkPanel')}
              >
                <RxCross2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {bookmarks.length === 0 ? (
                <p className="text-center py-4" style={{ fontSize: '12px', color: '#555555' }}>
                  {t('reader.noBookmarks')}
                </p>
              ) : (
                bookmarks.map(bm => (
                  <div
                    key={bm.id}
                    className="flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors hover:bg-bg-hover group"
                  >
                    <RxBookmarkFilled className="w-3 h-3 flex-shrink-0" style={{ color: '#CBE93A' }} />
                    <button
                      onClick={() => handleJumpToBookmark(bm)}
                      className="flex-1 text-left text-text-secondary hover:text-text-primary truncate"
                    >
                      {bm.title}
                    </button>
                    <span style={{ fontSize: '11px', color: '#555555' }} className="flex-shrink-0">
                      {t('reader.pageDash', {0: bm.offset ?? 0})}
                    </span>
                    <span style={{ fontSize: '10px', color: '#555555' }} className="flex-shrink-0">
                      {bm.created_at ? new Date(bm.created_at).toLocaleDateString() : ''}
                    </span>
                    <button
                      onClick={() => bm.id && handleDeleteBookmark(bm.id)}
                      className="text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      title={t('reader.deleteBookmark')}
                    >
                      <RxCross2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Highlight sidebar panel */}
        {showHighlightPanel && (
          <div
            className="flex-shrink-0 bg-bg-panel border-l border-border-1 flex flex-col overflow-hidden"
            style={{ width: '300px' }}
          >
            <div className="p-2 border-b border-border-1 flex items-center justify-between">
              <span className="text-text-primary text-xs font-medium">{t('reader.highlightAndNotes')}</span>
              <button
                onClick={() => setShowHighlightPanel(false)}
                className="text-text-muted hover:text-text-primary"
                aria-label={t('reader.closeHighlightPanel')}
              >
                <RxCross2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {highlights.length === 0 ? (
                <p className="text-center py-4" style={{ fontSize: '12px', color: '#555555' }}>
                  {t('reader.noHighlights')}
                </p>
              ) : (
                highlights.map(hl => (
                  <div
                    key={hl.id}
                    className="flex items-start gap-2 px-3 py-2 rounded text-sm transition-colors hover:bg-bg-hover group mb-1"
                    style={{ borderLeft: `3px solid ${hl.color}` }}
                  >
                    <button
                      onClick={() => handleJumpToHighlight(hl)}
                      className="flex-1 text-left"
                    >
                      <p
                        className="truncate"
                        style={{ color: '#E0E0E0', fontSize: '12px', lineHeight: '1.4' }}
                      >
                        {hl.text_content || t('reader.noText')}
                      </p>
                      {hl.note && (
                        <p
                          className="mt-1 truncate"
                          style={{ fontSize: '11px', color: '#909090', fontStyle: 'italic' }}
                        >
                          {t('reader.noteLabel')}{hl.note}
                        </p>
                      )}
                      <span style={{ fontSize: '10px', color: '#555555' }}>
                        {t('reader.pageDash', {0: hl.start_offset})} · {hl.created_at ? new Date(hl.created_at).toLocaleDateString() : ''}
                      </span>
                    </button>
                    <button
                      onClick={() => hl.id && handleDeleteHighlight(hl.id)}
                      className="text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1"
                      title={t('reader.deleteHighlight')}
                    >
                      <RxCross2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---- Bottom info bar ---- */}
      <div
        className="flex-shrink-0 flex items-center select-none"
        style={{ height: '32px', backgroundColor: '#212121', borderTop: '1px solid #2E2E2E' }}
      >
        <div className="flex-1 px-3 flex items-center gap-2">
          <span style={{ fontSize: '11px', color: '#505050' }}>
            {readMode === 'scroll' ? t('reader.scrollMode') : t('reader.paginatedMode')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Reading time */}
          <span
            style={{ fontSize: '11px', color: '#909090' }}
            title={totalReadingStats
              ? t('reader.totalReadingTime', {0: formatReadingTime(totalReadingStats.total_duration_seconds, t), 1: totalReadingStats.total_sessions})
              : t('reader.currentReadingTime')
            }
          >
            {formatReadingTime(elapsedSeconds, t)}
          </span>
          {/* Pages read today */}
          <span style={{ fontSize: '11px', color: '#555555' }}>
            +{pagesReadToday}{t('reader.pagesReadToday')}
          </span>
          {/* Page indicator */}
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
            aria-label={t('reader.pageSlider')}
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
