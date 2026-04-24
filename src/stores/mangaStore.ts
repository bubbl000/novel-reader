import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { saveBookMetadata, batchSaveBookMetadata, getAllBooksMetadata, getBookIdByPath, getBookByPath, BookMetadata, Tag } from '../services/databaseService'
import { SourceType } from '../types/sourceType'

let globalDropCallback: ((paths: string[]) => void) | null = null

export function setDropCallback(cb: (paths: string[]) => void) {
  globalDropCallback = cb
}

let dragDropInitialized = false
export function initDragDropListener() {
  if (dragDropInitialized) return
  dragDropInitialized = true

  listen<string[]>('tauri://file-drop', (event) => {
    if (globalDropCallback) {
      globalDropCallback(event.payload)
    }
  })
}

export interface FolderNode {
  id: string
  name: string
  path: string
  isExpanded: boolean
  isSelected: boolean
  count: number
  children: FolderNode[]
}

export interface BookItem {
  id: string
  title: string
  path: string
  folderPath: string
  sourceType: SourceType
  isFavorite: boolean
  currentPage: number
  totalPages: number
  addedDate: string
  lastOpened: string
  formatText: string
  fileSizeText: string
  progressPercentage: number
  author: string
  wordCount: number
  chapterCount: number
}

interface BookStore {
  bookList: BookItem[]
  filteredBookList: BookItem[]
  pagedBookList: BookItem[]
  folderTree: FolderNode[]
  libraryPaths: string[]
  isLoading: boolean
  isScanning: boolean
  error: string | null
  searchQuery: string
  currentViewMode: 'library' | 'favorites' | 'tags'
  showTagCloud: boolean
  showTagManagement: boolean
  selectedFolder: string | null
  selectedFolderName: string
  selectedBook: BookItem | null
  selectedTag: string | null
  bookTags: Tag[]
  allTags: Tag[]
  currentPage: number
  pageSize: number
  isPaginationMode: boolean
  totalCount: number
  totalFilteredCount: number
  totalPages: number
  sortBy: string
  coverSize: number

  loadLibrary: () => Promise<void>
  addLibraryPath: (path: string) => Promise<void>
  removeLibraryPath: (path: string) => Promise<void>
  scanAndLoad: () => Promise<void>
  saveToDatabase: (book: BookItem) => Promise<void>
  updateReadingProgress: (bookId: string, currentPage: number, totalPages: number, bookPath?: string) => Promise<void>
  toggleFavorite: (book: BookItem) => Promise<void>
  selectFolder: (folderPath: string) => void
  selectBook: (book: BookItem | null) => Promise<void>
  setSearchQuery: (query: string) => void
  setViewMode: (mode: 'library' | 'favorites' | 'tags') => void
  toggleTagCloud: () => void
  toggleTagManagement: () => void
  setSortBy: (sortBy: string) => void
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  togglePaginationMode: () => void
  setCoverSize: (size: number) => void
  applyFilters: () => Promise<void>
  loadBookTags: (book: BookItem) => Promise<void>
  addTag: (book: BookItem, tagName: string) => Promise<void>
  removeTag: (book: BookItem, tagId: number) => Promise<void>
  loadAllTags: () => Promise<void>
  selectTag: (tagName: string | null) => Promise<void>
  loadFavorites: () => Promise<void>
}

function buildFolderTree(paths: string[], bookList: BookItem[], allFolderPaths: string[] = []): FolderNode[] {
  if (paths.length === 0) return []

  const rootName = paths[0]

  const bookCountMap = new Map<string, number>()
  bookList.forEach(b => {
    bookCountMap.set(b.folderPath, (bookCountMap.get(b.folderPath) || 0) + 1)
  })

  const folderSet = new Set(allFolderPaths)
  bookCountMap.forEach((_, folder) => folderSet.add(folder))

  const nodes: FolderNode[] = []
  const pathToNode = new Map<string, FolderNode>()

  const foldersWithDepth = Array.from(folderSet)
    .filter(f => f.startsWith(rootName) && f !== rootName)
    .map(f => ({ path: f, depth: f.split(/[\\/]/).length }))
    .sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth
      return a.path.localeCompare(b.path)
    })

  foldersWithDepth.forEach(({ path: folderPath }) => {
    const relativePath = folderPath.substring(rootName.length).replace(/^[\\/]/, '')
    const parts = relativePath.split(/[\\/]/)
    const folderName = parts[parts.length - 1]

    const parentRelativePath = parts.slice(0, -1).join('\\')
    const parentFullPath = rootName + '\\' + parentRelativePath
    const parentNode = pathToNode.get(parentFullPath)

    const node: FolderNode = {
      id: folderPath,
      name: folderName,
      path: folderPath,
      isExpanded: false,
      isSelected: false,
      count: bookCountMap.get(folderPath) || 0,
      children: [],
    }

    if (parentNode) {
      parentNode.children.push(node)
    } else {
      nodes.push(node)
    }

    pathToNode.set(folderPath, node)
  })

  const lastSepIndex = Math.max(rootName.lastIndexOf('\\'), rootName.lastIndexOf('/'))
  const rootFolderName = lastSepIndex >= 0 ? rootName.substring(lastSepIndex + 1) : rootName

  return [{
    id: rootName,
    name: rootFolderName,
    path: rootName,
    isExpanded: true,
    isSelected: true,
    count: bookList.length,
    children: nodes.sort((a, b) => a.name.localeCompare(b.name)),
  }]
}

interface ScanAndBuildParams {
  paths: string[]
  setLoading: (loading: boolean) => void
  onComplete: () => void
}

interface ScanBuildResult {
  bookList: BookItem[]
  bookMetadataList: BookMetadata[]
  folderTree: FolderNode[]
  totalCount: number
  totalPages: number
  pagedBookList: BookItem[]
}

async function scanAndBuildBookList(params: ScanAndBuildParams): Promise<ScanBuildResult> {
  const { paths, setLoading, onComplete } = params
  setLoading(true)

  try {
    const allBooks: BookItem[] = []
    const allBookMetadata: BookMetadata[] = []

    const scanResults = await Promise.allSettled(
      paths.map(async (path) => {
        const result = await invoke<{
          books: Array<{ path: string; title: string; source_type: string }>
          error: string | null
        }>('scan_directory', { directory: path })
        return { path, result }
      })
    )

    for (const scanResult of scanResults) {
      if (scanResult.status === 'rejected') {
        console.error('扫描目录失败:', scanResult.reason)
        continue
      }
      const { result } = scanResult.value
      if (result.books) {
        for (const book of result.books) {
          const folderPath =
            book.path.substring(0, Math.max(book.path.lastIndexOf('\\'), book.path.lastIndexOf('/')))

          const formatText =
            book.source_type === 'pdf'
              ? 'PDF'
              : book.source_type === 'txt'
              ? 'TXT'
              : book.source_type === 'md'
              ? 'MD'
              : book.source_type.toUpperCase()

          const bookItem: BookItem = {
            id: '0',
            title: book.title,
            path: book.path,
            folderPath,
            sourceType: book.source_type as SourceType,
            isFavorite: false,
            currentPage: 0,
            totalPages: 0,
            addedDate: new Date().toISOString(),
            lastOpened: '',
            formatText,
            fileSizeText: '',
            progressPercentage: 0,
            author: '',
            wordCount: 0,
            chapterCount: 0,
          }
          allBooks.push(bookItem)

          allBookMetadata.push({
            path: book.path,
            title: book.title,
            source_type: book.source_type,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }
      }
    }

    if (allBookMetadata.length > 0) {
      const dbIds = await batchSaveBookMetadata(allBookMetadata)
      allBooks.forEach((book, i) => {
        if (i < dbIds.length) {
          book.id = String(dbIds[i])
        }
      })
    }

    const allDbBooks = await getAllBooksMetadata()
    const progressMap = new Map<string, { current_page: number; total_pages: number }>()
    allDbBooks.forEach(b => {
      if (b.path) {
        progressMap.set(b.path, {
          current_page: b.current_page || 0,
          total_pages: b.total_pages || 0,
        })
      }
    })
    allBooks.forEach(book => {
      const progress = progressMap.get(book.path)
      if (progress) {
        book.currentPage = progress.current_page
        book.totalPages = progress.total_pages
        book.progressPercentage = progress.total_pages > 0 ? (progress.current_page / progress.total_pages) * 100 : 0
      }
    })

    let allSubfolders: string[] = []
    if (paths.length > 0) {
      try {
        allSubfolders = await invoke<string[]>('get_all_subfolders', { rootPath: paths[0] })
      } catch (e) {
        console.error('获取子文件夹列表失败:', e)
      }
    }

    const folderTree = buildFolderTree(paths, allBooks, allSubfolders)

    const favBooks = await invoke<BookMetadata[]>('get_favorite_books')
    const favPaths = new Set(favBooks.map(b => b.path))
    const updatedBooks = allBooks.map(b => ({
      ...b,
      isFavorite: favPaths.has(b.path),
    }))

    const totalCount = updatedBooks.length
    const totalPages = Math.max(1, Math.ceil(totalCount / 50))
    const paged = updatedBooks.slice(0, 50)

    setLoading(false)
    onComplete()

    return {
      bookList: updatedBooks,
      bookMetadataList: allBookMetadata,
      folderTree,
      totalCount,
      totalPages,
      pagedBookList: paged,
    }
  } catch (e) {
    setLoading(false)
    throw e
  }
}

export const useMangaStore = create<BookStore>((set, get) => ({
  bookList: [],
  filteredBookList: [],
  pagedBookList: [],
  folderTree: [],
  libraryPaths: [],
  isLoading: false,
  isScanning: false,
  error: null,
  searchQuery: '',
  currentViewMode: 'library',
  showTagCloud: false,
  showTagManagement: false,
  selectedFolder: null,
  selectedFolderName: '',
  selectedBook: null,
  selectedTag: null,
  bookTags: [],
  allTags: [],
  currentPage: 1,
  pageSize: 20,
  isPaginationMode: true,
  totalCount: 0,
  totalFilteredCount: 0,
  totalPages: 0,
  sortBy: 'name',
  coverSize: 180,

  loadLibrary: async () => {
    set({ isLoading: true, error: null })
    try {
      const settings = await invoke<{ library_paths: string[] }>('load_settings')
      const paths = settings.library_paths || []
      set({ libraryPaths: paths })

      if (paths.length > 0) {
        set({ selectedFolder: paths[0], selectedFolderName: paths[0] })
      }

      const result = await scanAndBuildBookList({
        paths,
        setLoading: (loading) => set({ isLoading: loading }),
        onComplete: () => get().loadAllTags(),
      })

      set({
        bookList: result.bookList,
        filteredBookList: result.bookList,
        pagedBookList: result.pagedBookList,
        folderTree: result.folderTree,
        totalCount: result.totalCount,
        totalFilteredCount: result.totalCount,
        totalPages: result.totalPages,
        isLoading: false
      })
    } catch (e) {
      set({ error: `加载书库失败: ${e}`, isLoading: false })
    }
  },

  addLibraryPath: async (path: string) => {
    try {
      const paths = await invoke<string[]>('add_library_path', { path })
      set({ libraryPaths: paths })
      await get().scanAndLoad()
    } catch (e) {
      set({ error: `添加路径失败: ${e}` })
    }
  },

  removeLibraryPath: async (path: string) => {
    try {
      const paths = await invoke<string[]>('remove_library_path', { path })
      set({ libraryPaths: paths })
      await get().scanAndLoad()
    } catch (e) {
      set({ error: `移除路径失败: ${e}` })
    }
  },

  scanAndLoad: async () => {
    set({ isScanning: true, error: null })
    try {
      const paths = get().libraryPaths

      const result = await scanAndBuildBookList({
        paths,
        setLoading: (loading) => set({ isScanning: loading }),
        onComplete: () => get().applyFilters(),
      })

      set({
        bookList: result.bookList,
        filteredBookList: result.bookList,
        pagedBookList: result.pagedBookList,
        folderTree: result.folderTree,
        totalCount: result.totalCount,
        totalFilteredCount: result.totalCount,
        totalPages: result.totalPages,
        isScanning: false
      })
    } catch (e) {
      set({ error: `扫描失败: ${e}`, isScanning: false })
    }
  },

  saveToDatabase: async (book: BookItem) => {
    try {
      const metadata: BookMetadata = {
        path: book.path,
        title: book.title,
        source_type: book.sourceType,
        page_count: book.totalPages || undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      await saveBookMetadata(metadata)
    } catch (e) {
      console.error('保存书籍元数据失败:', e)
      set({ error: '保存书籍元数据失败' })
    }
  },

  updateReadingProgress: async (bookId: string, currentPage: number, totalPages: number, bookPath?: string) => {
    try {
      let targetBook = get().bookList.find(b => b.id === bookId)
      if (!targetBook && bookPath) {
        targetBook = get().bookList.find(b => b.path === bookPath)
      }
      if (targetBook) {
        const matchId = targetBook.id
        set(state => ({
          bookList: state.bookList.map(b =>
            b.id === matchId
              ? { ...b, currentPage, totalPages, progressPercentage: totalPages > 0 ? (currentPage / totalPages) * 100 : 0 }
              : b
          ),
          filteredBookList: state.filteredBookList.map(b =>
            b.id === matchId
              ? { ...b, currentPage, totalPages, progressPercentage: totalPages > 0 ? (currentPage / totalPages) * 100 : 0 }
              : b
          ),
          pagedBookList: state.pagedBookList.map(b =>
            b.id === matchId
              ? { ...b, currentPage, totalPages, progressPercentage: totalPages > 0 ? (currentPage / totalPages) * 100 : 0 }
              : b
          ),
          selectedBook: state.selectedBook && state.selectedBook.id === matchId
            ? { ...state.selectedBook, currentPage, totalPages, progressPercentage: totalPages > 0 ? (currentPage / totalPages) * 100 : 0 }
            : state.selectedBook
        }))

        await invoke('save_reading_progress', {
          bookId: parseInt(matchId),
          currentPage,
          totalPages
        })
      }
    } catch (e) {
      console.error('保存阅读进度失败:', e)
      set({ error: '保存阅读进度失败' })
    }
  },

  toggleFavorite: async (book: BookItem) => {
    try {
      const bookId = await getBookIdByPath(book.path)

      if (!bookId) return

      const isFav = await invoke<boolean>('is_favorite', { bookId })

      if (isFav) {
        await invoke('remove_from_favorites', { bookId })
      } else {
        await invoke('add_to_favorites', { bookId })
      }

      const newFavState = !isFav

      set(state => ({
        bookList: state.bookList.map(b =>
          b.id === book.id ? { ...b, isFavorite: newFavState } : b
        ),
        filteredBookList: state.filteredBookList.map(b =>
          b.id === book.id ? { ...b, isFavorite: newFavState } : b
        ),
        selectedBook: state.selectedBook && state.selectedBook.id === book.id
          ? { ...state.selectedBook, isFavorite: newFavState }
          : state.selectedBook
      }))
    } catch (e) {
      console.error('切换收藏状态失败:', e)
      set({ error: '切换收藏状态失败' })
    }
  },

  selectFolder: (folderPath: string) => {
    set({
      selectedFolder: folderPath,
      selectedFolderName: folderPath,
      currentPage: 1,
    })
    get().applyFilters()
  },

  selectBook: async (book: BookItem | null) => {
    set({ selectedBook: book })
    if (book) {
      await get().loadBookTags(book)
      try {
        const dbBook = await getBookByPath(book.path)
        if (dbBook) {
          const updatedBook = {
            ...book,
            addedDate: dbBook.created_at || book.addedDate,
            lastOpened: dbBook.last_opened || book.lastOpened,
            author: dbBook.author || book.author,
            wordCount: dbBook.word_count || book.wordCount,
            chapterCount: dbBook.chapter_count || book.chapterCount,
          }
          set({ selectedBook: updatedBook })
        }
      } catch (e) {
        console.error('加载书籍元数据失败:', e)
      }
    } else {
      set({ bookTags: [] })
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query, selectedTag: null, currentPage: 1 })
    get().applyFilters()
  },

  setViewMode: (mode: 'library' | 'favorites' | 'tags') => {
    set({ currentViewMode: mode, showTagCloud: mode === 'tags' })
    get().applyFilters()
  },

  toggleTagCloud: () => {
    set(state => ({
      showTagCloud: !state.showTagCloud,
      currentViewMode: !state.showTagCloud ? 'tags' : 'library'
    }))
  },

  toggleTagManagement: () => {
    set(state => ({ showTagManagement: !state.showTagManagement }))
  },

  setSortBy: (sortBy: string) => {
    set({ sortBy, currentPage: 1 })
    get().applyFilters()
  },

  setPage: (page: number) => {
    set({ currentPage: page })
    get().applyFilters()
  },

  setPageSize: (size: number) => {
    set({ pageSize: size, currentPage: 1 })
    get().applyFilters()
  },

  togglePaginationMode: () => {
    const { isPaginationMode } = get()
    set({ isPaginationMode: !isPaginationMode, currentPage: 1 })
    get().applyFilters()
  },

  setCoverSize: (size: number) => {
    set({ coverSize: size })
  },

  applyFilters: async () => {
    const { bookList, searchQuery, selectedFolder, selectedTag, currentViewMode, sortBy, currentPage, pageSize } = get()

    let filtered = bookList

    if (currentViewMode === 'favorites') {
      filtered = filtered.filter(b => b.isFavorite)
    } else if (currentViewMode === 'tags' && !selectedTag) {
      const totalCount = filtered.length
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
      const start = (currentPage - 1) * pageSize
      const paged = filtered.slice(start, start + pageSize)

      set({
        filteredBookList: filtered,
        pagedBookList: paged,
        totalFilteredCount: totalCount,
        totalPages,
      })
      return
    }

    if (selectedFolder && !selectedTag) {
      filtered = filtered.filter(b => b.folderPath.startsWith(selectedFolder))
    }

    if (selectedTag) {
      const books = await invoke<BookMetadata[]>('get_books_by_tag', { tagName: selectedTag })
      const bookPaths = new Set(books.map(b => b.path))
      filtered = filtered.filter(b => bookPaths.has(b.path))
    } else if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(b => b.title.toLowerCase().includes(query) || b.author.toLowerCase().includes(query))
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.title.localeCompare(b.title)
        case 'date':
          return b.addedDate.localeCompare(a.addedDate)
        case 'type':
          return a.sourceType.localeCompare(b.sourceType)
        default:
          return 0
      }
    })

    const totalCount = filtered.length
    const { isPaginationMode } = get()

    if (isPaginationMode) {
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
      const start = (currentPage - 1) * pageSize
      const paged = filtered.slice(start, start + pageSize)

      set({
        filteredBookList: filtered,
        pagedBookList: paged,
        totalFilteredCount: totalCount,
        totalPages,
      })
    } else {
      set({
        filteredBookList: filtered,
        pagedBookList: filtered,
        totalFilteredCount: totalCount,
        totalPages: 1,
      })
    }
  },

  loadBookTags: async (book: BookItem) => {
    try {
      const bookId = await getBookIdByPath(book.path)
      if (bookId) {
        const tags = await invoke<Tag[]>('get_book_tags', { bookId })
        set({ bookTags: tags })
      }
    } catch (e) {
      console.error('加载标签失败:', e)
    }
  },

  addTag: async (book: BookItem, tagName: string) => {
    try {
      const bookId = await getBookIdByPath(book.path)
      if (bookId) {
        await invoke('add_tag_to_book', { bookId, tagName })
        await get().loadBookTags(book)
        await get().loadAllTags()
      }
    } catch (e) {
      console.error('添加标签失败:', e)
    }
  },

  removeTag: async (book: BookItem, tagId: number) => {
    try {
      const bookId = await getBookIdByPath(book.path)
      if (bookId) {
        await invoke('remove_tag_from_book', { bookId, tagId })
        await get().loadBookTags(book)
        await get().loadAllTags()
      }
    } catch (e) {
      console.error('移除标签失败:', e)
    }
  },

  loadAllTags: async () => {
    try {
      const tags = await invoke<Tag[]>('get_all_tags')
      set({ allTags: tags })
    } catch (e) {
      console.error('加载所有标签失败:', e)
    }
  },

  selectTag: async (tagName: string | null) => {
    set({
      selectedTag: tagName,
      currentPage: 1,
    })
    await get().applyFilters()
  },

  loadFavorites: async () => {
    try {
      const favBooks = await invoke<BookMetadata[]>('get_favorite_books')
      const favPaths = new Set(favBooks.map(b => b.path))

      set(state => ({
        bookList: state.bookList.map(b => ({
          ...b,
          isFavorite: favPaths.has(b.path),
        })),
      }))
      get().applyFilters()
    } catch (e) {
      console.error('加载收藏失败:', e)
    }
  },
}))
