import { useState, useEffect, useCallback, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useTranslation } from '../i18n/useTranslation'
import * as databaseService from '../services/databaseService'
import {
  RxCross2,
  RxChevronLeft,
  RxChevronRight,
  RxBookmark,
  RxBookmarkFilled,
  RxPencil1,
} from 'react-icons/rx'

type ReadMode = 'scroll' | 'single' | 'spread'
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
const CHARS_PER_PAGE_BASE = 1200
const HIGHLIGHT_COLORS = ['#CBE93A', '#3AE9C8', '#E93AC8', '#E9C83A']
const AUTO_SAVE_DEBOUNCE_MS = 3000

const FONT_OPTIONS = [
  { value: 'default', label: 'fontDefault', css: 'inherit' },
  { value: 'serif', label: 'fontSerif', css: 'serif' },
  { value: 'sans', label: 'fontSans', css: 'sans-serif' },
  { value: 'mono', label: 'fontMono', css: 'monospace' },
  { value: 'kai', label: 'fontKai', css: '"KaiTi", "STKaiti", serif' },
]

const STORAGE_KEY = 'novel-reader-settings'

interface ReaderSettings {
  readMode: ReadMode
  theme: ThemeMode
  fontSize: number
  lineHeight: number
  fontFamily: string
}

function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { readMode: 'single', theme: 'dark', fontSize: 18, lineHeight: 1.8, fontFamily: 'default' }
}

function saveSettings(settings: ReaderSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {}
}

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

const MD_CONTENT_STYLES = `
.novel-md-content h1 { font-size: 1.8em; font-weight: 700; margin: 0.8em 0 0.4em; line-height: 1.3; }
.novel-md-content h2 { font-size: 1.5em; font-weight: 700; margin: 0.7em 0 0.35em; line-height: 1.3; }
.novel-md-content h3 { font-size: 1.25em; font-weight: 600; margin: 0.6em 0 0.3em; line-height: 1.3; }
.novel-md-content h4 { font-size: 1.1em; font-weight: 600; margin: 0.5em 0 0.25em; line-height: 1.3; }
.novel-md-content h5, .novel-md-content h6 { font-size: 1em; font-weight: 600; margin: 0.4em 0 0.2em; }
.novel-md-content p { margin: 0 0 0.8em; }
.novel-md-content ul, .novel-md-content ol { margin: 0 0 0.8em; padding-left: 1.8em; }
.novel-md-content li { margin-bottom: 0.25em; }
.novel-md-content blockquote { margin: 0 0 0.8em; padding: 0.4em 1em; border-left: 3px solid var(--md-quote-border); opacity: 0.9; }
.novel-md-content pre { margin: 0 0 0.8em; padding: 0.8em 1em; border-radius: 4px; overflow-x: auto; font-size: 0.88em; line-height: 1.5; background: var(--md-code-bg); }
.novel-md-content code { font-size: 0.88em; padding: 0.15em 0.35em; border-radius: 3px; background: var(--md-code-bg); }
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

function ReaderView() {
  const { t } = useTranslation()

  const [bookId, setBookId] = useState<number | null>(null)
  const [bookTitle, setBookTitle] = useState('')
  const [_bookPath, setBookPath] = useState('')
  const [sourceType, setSourceType] = useState<'pdf' | 'txt' | 'md'>('txt')

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const saved = loadSettings()
  const [readMode, setReadMode] = useState<ReadMode>(saved.readMode)
  const [theme, setTheme] = useState<ThemeMode>(saved.theme)
  const [fontSize, setFontSize] = useState(saved.fontSize)
  const [lineHeight, setLineHeight] = useState(saved.lineHeight)
  const [fontFamily, setFontFamily] = useState(saved.fontFamily)

  const [pdfPages, setPdfPages] = useState<databaseService.PdfTextPage[]>([])
  const [txtText, setTxtText] = useState('')
  const [txtChapters, setTxtChapters] = useState<databaseService.TxtChapter[]>([])
  const [mdHtml, setMdHtml] = useState('')
  const [mdChapters, setMdChapters] = useState<databaseService.MdChapter[]>([])

  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [currentChapter, setCurrentChapter] = useState<number | null>(null)

  const [notification, setNotification] = useState<string | null>(null)
  const notificationTimerRef = useRef<number | null>(null)
  const [showChapterPanel, setShowChapterPanel] = useState(false)
  const [scrollPercentage, setScrollPercentage] = useState(0)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const [loadedChapterNumbers, setLoadedChapterNumbers] = useState<Set<number>>(new Set())
  const scrollChapterCacheRef = useRef<Map<number, string>>(new Map())

  const autoSaveTimerRef = useRef<number | null>(null)

  const [bookmarks, setBookmarks] = useState<databaseService.Bookmark[]>([])
  const [showBookmarkPanel, setShowBookmarkPanel] = useState(false)

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

  const contentRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const initialLoadRef = useRef(false)
  const scrollProgressSavedRef = useRef(false)

  const charsPerPage = Math.round(CHARS_PER_PAGE_BASE * (18 / fontSize))
  const txtPages = splitTextIntoPages(txtText, charsPerPage)

  const chapters = sourceType === 'txt'
    ? txtChapters
    : sourceType === 'md'
      ? mdChapters
      : []

  const effectiveTotalPages = totalPages
  const themeColors = THEMES[theme]

  const fontCss = FONT_OPTIONS.find(f => f.value === fontFamily)?.css || 'inherit'

  useEffect(() => {
    saveSettings({ readMode, theme, fontSize, lineHeight, fontFamily })
  }, [readMode, theme, fontSize, lineHeight, fontFamily])

  const showNotification = useCallback((message: string) => {
    setNotification(message)
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current)
    notificationTimerRef.current = window.setTimeout(() => setNotification(null), 2500)
  }, [])

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
      scrollProgressSavedRef.current = false
    } catch (err) {
      console.error('Failed to load content:', err)
      setError(t('reader.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }, [])

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

  useEffect(() => {
    if (sourceType === 'pdf') {
      setTotalPages(pdfPages.length)
    } else if (sourceType === 'txt') {
      setTotalPages(txtPages.length)
    }
  }, [sourceType, pdfPages.length, txtPages.length])

  useEffect(() => {
    if (sourceType !== 'md') return
    if (readMode === 'scroll') return
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
    const observer = new ResizeObserver(() => { measure() })
    observer.observe(contentRef.current)

    return () => { clearTimeout(timer); observer.disconnect() }
  }, [sourceType, readMode, mdHtml, fontSize, lineHeight])

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [totalPages, currentPage])

  useEffect(() => {
    if (sourceType !== 'md' || readMode === 'scroll') return
    const container = contentRef.current
    if (!container) return
    const viewportHeight = container.clientHeight
    if (viewportHeight > 0) {
      container.scrollTop = (currentPage - 1) * viewportHeight
    }
  }, [sourceType, readMode, currentPage])

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') setNoteInput({ visible: false, color: HIGHLIGHT_COLORS[0] })
        return
      }
      if (e.key === 'Escape') {
        if (selectionToolbar) { setSelectionToolbar(null); setShowColorPicker(false); return }
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); goPrev() }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); goNext() }
      else if (e.key === 'Home') { e.preventDefault(); goToPage(1) }
      else if (e.key === 'End') { e.preventDefault(); goToPage(effectiveTotalPages) }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goPrev, goNext, goToPage, effectiveTotalPages, selectionToolbar])

  useEffect(() => {
    if (readMode === 'scroll') return
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
    return () => { window.removeEventListener('wheel', handleWheel); if (wheelTimer) clearTimeout(wheelTimer) }
  }, [readMode, goNext, goPrev])

  const getChapterText = useCallback((chapterNumber: number): string | null => {
    if (sourceType === 'txt') {
      const chapter = txtChapters.find(c => c.chapter_number === chapterNumber)
      if (!chapter) return null
      return txtText.substring(chapter.start_offset, chapter.end_offset)
    }
    if (sourceType === 'pdf') {
      const pagesPerChapter = Math.ceil(pdfPages.length / Math.max(1, chapters.length))
      const startPage = (chapterNumber - 1) * pagesPerChapter
      const endPage = Math.min(chapterNumber * pagesPerChapter, pdfPages.length)
      return pdfPages.slice(startPage, endPage).map(p => p.text || '').join('\n\n')
    }
    return null
  }, [sourceType, txtChapters, txtText, pdfPages, chapters.length])

  useEffect(() => {
    if (readMode !== 'scroll' || sourceType === 'md') return
    if (chapters.length === 0) {
      const chapterNums = new Set([1])
      setLoadedChapterNumbers(chapterNums)
      scrollChapterCacheRef.current.clear()
      if (sourceType === 'txt') scrollChapterCacheRef.current.set(1, txtText)
      else if (sourceType === 'pdf') scrollChapterCacheRef.current.set(1, pdfPages.map(p => p.text || '').join('\n\n'))
      return
    }
    const initial = new Set([1])
    setLoadedChapterNumbers(initial)
    scrollChapterCacheRef.current.clear()
    const text = getChapterText(1)
    if (text !== null) scrollChapterCacheRef.current.set(1, text)
  }, [readMode, sourceType, chapters.length, txtChapters, txtText, pdfPages, getChapterText])

  const loadNextChapter = useCallback(() => {
    if (sourceType === 'md') return
    const loadedArr = Array.from(loadedChapterNumbers).sort((a, b) => a - b)
    const lastLoaded = loadedArr[loadedArr.length - 1] || 0
    const maxChapter = chapters.length > 0 ? chapters.length : 1
    if (lastLoaded >= maxChapter) return
    const nextChapter = lastLoaded + 1
    const text = getChapterText(nextChapter)
    if (text === null) return

    const newCache = new Map(scrollChapterCacheRef.current)
    newCache.set(nextChapter, text)
    const newLoaded = new Set(loadedChapterNumbers)
    newLoaded.add(nextChapter)

    while (newLoaded.size > 3) {
      const sorted = Array.from(newLoaded).sort((a, b) => a - b)
      newLoaded.delete(sorted[0])
      newCache.delete(sorted[0])
    }

    scrollChapterCacheRef.current = newCache
    setLoadedChapterNumbers(newLoaded)
  }, [loadedChapterNumbers, chapters.length, sourceType, getChapterText])

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    const maxScroll = scrollHeight - clientHeight
    const percentage = maxScroll > 0 ? Math.round((scrollTop / maxScroll) * 100) : 0
    setScrollPercentage(percentage)
    if (percentage >= 80) loadNextChapter()
  }, [loadNextChapter])

  const scrollThrottleRef = useRef<number | null>(null)
  const handleScrollThrottled = useCallback(() => {
    if (scrollThrottleRef.current) return
    scrollThrottleRef.current = window.setTimeout(() => { scrollThrottleRef.current = null; handleScroll() }, 100)
  }, [handleScroll])

  useEffect(() => {
    if (!bookId || effectiveTotalPages <= 0 || currentPage <= 1) return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = window.setTimeout(async () => {
      try {
        await databaseService.saveReadingProgress(bookId, currentPage, effectiveTotalPages, currentChapter ?? undefined)
      } catch (err) { console.error('Auto-save progress error:', err) }
    }, AUTO_SAVE_DEBOUNCE_MS)
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current) }
  }, [bookId, currentPage, effectiveTotalPages, currentChapter])

  useEffect(() => {
    if (!bookId || isLoading) return
    if (scrollProgressSavedRef.current) return

    const restoreProgress = async () => {
      try {
        const progress = await databaseService.getReadingProgress(bookId)
        if (progress && progress.current_page > 1) {
          if (readMode === 'scroll' && scrollContainerRef.current) {
            const maxScroll = scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight
            if (maxScroll > 0 && progress.total_pages > 0) {
              const ratio = progress.current_page / progress.total_pages
              scrollContainerRef.current.scrollTo({ top: ratio * maxScroll })
              showNotification(t('reader.restoredToPage', {0: progress.current_page}))
            }
          } else {
            goToPage(progress.current_page)
            showNotification(t('reader.restoredToPage', {0: progress.current_page}))
          }
          scrollProgressSavedRef.current = true
        }
      } catch (err) { console.error('Auto-restore progress error:', err) }
    }
    restoreProgress()
  }, [bookId, isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (bookId && effectiveTotalPages > 0) {
        try {
          let pageToSave = currentPage
          if (readMode === 'scroll' && scrollContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
            const maxScroll = scrollHeight - clientHeight
            if (maxScroll > 0) {
              pageToSave = Math.round((scrollTop / maxScroll) * effectiveTotalPages)
            }
          }
          await databaseService.saveReadingProgress(bookId, pageToSave, effectiveTotalPages, currentChapter ?? undefined)
        } catch (err) { console.error('Before-unload save error:', err) }
      }
    }
    const currentWindow = getCurrentWindow()
    const unlisten = currentWindow.onCloseRequested(async (_event) => { await handleBeforeUnload() })
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => { window.removeEventListener('beforeunload', handleBeforeUnload); unlisten.then(fn => fn()).catch(() => {}) }
  }, [bookId, currentPage, effectiveTotalPages, currentChapter, readMode])

  const goToChapter = useCallback((chapterNumber: number) => {
    setCurrentChapter(chapterNumber)
    if (sourceType === 'txt') {
      const chapter = txtChapters.find(c => c.chapter_number === chapterNumber)
      if (chapter) {
        let offset = 0
        for (let i = 0; i < txtPages.length; i++) {
          if (offset + txtPages[i].length > chapter.start_offset) { goToPage(i + 1); break }
          offset += txtPages[i].length
        }
      }
    } else if (sourceType === 'md') {
      const chapter = mdChapters.find(c => c.chapter_number === chapterNumber)
      if (!chapter) return
      const headings = (readMode === 'scroll' ? scrollContainerRef.current : contentRef.current)?.querySelectorAll('h1, h2, h3, h4, h5, h6')
      if (!headings) return
      const targetElement = Array.from(headings).find(el => el.textContent?.trim() === chapter.title)
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
          goToPage(Math.floor(relativeTop / viewportHeight) + 1)
        }
      }
    }
  }, [sourceType, txtChapters, txtPages, mdChapters, readMode, goToPage])

  const loadBookmarks = useCallback(async () => {
    if (!bookId) return
    try { setBookmarks(await databaseService.getBookmarks(bookId)) } catch (err) { console.error('Load bookmarks error:', err) }
  }, [bookId])

  useEffect(() => { loadBookmarks() }, [loadBookmarks])

  const handleAddBookmark = useCallback(async () => {
    if (!bookId) return
    const offset = currentPage
    if (bookmarks.find(bm => bm.offset === offset && bm.chapter_id === (currentChapter ?? null))) {
      showNotification(t('reader.bookmarkAlreadyExists')); return
    }
    try {
      const title = t('reader.pageDash', {0: currentPage})
      await databaseService.addBookmark(bookId, currentChapter ?? null, offset, title)
      await loadBookmarks()
      showNotification(t('reader.bookmarkAdded', {0: title}))
    } catch (err) { console.error('Add bookmark error:', err); showNotification(t('reader.bookmarkAddFailed')) }
  }, [bookId, currentPage, currentChapter, bookmarks, loadBookmarks, showNotification, t])

  const handleDeleteBookmark = useCallback(async (bookmarkId: number) => {
    try { await databaseService.deleteBookmark(bookmarkId); await loadBookmarks(); showNotification(t('reader.bookmarkDeleted')) }
    catch (err) { console.error('Delete bookmark error:', err) }
  }, [loadBookmarks, showNotification, t])

  const handleJumpToBookmark = useCallback((bookmark: databaseService.Bookmark) => {
    if (bookmark.offset) goToPage(bookmark.offset)
    setShowBookmarkPanel(false)
  }, [goToPage])

  const loadHighlights = useCallback(async () => {
    if (!bookId) return
    try { setHighlights(await databaseService.getHighlights(bookId)) } catch (err) { console.error('Load highlights error:', err) }
  }, [bookId])

  useEffect(() => { loadHighlights() }, [loadHighlights])

  const handleDeleteHighlight = useCallback(async (highlightId: number) => {
    try { await databaseService.deleteHighlight(highlightId); await loadHighlights(); showNotification(t('reader.highlightDeleted')) }
    catch (err) { console.error('Delete highlight error:', err) }
  }, [loadHighlights, showNotification, t])

  const handleJumpToHighlight = useCallback((highlight: databaseService.Highlight) => {
    if (sourceType === 'txt') {
      let offset = 0
      for (let i = 0; i < txtPages.length; i++) {
        if (offset + txtPages[i].length > highlight.start_offset) { goToPage(i + 1); break }
        offset += txtPages[i].length
      }
    } else if (sourceType === 'pdf') {
      if (highlight.chapter_id) goToPage(highlight.chapter_id)
    } else if (sourceType === 'md') {
      if (effectiveTotalPages > 0 && mdHtml.length > 0) {
        goToPage(Math.max(1, Math.ceil((highlight.start_offset / mdHtml.length) * effectiveTotalPages)))
      }
    }
    setShowHighlightPanel(false)
  }, [sourceType, txtPages, mdHtml, effectiveTotalPages, goToPage])

  const currentPdfPageText = sourceType === 'pdf' && pdfPages.length > 0
    ? (pdfPages.find(p => p.page_number === currentPage)?.text || pdfPages[currentPage - 1]?.text || '')
    : ''

  const currentTxtPageText = sourceType === 'txt' && txtPages.length > 0
    ? txtPages[Math.min(currentPage - 1, txtPages.length - 1)] || ''
    : ''

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setSelectionToolbar(null); setShowColorPicker(false); return
    }
    const selectedText = selection.toString().trim()
    if (!selectedText) return
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    let startOffset = 0
    let endOffset = 0

    if (sourceType === 'txt') {
      let pageOffset = 0
      for (let i = 0; i < currentPage - 1 && i < txtPages.length; i++) pageOffset += txtPages[i].length
      const pageText = txtPages[Math.min(currentPage - 1, txtPages.length - 1)] || ''
      const pageStart = pageText.indexOf(selectedText)
      if (pageStart >= 0) { startOffset = pageOffset + pageStart; endOffset = startOffset + selectedText.length }
      else { startOffset = pageOffset; endOffset = pageOffset + selectedText.length }
    } else if (sourceType === 'pdf') {
      const textStart = currentPdfPageText.indexOf(selectedText)
      if (textStart >= 0) { startOffset = textStart; endOffset = textStart + selectedText.length }
      else { startOffset = 0; endOffset = selectedText.length }
    } else if (sourceType === 'md') {
      const textStart = mdHtml.indexOf(selectedText)
      if (textStart >= 0) { startOffset = textStart; endOffset = textStart + selectedText.length }
      else { startOffset = 0; endOffset = selectedText.length }
    }

    setSelectionToolbar({ visible: true, top: rect.top - 44, left: rect.left + rect.width / 2, selectedText, startOffset, endOffset })
    setShowColorPicker(false)
    setNoteInput({ visible: false, color: HIGHLIGHT_COLORS[0] })
  }, [sourceType, currentPage, txtPages, currentPdfPageText, mdHtml])

  const handleHighlightWithColor = useCallback(async (color: string) => {
    if (!bookId || !selectionToolbar) return
    try {
      await databaseService.addHighlight(bookId, currentChapter ?? null, selectionToolbar.startOffset, selectionToolbar.endOffset, selectionToolbar.selectedText, null, color)
      await loadHighlights()
      showNotification(t('reader.highlightAdded'))
      setSelectionToolbar(null); setShowColorPicker(false); window.getSelection()?.removeAllRanges()
    } catch (err) { console.error('Add highlight error:', err); showNotification(t('reader.highlightAddFailed')) }
  }, [bookId, selectionToolbar, currentChapter, loadHighlights, showNotification])

  const handleAddNote = useCallback(async (note: string) => {
    if (!bookId || !selectionToolbar) return
    try {
      await databaseService.addHighlight(bookId, currentChapter ?? null, selectionToolbar.startOffset, selectionToolbar.endOffset, selectionToolbar.selectedText, note, noteInput.color)
      await loadHighlights()
      showNotification(t('reader.noteAdded'))
      setSelectionToolbar(null); setNoteInput({ visible: false, color: HIGHLIGHT_COLORS[0] }); window.getSelection()?.removeAllRanges()
    } catch (err) { console.error('Add note error:', err); showNotification(t('reader.noteAddFailed')) }
  }, [bookId, selectionToolbar, currentChapter, noteInput.color, loadHighlights, showNotification])

  useEffect(() => {
    if (!isResizingSidebar) return
    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarResizeRef.current) return
      const { startX, startWidth } = sidebarResizeRef.current
      setSidebarWidth(Math.max(200, Math.min(500, startWidth + (startX - e.clientX))))
    }
    const handleMouseUp = () => { setIsResizingSidebar(false); sidebarResizeRef.current = null; document.body.style.cursor = ''; document.body.style.userSelect = '' }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); document.body.style.cursor = ''; document.body.style.userSelect = '' }
  }, [isResizingSidebar])

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current)
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [])

  const goPrevChapter = () => {
    if (chapters.length === 0) { goPrev(); return }
    const target = (currentChapter ?? 1) - 1
    if (target >= 1) goToChapter(target)
  }

  const goNextChapter = () => {
    if (chapters.length === 0) { goNext(); return }
    const target = (currentChapter ?? 1) + 1
    if (target <= chapters.length) goToChapter(target)
  }

  const applyHighlightsToText = useCallback((text: string, pageNumber: number): React.ReactNode[] => {
    if (highlights.length === 0) return [text]
    const relevantHighlights: Array<{ start: number; end: number; color: string; id: number }> = []

    if (sourceType === 'txt') {
      let pageStartOffset = 0
      for (let i = 0; i < pageNumber - 1 && i < txtPages.length; i++) pageStartOffset += txtPages[i].length
      const pageEndOffset = pageStartOffset + text.length
      for (const h of highlights) {
        if (h.end_offset <= pageStartOffset || h.start_offset >= pageEndOffset) continue
        relevantHighlights.push({ start: Math.max(0, h.start_offset - pageStartOffset), end: Math.min(text.length, h.end_offset - pageStartOffset), color: h.color, id: h.id! })
      }
    } else if (sourceType === 'pdf') {
      for (const h of highlights) {
        if (h.start_offset < text.length) relevantHighlights.push({ start: h.start_offset, end: Math.min(h.end_offset, text.length), color: h.color, id: h.id! })
      }
    }

    if (relevantHighlights.length === 0) return [text]
    relevantHighlights.sort((a, b) => a.start - b.start)
    const parts: React.ReactNode[] = []
    let lastEnd = 0
    for (const hl of relevantHighlights) {
      if (hl.start > lastEnd) parts.push(text.substring(lastEnd, hl.start))
      if (hl.start < lastEnd) continue
      parts.push(<mark key={`hl-${hl.id}`} className="bg-accent/30 text-text-primary rounded-sm px-0.5">{text.substring(hl.start, hl.end)}</mark>)
      lastEnd = hl.end
    }
    if (lastEnd < text.length) parts.push(text.substring(lastEnd))
    return parts
  }, [highlights, sourceType, txtPages])

  const renderAnnotatedText = useCallback((text: string, pageNumber: number): React.ReactNode[] => {
    return applyHighlightsToText(text, pageNumber)
  }, [applyHighlightsToText])

  const progressPercent = effectiveTotalPages > 0 ? Math.round((currentPage / effectiveTotalPages) * 100) : 0

  const renderContent = () => {
    const contentStyle: React.CSSProperties = {
      fontSize: `${fontSize}px`,
      lineHeight: lineHeight,
      color: themeColors.text,
      fontFamily: fontCss,
    }

    if (isLoading) {
      return <div className="flex-1 flex items-center justify-center bg-bg-main"><p className="text-text-secondary">{t('reader.loading')}</p></div>
    }

    if (error) {
      return <div className="flex-1 flex items-center justify-center bg-bg-main"><p className="text-red-400">{error}</p></div>
    }

    if (readMode === 'scroll') {
      const sortedChapters = Array.from(loadedChapterNumbers).sort((a, b) => a - b)
      return (
        <div className="flex-1 relative bg-bg-main">
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto h-full" onScroll={handleScrollThrottled} onMouseUp={handleMouseUp}>
            <div className="mx-auto" style={{ maxWidth: '800px', padding: '32px 40px', ...contentStyle }}>
              {sourceType === 'pdf' && (chapters.length === 0 ? (
                pdfPages.map(page => (
                  <div key={page.page_number} style={{ marginBottom: '2em' }}>
                    <div className="text-text-secondary text-xs text-center opacity-60 mb-2">— {t('reader.pageDash', {0: page.page_number})} —</div>
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {highlights.length > 0 ? renderAnnotatedText(page.text || t('reader.noTextOnPage'), page.page_number) : (page.text || t('reader.noTextOnPage'))}
                    </div>
                  </div>
                ))
              ) : (
                sortedChapters.map(chNum => {
                  const chapter = chapters.find(c => c.chapter_number === chNum)
                  const text = scrollChapterCacheRef.current.get(chNum) || ''
                  return (
                    <div key={chNum} style={{ marginBottom: '2em' }}>
                      {chapter && <div className="text-text-secondary text-sm font-semibold mb-3 pb-2 border-b border-border-1">{chapter.title}</div>}
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{highlights.length > 0 ? renderAnnotatedText(text, chNum) : text}</div>
                    </div>
                  )
                })
              ))}
              {sourceType === 'txt' && (chapters.length === 0 ? (
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{highlights.length > 0 ? renderAnnotatedText(txtText, currentPage) : txtText}</div>
              ) : (
                sortedChapters.map(chNum => {
                  const chapter = chapters.find(c => c.chapter_number === chNum)
                  const text = scrollChapterCacheRef.current.get(chNum) || ''
                  return (
                    <div key={chNum} style={{ marginBottom: '2em' }}>
                      {chapter && <div className="text-text-secondary text-sm font-semibold mb-3 pb-2 border-b border-border-1">{chapter.title}</div>}
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{highlights.length > 0 ? renderAnnotatedText(text, chNum) : text}</div>
                    </div>
                  )
                })
              ))}
              {sourceType === 'md' && (
                <div className="novel-md-content" style={{ '--md-code-bg': themeColors.codeBg, '--md-quote-border': themeColors.quoteBorder, '--md-link': themeColors.linkColor, '--md-border': themeColors.border } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: mdHtml }} />
              )}
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }} className="fixed bottom-12 right-8 w-10 h-10 bg-accent text-accent-text rounded-full shadow-lg flex items-center justify-center hover:bg-accent-hover transition-colors text-lg font-bold z-20" title={t('reader.backToTop')}>↑</button>
        </div>
      )
    }

    if (readMode === 'single') {
      return (
        <div className="flex-1 flex items-center justify-center relative group bg-bg-main" onMouseUp={handleMouseUp}>
          <div ref={contentRef} className="overflow-hidden" style={{ maxWidth: '800px', width: '100%', height: '100%', padding: '32px 40px', ...contentStyle, overflowY: sourceType === 'md' ? 'hidden' : undefined }}>
            {sourceType === 'pdf' && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderAnnotatedText(currentPdfPageText || t('reader.noTextOnPage'), currentPage)}</div>}
            {sourceType === 'txt' && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderAnnotatedText(currentTxtPageText || t('reader.blankPage'), currentPage)}</div>}
            {sourceType === 'md' && <div className="novel-md-content" style={{ '--md-code-bg': themeColors.codeBg, '--md-quote-border': themeColors.quoteBorder, '--md-link': themeColors.linkColor, '--md-border': themeColors.border } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: mdHtml }} />}
          </div>
          <button onClick={chapters.length > 0 ? goPrevChapter : goPrev} disabled={chapters.length > 0 ? (currentChapter ?? 1) <= 1 : currentPage <= 1} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-bg-panel/80 hover:bg-bg-panel text-text-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 z-10" title={chapters.length > 0 ? t('reader.previousChapter') : t('reader.previousPage')} aria-label={chapters.length > 0 ? t('reader.previousChapter') : t('reader.previousPage')}>
            <RxChevronLeft className="w-6 h-6" />
          </button>
          <button onClick={chapters.length > 0 ? goNextChapter : goNext} disabled={chapters.length > 0 ? (currentChapter ?? 1) >= chapters.length : currentPage >= effectiveTotalPages} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-bg-panel/80 hover:bg-bg-panel text-text-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 z-10" title={chapters.length > 0 ? t('reader.nextChapter') : t('reader.nextPage')} aria-label={chapters.length > 0 ? t('reader.nextChapter') : t('reader.nextPage')}>
            <RxChevronRight className="w-6 h-6" />
          </button>
        </div>
      )
    }

    if (readMode === 'spread') {
      const leftPage = currentPage
      const rightPage = Math.min(currentPage + 1, effectiveTotalPages)
      const isSingleRender = leftPage === rightPage
      const getTxtPageText = (page: number) => page < 1 || page > txtPages.length ? '' : txtPages[page - 1]
      const getPdfPageText = (page: number) => page < 1 || page > pdfPages.length ? '' : pdfPages[page - 1].text || ''

      return (
        <div className="flex-1 flex items-center justify-center relative group bg-bg-main" onMouseUp={handleMouseUp}>
          <div className="flex gap-6 overflow-hidden" style={{ maxWidth: '1400px', width: '100%', height: '100%', padding: '32px 24px' }}>
            <div className="flex-1 overflow-hidden" style={{ ...contentStyle, overflowY: sourceType === 'md' ? 'hidden' : undefined }}>
              {sourceType === 'pdf' && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderAnnotatedText(getPdfPageText(leftPage) || t('reader.noTextOnPage'), leftPage)}</div>}
              {sourceType === 'txt' && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderAnnotatedText(getTxtPageText(leftPage) || t('reader.blankPage'), leftPage)}</div>}
              {sourceType === 'md' && leftPage === currentPage && <div className="novel-md-content" style={{ '--md-code-bg': themeColors.codeBg, '--md-quote-border': themeColors.quoteBorder, '--md-link': themeColors.linkColor, '--md-border': themeColors.border } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: mdHtml }} />}
            </div>
            {!isSingleRender && (
              <div className="flex-1 overflow-hidden border-l border-border-1 pl-6" style={contentStyle}>
                {sourceType === 'pdf' && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderAnnotatedText(getPdfPageText(rightPage) || t('reader.noTextOnPage'), rightPage)}</div>}
                {sourceType === 'txt' && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderAnnotatedText(getTxtPageText(rightPage) || t('reader.blankPage'), rightPage)}</div>}
              </div>
            )}
          </div>
          <button onClick={() => goPrev()} disabled={currentPage <= 1} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-bg-panel/80 hover:bg-bg-panel text-text-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 z-10" title={t('reader.previousPage')} aria-label={t('reader.previousPage')}>
            <RxChevronLeft className="w-6 h-6" />
          </button>
          <button onClick={() => goNext()} disabled={currentPage >= effectiveTotalPages} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-bg-panel/80 hover:bg-bg-panel text-text-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 z-10" title={t('reader.nextPage')} aria-label={t('reader.nextPage')}>
            <RxChevronRight className="w-6 h-6" />
          </button>
        </div>
      )
    }
  }

  const isBookmarked = bookmarks.some(b => b.offset === currentPage)

  return (
    <div className="h-full w-full bg-bg-main flex flex-col overflow-hidden">
      <style>{MD_CONTENT_STYLES}</style>

      {/* Top toolbar */}
      <div className="flex items-center justify-between px-3 bg-bg-panel border-b border-border-1 h-10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-text-primary text-sm font-medium truncate">{bookTitle}</span>
          {notification && <span className="text-sm font-medium flex-shrink-0 text-accent">{notification}</span>}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Bookmark toggle */}
          <button onClick={(e) => { e.stopPropagation(); setShowBookmarkPanel(!showBookmarkPanel); setShowHighlightPanel(false) }} className={`px-2 py-1 rounded text-sm transition-colors ${showBookmarkPanel ? 'bg-accent text-accent-text' : 'bg-bg-hover hover:bg-toolbar-hover-bg text-text-primary'}`} title={t('reader.bookmarks')}>
            <RxBookmark className="w-4 h-4" />
          </button>

          {/* Highlight toggle */}
          <button onClick={(e) => { e.stopPropagation(); setShowHighlightPanel(!showHighlightPanel); setShowBookmarkPanel(false) }} className={`px-2 py-1 rounded text-sm transition-colors ${showHighlightPanel ? 'bg-accent text-accent-text' : 'bg-bg-hover hover:bg-toolbar-hover-bg text-text-primary'}`} title={t('reader.highlightAndNotes')}>
            <RxPencil1 className="w-4 h-4" />
          </button>

          {/* Read mode */}
          <div className="flex items-center gap-1 bg-bg-input border border-border-1 rounded px-1 py-0.5">
            {(['scroll', 'single', 'spread'] as ReadMode[]).map(mode => (
              <button key={mode} onClick={(e) => { e.stopPropagation(); e.preventDefault(); setReadMode(mode) }} className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${readMode === mode ? 'bg-accent text-accent-text' : 'text-text-secondary hover:text-text-primary'}`} title={mode === 'scroll' ? t('reader.scrollMode') : mode === 'single' ? t('reader.singlePageMode') : t('reader.spreadMode')}>
                {mode === 'scroll' ? t('reader.scroll') : mode === 'single' ? t('reader.singlePage') : t('reader.spread')}
              </button>
            ))}
          </div>

          {/* Font family */}
          <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="bg-bg-input border border-border-1 rounded px-1.5 py-1 text-xs text-text-primary outline-none cursor-pointer" title={t('reader.fontFamily')}>
            {FONT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{t(`reader.${opt.label}`)}</option>
            ))}
          </select>

          {/* Font size */}
          <div className="flex items-center gap-2 bg-bg-input border border-border-1 rounded px-2 py-1">
            <span className="text-text-secondary text-xs font-medium">A</span>
            <input type="range" min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} step={FONT_SIZE_STEP} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="page-slider" style={{ width: '70px', '--slider-fill': `${((fontSize - FONT_SIZE_MIN) / (FONT_SIZE_MAX - FONT_SIZE_MIN)) * 100}%` } as React.CSSProperties} aria-label={t('reader.fontSize')} />
            <span className="text-text-secondary text-xs min-w-[22px] text-center">{fontSize}</span>
          </div>

          {/* Line height */}
          <div className="flex items-center gap-2 bg-bg-input border border-border-1 rounded px-2 py-1">
            <span className="text-text-secondary text-xs font-medium">{t('reader.lineHeight')[0]}</span>
            <input type="range" min={LINE_HEIGHT_MIN} max={LINE_HEIGHT_MAX} step={LINE_HEIGHT_STEP} value={lineHeight} onChange={(e) => setLineHeight(Number(e.target.value))} className="page-slider" style={{ width: '70px', '--slider-fill': `${((lineHeight - LINE_HEIGHT_MIN) / (LINE_HEIGHT_MAX - LINE_HEIGHT_MIN)) * 100}%` } as React.CSSProperties} aria-label={t('reader.lineHeight')} />
            <span className="text-text-secondary text-xs min-w-[28px] text-center">{lineHeight.toFixed(1)}</span>
          </div>

          {/* Theme */}
          <div className="flex items-center gap-1 bg-bg-input border border-border-1 rounded px-1.5 py-1">
            {(['dark', 'light', 'sepia'] as ThemeMode[]).map(themeMode => (
              <button key={themeMode} onClick={(e) => { e.stopPropagation(); setTheme(themeMode) }} className={`w-5 h-5 rounded-full border-2 transition-colors ${theme === themeMode ? 'border-accent' : 'border-border-2 hover:border-border-1'}`} style={{ backgroundColor: THEMES[themeMode].bg }} title={themeMode === 'dark' ? t('reader.darkTheme') : themeMode === 'light' ? t('reader.lightTheme') : t('reader.sepiaTheme')} />
            ))}
          </div>

          {/* Chapter panel */}
          {chapters.length > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setShowChapterPanel(!showChapterPanel); setShowBookmarkPanel(false); setShowHighlightPanel(false) }} className={`px-3 py-1 rounded text-sm transition-colors ${showChapterPanel ? 'bg-accent text-accent-text font-medium' : 'bg-bg-hover hover:bg-toolbar-hover-bg text-text-primary'}`} title={t('reader.chapterList')}>
              {t('reader.chapter')}
            </button>
          )}
        </div>
      </div>

      {/* Selection toolbar */}
      {selectionToolbar && selectionToolbar.visible && (
        <div className="fixed z-50 flex items-center gap-1 rounded-lg shadow-xl px-2 py-1.5 bg-bg-card border border-border-1" style={{ top: `${selectionToolbar.top}px`, left: `${Math.max(8, Math.min(selectionToolbar.left - 80, window.innerWidth - 200))}px` }}>
          <div className="relative">
            <button onClick={() => setShowColorPicker(!showColorPicker)} className="px-2 py-1 rounded text-xs font-medium transition-colors bg-bg-hover text-text-primary border border-border-1" title={t('reader.highlight')}>{t('reader.highlight')}</button>
            {showColorPicker && (
              <div className="absolute top-full left-0 mt-1 flex gap-1 p-1.5 rounded shadow-xl z-50 bg-bg-card border border-border-1">
                {HIGHLIGHT_COLORS.map(color => (
                  <button key={color} onClick={() => handleHighlightWithColor(color)} className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 bg-bg-main" style={{ backgroundColor: color, borderColor: '#1A1A1A' }} />
                ))}
              </div>
            )}
          </div>
          <button onClick={() => { setNoteInput({ visible: true, color: noteInput.color }); setTimeout(() => noteTextareaRef.current?.focus(), 50) }} className="px-2 py-1 rounded text-xs font-medium transition-colors bg-bg-hover text-text-primary border border-border-1" title={t('reader.note')}>{t('reader.note')}</button>
          <button onClick={() => { setSelectionToolbar(null); setShowColorPicker(false); window.getSelection()?.removeAllRanges() }} className="text-text-muted hover:text-text-primary px-1"><RxCross2 className="w-3 h-3" /></button>
        </div>
      )}

      {/* Note input popup */}
      {noteInput.visible && selectionToolbar && (
        <div className="fixed z-50 rounded-lg shadow-xl p-3 bg-bg-card border border-border-1" style={{ top: `${selectionToolbar.top - 120}px`, left: `${Math.max(8, Math.min(selectionToolbar.left - 100, window.innerWidth - 260))}px`, width: '240px' }}>
          <div className="flex items-center gap-1 mb-2">
            <span className="text-text-secondary text-[11px]">{t('reader.color')}</span>
            {HIGHLIGHT_COLORS.map(color => (
              <button key={color} onClick={() => setNoteInput(prev => ({ ...prev, color }))} className="w-4 h-4 rounded-full border-2 transition-transform" style={{ backgroundColor: color, borderColor: noteInput.color === color ? '#E0E0E0' : '#1A1A1A' }} />
            ))}
          </div>
          <textarea ref={noteTextareaRef} placeholder={t('reader.addNotePlaceholder')} className="w-full rounded px-2 py-1.5 text-sm resize-none outline-none bg-bg-input text-text-primary border border-border-1" style={{ height: '60px' }} onKeyDown={(e) => { if (e.key === 'Escape') setNoteInput({ visible: false, color: HIGHLIGHT_COLORS[0] }); e.stopPropagation() }} aria-label={t('reader.note')} />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setNoteInput({ visible: false, color: HIGHLIGHT_COLORS[0] })} className="px-2 py-1 rounded text-xs text-text-secondary">{t('reader.cancel')}</button>
            <button onClick={() => handleAddNote(noteTextareaRef.current?.value || '')} className="px-3 py-1 rounded text-xs font-medium bg-accent text-accent-text">{t('reader.save')}</button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {renderContent()}

        {/* Chapter sidebar */}
        {showChapterPanel && chapters.length > 0 && (
          <div className="flex-shrink-0 bg-bg-panel border-l border-border-1 flex flex-col overflow-hidden relative" style={{ width: `${sidebarWidth}px` }}>
            <div className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 z-10 transition-colors" onMouseDown={(e) => { e.preventDefault(); sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth }; setIsResizingSidebar(true) }} />
            <div className="p-2 border-b border-border-1 flex items-center justify-between">
              <span className="text-text-primary text-xs font-medium">{t('reader.chapterList')}</span>
              <button onClick={() => setShowChapterPanel(false)} className="text-text-muted hover:text-text-primary" aria-label={t('reader.closeChapterPanel')}><RxCross2 className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {chapters.map(ch => {
                const indentLevel = sourceType === 'md' ? (ch as databaseService.MdChapter).level || 1 : 1
                return (
                  <button key={ch.chapter_number} onClick={() => goToChapter(ch.chapter_number)} className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${currentChapter === ch.chapter_number ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}`} style={{ paddingLeft: `${indentLevel * 12 + 12}px` }}>
                    {ch.title}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Bookmark sidebar */}
        {showBookmarkPanel && (
          <div className="flex-shrink-0 bg-bg-panel border-l border-border-1 flex flex-col overflow-hidden relative" style={{ width: `${sidebarWidth}px` }}>
            <div className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 z-10 transition-colors" onMouseDown={(e) => { e.preventDefault(); sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth }; setIsResizingSidebar(true) }} />
            <div className="p-2 border-b border-border-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-text-primary text-xs font-medium">{t('reader.bookmarks')}</span>
                <button onClick={handleAddBookmark} className={`px-2 py-0.5 rounded text-xs transition-colors ${isBookmarked ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-accent hover:bg-bg-hover border border-border-1'}`} title={t('reader.addBookmark')} aria-label={t('reader.addBookmark')}>{t('reader.addBookmark')}</button>
              </div>
              <button onClick={() => setShowBookmarkPanel(false)} className="text-text-muted hover:text-text-primary" aria-label={t('reader.closeBookmarkPanel')}><RxCross2 className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {bookmarks.length === 0 ? (
                <p className="text-center py-4 text-xs text-text-muted">{t('reader.noBookmarks')}</p>
              ) : (
                bookmarks.map(bm => (
                  <div key={bm.id} className="flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors hover:bg-bg-hover group">
                    <RxBookmarkFilled className="w-3 h-3 flex-shrink-0 text-accent" />
                    <button onClick={() => handleJumpToBookmark(bm)} className="flex-1 text-left text-text-secondary hover:text-text-primary truncate">{bm.title}</button>
                    <span className="text-[11px] text-text-muted flex-shrink-0">{t('reader.pageDash', {0: bm.offset ?? 0})}</span>
                    <span className="text-[10px] text-text-muted flex-shrink-0">{bm.created_at ? new Date(bm.created_at).toLocaleDateString() : ''}</span>
                    <button onClick={() => bm.id && handleDeleteBookmark(bm.id)} className="text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" title={t('reader.deleteBookmark')}><RxCross2 className="w-3 h-3" /></button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Highlight sidebar */}
        {showHighlightPanel && (
          <div className="flex-shrink-0 bg-bg-panel border-l border-border-1 flex flex-col overflow-hidden relative" style={{ width: `${sidebarWidth}px` }}>
            <div className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 z-10 transition-colors" onMouseDown={(e) => { e.preventDefault(); sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth }; setIsResizingSidebar(true) }} />
            <div className="p-2 border-b border-border-1 flex items-center justify-between">
              <span className="text-text-primary text-xs font-medium">{t('reader.highlightAndNotes')}</span>
              <button onClick={() => setShowHighlightPanel(false)} className="text-text-muted hover:text-text-primary" aria-label={t('reader.closeHighlightPanel')}><RxCross2 className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {highlights.length === 0 ? (
                <p className="text-center py-4 text-xs text-text-muted">{t('reader.noHighlights')}</p>
              ) : (
                highlights.map(hl => (
                  <div key={hl.id} className="flex items-start gap-2 px-3 py-2 rounded text-sm transition-colors hover:bg-bg-hover group mb-1" style={{ borderLeft: `3px solid ${hl.color}` }}>
                    <button onClick={() => handleJumpToHighlight(hl)} className="flex-1 text-left">
                      <p className="truncate text-text-primary text-xs leading-snug">{hl.text_content || t('reader.noText')}</p>
                      {hl.note && <p className="mt-1 truncate text-[11px] text-text-secondary italic">{t('reader.noteLabel')}{hl.note}</p>}
                      <span className="text-[10px] text-text-muted">{t('reader.pageDash', {0: hl.start_offset})} · {hl.created_at ? new Date(hl.created_at).toLocaleDateString() : ''}</span>
                    </button>
                    <button onClick={() => hl.id && handleDeleteHighlight(hl.id)} className="text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" title={t('reader.deleteHighlight')}><RxCross2 className="w-3 h-3" /></button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom info bar */}
      <div className="flex-shrink-0 flex items-center select-none h-8 bg-bg-panel border-t border-border-1">
        <div className="flex-1 px-3 flex items-center gap-2">
          <span className="text-[11px] text-text-muted">
            {readMode === 'scroll' ? t('reader.scrollMode') : readMode === 'single' ? t('reader.singlePageMode') : t('reader.spreadMode')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {readMode === 'scroll' ? (
            <span className="text-sm text-text-primary">{scrollPercentage}%</span>
          ) : (
            <>
              <span className="text-sm text-text-primary">{currentPage}</span>
              <span className="text-sm text-text-muted mx-1">/</span>
              <span className="text-sm text-text-primary">{effectiveTotalPages}</span>
              <span className="text-[11px] text-text-muted ml-1">({progressPercent}%)</span>
            </>
          )}
        </div>
        <div className="flex-1 px-3 text-right">
          <span className="text-[11px] text-text-muted">{sourceType.toUpperCase()}</span>
        </div>
      </div>

      {/* Page slider */}
      {(readMode === 'single' || readMode === 'spread') && effectiveTotalPages > 1 && (
        <div className="flex-shrink-0 flex items-center gap-3 px-3 select-none h-8 bg-bg-panel border-t border-border-1">
          <span className="text-xs text-text-secondary font-medium min-w-[20px]">1</span>
          <input type="range" min={1} max={effectiveTotalPages} value={currentPage} onChange={(e) => goToPage(Number(e.target.value))} className="page-slider flex-1" style={{ '--slider-fill': `${((currentPage - 1) / Math.max(1, effectiveTotalPages - 1)) * 100}%` } as React.CSSProperties} aria-label={t('reader.pageSlider')} />
          <span className="text-xs text-text-secondary font-medium min-w-[20px]">{effectiveTotalPages}</span>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-700 rounded-lg shadow-xl px-4 py-2 text-sm text-red-100 max-w-md">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-100"><RxCross2 className="w-4 h-4 inline" /></button>
        </div>
      )}
    </div>
  )
}

export default ReaderView
