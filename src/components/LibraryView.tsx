import React, { useEffect, useState, useRef, useCallback } from 'react'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useMangaStore, FolderNode, BookItem, setDropCallback, initDragDropListener } from '../stores/mangaStore'
import SettingsDialog from './SettingsDialog'
import {
  RxGear,
  RxMagnifyingGlass,
  RxCross2,
  RxPlus,
  RxChevronRight,
  RxChevronDown,
  RxReader,
  RxStar,
  RxStarFilled,
  RxFileText,
  RxFile,
  RxPencil1,
} from 'react-icons/rx'
import { HiFunnel, HiTag, HiOutlineTag, HiBookOpen } from 'react-icons/hi2'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from '../i18n/useTranslation'

/** Format badge color mapping */
const FORMAT_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  PDF: { bg: '#2A3010', text: '#CBE93A' },
  TXT: { bg: '#102A28', text: '#3AE9C8' },
  MD:  { bg: '#28102A', text: '#E93AC8' },
}

function getFormatBadgeStyle(formatText: string) {
  return FORMAT_BADGE_COLORS[formatText.toUpperCase()] || { bg: '#2A3010', text: '#CBE93A' }
}

function FormatIcon({ sourceType, size = 48 }: { sourceType: string; size?: number }) {
  const iconColor = '#707070'
  if (sourceType === 'pdf') {
    return <RxFile size={size} color={iconColor} />
  }
  if (sourceType === 'txt' || sourceType === 'md') {
    return <RxFileText size={size} color={iconColor} />
  }
  return <HiBookOpen size={size} color={iconColor} />
}

// Folder tree node component
function FolderTreeNode({ node, depth, onSelect, onDragStart, onDragOver, onDrop, onShowMessage }: {
  node: FolderNode
  depth: number
  onSelect: (path: string) => void
  onDragStart: (path: string, e: React.MouseEvent) => void
  onDragOver: (path: string, e: React.DragEvent | React.MouseEvent) => void
  onDrop: (targetPath: string) => void
  onShowMessage?: (message: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(node.isExpanded)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [newName, setNewName] = useState('')
  const [showCreateSubfolder, setShowCreateSubfolder] = useState(false)
  const [newSubfolderName, setNewSubfolderName] = useState('')
  const [deleteBookCount, setDeleteBookCount] = useState(0)
  const [isDragOverFolder, setIsDragOverFolder] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    setIsExpanded(node.isExpanded)
  }, [node.isExpanded])

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleOpenInExplorer = async () => {
    setContextMenu(null)
    try {
      await invoke('open_in_explorer', { path: node.path })
    } catch (err) {
      console.error('Failed to open in explorer:', err)
      onShowMessage?.(t('library.openExplorerFailed'))
    }
  }

  const handleDeleteClick = async () => {
    setContextMenu(null)
    try {
      const count = await invoke<number>('count_books_in_folder', { folderPath: node.path })
      setDeleteBookCount(count)
      setShowDeleteConfirm(true)
    } catch (err) {
      console.error('Failed to count books in folder:', err)
      onShowMessage?.(t('library.openExplorerFailed'))
    }
  }

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false)
    try {
      await invoke('delete_file_or_folder', { path: node.path })
      onShowMessage?.(t('library.deleted', {0: node.name}))
      useMangaStore.getState().scanAndLoad()
    } catch (err) {
      console.error('Delete failed:', err)
      onShowMessage?.(t('library.deleteFailed'))
    }
  }

  const handleCreateSubfolder = async () => {
    setContextMenu(null)
    setShowCreateSubfolder(true)
  }

  const handleRefresh = async () => {
    setContextMenu(null)
    useMangaStore.getState().scanAndLoad()
  }

  const handleRenameClick = () => {
    setContextMenu(null)
    setNewName(node.name)
    setShowRenameDialog(true)
  }

  const handleConfirmRename = async () => {
    if (!newName.trim() || newName.trim() === node.name) {
      setShowRenameDialog(false)
      return
    }
    try {
      await invoke('rename_folder', { oldPath: node.path, newName: newName.trim() })
      setShowRenameDialog(false)
      setNewName('')
      useMangaStore.getState().scanAndLoad()
    } catch (err) {
      console.error('Rename folder failed:', err)
      onShowMessage?.(t('library.renameFolderFailed'))
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      onDragStart(node.path, e)
    }
  }

  const handleMouseEnter = (e: React.MouseEvent) => {
    onDragOver(node.path, e)
    setIsDragOverFolder(true)
  }

  const handleMouseLeave = () => {
    setIsDragOverFolder(false)
  }

  const handleConfirmCreateSubfolder = async () => {
    if (!newSubfolderName.trim()) {
      setShowCreateSubfolder(false)
      return
    }
    try {
      await invoke('create_subfolder', { parentPath: node.path, folderName: newSubfolderName.trim() })
      setNewSubfolderName('')
      setShowCreateSubfolder(false)
      useMangaStore.getState().scanAndLoad()
    } catch (err) {
      console.error('Create subfolder failed:', err)
      onShowMessage?.(t('library.createSubfolderFailed'))
    }
  }

  return (
    <>
      <div
        data-folder-path={node.path}
        className={`flex items-center gap-1 py-1.5 px-2 cursor-pointer hover:bg-bg-hover transition-colors text-sm ${
          node.isSelected ? 'bg-bg-hover text-accent' : 'text-text-primary'
        } ${isDragOverFolder ? 'bg-accent/10 border-l-2 border-accent' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (node.children.length > 0) {
            setIsExpanded(!isExpanded)
          }
          onSelect(node.path)
        }}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {node.children.length > 0 ? (
          isExpanded ? (
            <RxChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          ) : (
            <RxChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          )
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        <span className="flex-1 truncate">{node.name}</span>
        <span className="text-text-muted text-xs">{node.count}</span>
      </div>
      {isExpanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <FolderTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onShowMessage={onShowMessage}
            />
          ))}
        </div>
      )}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-bg-card border border-border-1 rounded shadow-xl py-1 min-w-40"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleRefresh}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover transition-colors"
            >
              {t('library.refresh')}
            </button>
            <div className="h-px bg-border-1 my-1" />
            <button
              onClick={handleOpenInExplorer}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover transition-colors"
            >
              {t('library.openInExplorer')}
            </button>
            <button
              onClick={handleCreateSubfolder}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover transition-colors"
            >
              {t('library.createSubfolder')}
            </button>
            <div className="h-px bg-border-1 my-1" />
            <button
              onClick={handleRenameClick}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover transition-colors"
            >
              {t('library.rename')}
            </button>
            <div className="h-px bg-border-1 my-1" />
            <button
              onClick={handleDeleteClick}
              className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-bg-hover transition-colors"
            >
              {t('library.confirmDeleteBtn')}
            </button>
          </div>
        </>
      )}

      {showRenameDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-bg-panel border border-border-1 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-sm font-medium text-text-primary mb-3">{t('library.renameFolder')}</h3>
            <p className="text-text-secondary text-xs mb-2">
              {t('library.renameFrom', {0: node.name})}
            </p>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('library.newName')}
              className="w-full px-2 py-1.5 bg-bg-input border border-border-1 rounded text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmRename()}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowRenameDialog(false); setNewName(''); }}
                className="px-3 py-1.5 bg-bg-hover hover:bg-border-1 rounded text-text-secondary text-xs transition-colors"
              >
                {t('library.cancel')}
              </button>
              <button
                onClick={handleConfirmRename}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-accent-text text-xs transition-colors"
              >
                {t('library.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateSubfolder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-bg-panel border border-border-1 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-sm font-medium text-text-primary mb-3">{t('library.createSubfolder')}</h3>
            <p className="text-text-secondary text-xs mb-2">
              {t('library.createSubfolderIn', {0: node.name})}
            </p>
            <input
              type="text"
              value={newSubfolderName}
              onChange={(e) => setNewSubfolderName(e.target.value)}
              placeholder={t('library.folderName')}
              className="w-full px-2 py-1.5 bg-bg-input border border-border-1 rounded text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreateSubfolder()}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowCreateSubfolder(false); setNewSubfolderName(''); }}
                className="px-3 py-1.5 bg-bg-hover hover:bg-border-1 rounded text-text-secondary text-xs transition-colors"
              >
                {t('library.cancel')}
              </button>
              <button
                onClick={handleConfirmCreateSubfolder}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-accent-text text-xs transition-colors"
              >
                {t('library.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-bg-panel border border-border-1 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-sm font-medium text-text-primary mb-3">{t('library.confirmDelete')}</h3>
            <p className="text-text-secondary text-xs mb-2">
              {t('library.confirmDeleteFolder', {0: node.name})}
            </p>
            {deleteBookCount > 0 && (
              <p className="text-red-400 text-xs mb-2">
                {t('library.affectBooks', {0: deleteBookCount})}
              </p>
            )}
            <p className="text-text-muted text-xs mb-4">
              {t('library.irreversibleWarning')}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 bg-bg-hover hover:bg-border-1 rounded text-text-secondary text-xs transition-colors"
              >
                {t('library.cancel')}
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-white text-xs transition-colors"
              >
                {t('library.confirmDeleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Book card component - displays book icon with format badge instead of cover image
const BookCard = React.memo(function BookCard({ book, onClick, isSelected, onDragStart, onShowMessage }: {
  book: BookItem
  onClick: () => void
  isSelected: boolean
  onDragStart: (path: string, name: string, e: React.MouseEvent) => void
  onShowMessage?: (message: string) => void
}) {
  const cardSize = useMangaStore((s) => s.coverSize)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [newBookName, setNewBookName] = useState('')
  const { t } = useTranslation()

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      onDragStart(book.path, book.title, e)
    }
  }

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleOpenInExplorer = async () => {
    setContextMenu(null)
    try {
      const folderPath = book.folderPath
      await invoke('open_in_explorer', { path: folderPath })
    } catch (err) {
      console.error('Failed to open in explorer:', err)
      onShowMessage?.(t('library.openExplorerFailed'))
    }
  }

  const handleDeleteClick = async () => {
    setContextMenu(null)
    setShowDeleteConfirm(true)
  }

  const handleRefresh = async () => {
    setContextMenu(null)
    useMangaStore.getState().scanAndLoad()
  }

  const handleRenameClick = () => {
    setContextMenu(null)
    setNewBookName(book.title)
    setShowRenameDialog(true)
  }

  const handleConfirmRename = async () => {
    if (!newBookName.trim() || newBookName.trim() === book.title) {
      setShowRenameDialog(false)
      return
    }
    try {
      let newName = newBookName.trim()
      const lastDot = book.path.lastIndexOf('.')
      const ext = lastDot !== -1 ? book.path.substring(lastDot) : ''
      const newNameLastDot = newName.lastIndexOf('.')
      if (ext && (newNameLastDot === -1 || newName.substring(newNameLastDot) !== ext)) {
        newName = newName + ext
      }
      await invoke('rename_file_or_folder', { oldPath: book.path, newName })
      setShowRenameDialog(false)
      setNewBookName('')
      useMangaStore.getState().scanAndLoad()
    } catch (err) {
      console.error('Rename failed:', err)
      onShowMessage?.(t('library.renameFailed'))
    }
  }

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false)
    try {
      await invoke('delete_file_or_folder', { path: book.path })
      onShowMessage?.(t('library.deleted', {0: book.title}))
      useMangaStore.getState().scanAndLoad()
    } catch (err) {
      console.error('Delete failed:', err)
      onShowMessage?.(t('library.deleteFailed'))
    }
  }

  const badgeStyle = getFormatBadgeStyle(book.formatText)
  const iconAreaHeight = cardSize * 1.1

  return (
    <>
      <div
        className={`flex flex-col cursor-pointer transition-all overflow-hidden ${
          isSelected ? 'ring-2 ring-accent' : 'hover:ring-1 hover:ring-accent/50'
        }`}
        style={{ width: cardSize, borderRadius: '6px', backgroundColor: '#272727', border: '2px solid transparent' }}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          const label = `reader-${book.id}-${Date.now()}`
          const url = `/#reader#${book.id}#${encodeURIComponent(book.title)}#${encodeURIComponent(book.path)}#${book.sourceType}`
          new WebviewWindow(label, {
            url,
            title: `${book.title} - Novel Reader`,
            width: 1000,
            height: 700,
            minWidth: 600,
            minHeight: 400,
            resizable: true,
          })
        }}
      >
        {/* Book icon area with format badge */}
        <div
          className="flex items-center justify-center relative overflow-hidden"
          style={{ width: cardSize, height: iconAreaHeight, backgroundColor: '#1E1E1E', borderRadius: '5px 5px 0 0' }}
        >
          <FormatIcon sourceType={book.sourceType} size={Math.max(32, cardSize * 0.3)} />

          {/* Format badge - top-left */}
          <span
            className="absolute top-1.5 left-1.5 font-bold"
            style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.text, borderRadius: '3px', padding: '1px 6px', fontSize: '10px' }}
          >
            {book.formatText}
          </span>

          {/* Favorite star - top-right */}
          {book.isFavorite && (
            <RxStarFilled className="absolute top-1.5 right-1.5 w-4 h-4 text-accent drop-shadow" />
          )}

          {/* Progress bar at bottom of icon area */}
          {book.progressPercentage > 0 && (
            <div className="absolute bottom-0 left-0 right-0" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
              <div
                className="bg-accent"
                style={{ width: `${book.progressPercentage}%`, height: '3px', borderRadius: '1.5px' }}
              />
            </div>
          )}
        </div>

        {/* Book info area */}
        <div className="px-2 pt-1.5 pb-2" style={{ backgroundColor: '#272727' }}>
          <p
            className="truncate font-medium"
            title={book.title}
            style={{ fontSize: '11px', color: '#C8C8C8', lineHeight: '17px', maxHeight: '34px' }}
          >
            {book.title}
          </p>

          {/* Author line */}
          {book.author ? (
            <p className="text-[10px] mt-0.5 truncate" style={{ color: '#A0A0A0' }}>
              {book.author}
            </p>
          ) : null}

          {/* Chapter count + page info */}
          <p className="text-[10px] mt-0.5" style={{ color: '#A0A0A0' }}>
            {book.chapterCount > 0 ? `${book.chapterCount} ${t('library.chapter')}` : ''}
            {book.chapterCount > 0 && book.totalPages > 0 ? ' · ' : ''}
            {book.totalPages > 0 ? `${book.totalPages} ${t('library.page')}` : ''}
          </p>

          {/* Progress bar */}
          <div className="mt-1.5">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px]" style={{ color: '#909090' }}>
                {book.totalPages > 0
                  ? (book.currentPage > 0 ? t('library.currentPage', {0: book.currentPage}) : t('library.notStarted'))
                  : t('library.notStarted')}
              </span>
              <span className="text-[10px]" style={{ color: '#909090' }}>
                {book.totalPages > 0
                  ? `${Math.round(((book.currentPage || 0) / book.totalPages) * 100)}%`
                  : '0%'}
              </span>
            </div>
            <div className="w-full overflow-hidden" style={{ height: '3px', backgroundColor: '#333333', borderRadius: '1.5px' }}>
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: book.totalPages > 0 ? `${((book.currentPage || 0) / book.totalPages) * 100}%` : '0%', borderRadius: '1.5px' }}
              />
            </div>
          </div>
        </div>
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-bg-card border border-border-1 rounded shadow-xl py-1 min-w-40"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleRefresh}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover transition-colors"
            >
              {t('library.refresh')}
            </button>
            <div className="h-px bg-border-1 my-1" />
            <button
              onClick={handleOpenInExplorer}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover transition-colors"
            >
              {t('library.openInExplorer')}
            </button>
            <div className="h-px bg-border-1 my-1" />
            <button
              onClick={handleRenameClick}
              className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover transition-colors"
            >
              {t('library.rename')}
            </button>
            <div className="h-px bg-border-1 my-1" />
            <button
              onClick={handleDeleteClick}
              className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-bg-hover transition-colors"
            >
              {t('library.confirmDeleteBtn')}
            </button>
          </div>
        </>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-bg-panel border border-border-1 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-sm font-medium text-text-primary mb-3">{t('library.confirmDelete')}</h3>
            <p className="text-text-secondary text-xs mb-2">
              {t('library.confirmDeleteFolder', {0: book.title})}
            </p>
            <p className="text-text-muted text-xs mb-4">
              {t('library.irreversibleWarning')}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 bg-bg-hover hover:bg-border-1 rounded text-text-secondary text-xs transition-colors"
              >
                {t('library.cancel')}
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-white text-xs transition-colors"
              >
                {t('library.confirmDeleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRenameDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-bg-panel border border-border-1 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-sm font-medium text-text-primary mb-3">{t('library.renameBook')}</h3>
            <p className="text-text-secondary text-xs mb-2">
              {t('library.renameFrom', {0: book.title})}
            </p>
            <input
              type="text"
              value={newBookName}
              onChange={(e) => setNewBookName(e.target.value)}
              placeholder={t('library.newName')}
              className="w-full px-2 py-1.5 bg-bg-input border border-border-1 rounded text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmRename()}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowRenameDialog(false); setNewBookName(''); }}
                className="px-3 py-1.5 bg-bg-hover hover:bg-border-1 rounded text-text-secondary text-xs transition-colors"
              >
                {t('library.cancel')}
              </button>
              <button
                onClick={handleConfirmRename}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-accent-text text-xs transition-colors"
              >
                {t('library.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
})

function LibraryView() {
  const {
    pagedBookList,
    folderTree,
    isScanning,
    scanAndLoad,
    loadLibrary,
    searchQuery,
    currentViewMode,
    allTags,
    bookTags,
    selectedBook,
    selectedTag,
    totalFilteredCount,
    totalPages,
    currentPage,
    sortBy,
    coverSize,
    selectFolder,
    selectBook,
    setSearchQuery,
    setViewMode,
    setSortBy,
    setPage,
    isPaginationMode,
    togglePaginationMode,
    setCoverSize,
    toggleFavorite,
    addTag,
    removeTag,
    selectTag,
    loadAllTags,
    libraryPaths,
    error: storeError,
  } = useMangaStore()
  const { t } = useTranslation()

  // Sync store error state to statusMessage
  useEffect(() => {
    if (storeError) {
      setStatusMessage(storeError)
      const timer = setTimeout(() => {
        setStatusMessage('')
        useMangaStore.setState({ error: null })
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [storeError])

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [isDragOverLibrary, setIsDragOverLibrary] = useState(false)
  const [showTagManagement, setShowTagManagement] = useState(false)

  const [leftPanelWidth, setLeftPanelWidth] = useState(256)
  const [rightPanelWidth, setRightPanelWidth] = useState(288)
  const [isResizingLeft, setIsResizingLeft] = useState(false)
  const [isResizingRight, setIsResizingRight] = useState(false)
  const [_globalContextMenu, setGlobalContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [pendingDropFiles, setPendingDropFiles] = useState<string[]>([])
  const [pendingTargetFolder, setPendingTargetFolder] = useState('')
  const [conflictFileName, setConflictFileName] = useState('')

  const [draggedFolderPath, setDraggedFolderPath] = useState<string | null>(null)
  const [dragOverFolderPath, setDragOverFolderPath] = useState<string | null>(null)
  const [draggedFolderName, setDraggedFolderName] = useState<string>('')
  const [draggedBookPath, setDraggedBookPath] = useState<string | null>(null)
  const [draggedBookName, setDraggedBookName] = useState<string>('')
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragIcon, setDragIcon] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef(false)
  const draggedFolderPathRef = useRef<string | null>(null)
  const draggedBookPathRef = useRef<string | null>(null)
  const dragOverFolderPathRef = useRef<string | null>(null)

  useEffect(() => {
    draggedFolderPathRef.current = draggedFolderPath
  }, [draggedFolderPath])

  useEffect(() => {
    draggedBookPathRef.current = draggedBookPath
  }, [draggedBookPath])

  useEffect(() => {
    dragOverFolderPathRef.current = dragOverFolderPath
  }, [dragOverFolderPath])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const newWidth = Math.max(180, Math.min(400, e.clientX))
        setLeftPanelWidth(newWidth)
      } else if (isResizingRight) {
        const windowWidth = window.innerWidth
        const newWidth = Math.max(200, Math.min(500, windowWidth - e.clientX))
        setRightPanelWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizingLeft(false)
      setIsResizingRight(false)
    }

    if (isResizingLeft || isResizingRight) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (isResizingLeft || isResizingRight) {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isResizingLeft, isResizingRight])

  const handleGlobalContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setGlobalContextMenu({ x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    loadLibrary().catch(e => {
      console.error('LibraryView: loadLibrary failed:', e)
    })
  }, [])

  const handleOpenReader = async (book: BookItem) => {
    try {
      const label = `reader-${book.id}-${Date.now()}`
      const url = `/#reader#${book.id}#${encodeURIComponent(book.title)}#${encodeURIComponent(book.path)}#${book.sourceType}`
      new WebviewWindow(label, {
        url,
        title: `${book.title} - Novel Reader`,
        width: 1000,
        height: 700,
        minWidth: 600,
        minHeight: 400,
        resizable: true,
      })
    } catch (error) {
      console.error('Failed to open reader:', error)
      setStatusMessage(t('library.openReaderFailed'))
    }
  }

  const handleSettingsClick = () => {
    setIsSettingsOpen(true)
  }

  const handleSettingsClose = () => {
    setIsSettingsOpen(false)
    scanAndLoad()
  }

  const handleClearSearch = () => {
    setSearchQuery('')
  }

  const handleSearch = () => {
    setViewMode('library')
  }

  const handleAddTag = async () => {
    if (newTagName.trim() && selectedBook) {
      await addTag(selectedBook, newTagName.trim())
      setNewTagName('')
      setShowTagInput(false)
    }
  }

  const handleRemoveTag = async (tagId: number) => {
    if (selectedBook) {
      await removeTag(selectedBook, tagId)
    }
  }

  const sortOptions = [
    { value: 'name', label: t('library.sortByName') },
    { value: 'date', label: t('library.sortByDate') },
    { value: 'type', label: t('library.sortByType') },
  ]

  useEffect(() => {
    initDragDropListener()

    setDropCallback(async (paths: string[]) => {
      setIsDragOverLibrary(false)
      if (libraryPaths.length === 0) {
        setStatusMessage(t('library.addLibraryPathFirst'))
        return
      }

      const targetFolder = libraryPaths[0]
      const conflicts: string[] = []
      const noConflicts: string[] = []

      for (const file of paths) {
        try {
          const result = await invoke<any>('check_file_conflict', { sourcePath: file, targetFolder })
          if (result.has_conflict) {
            conflicts.push(file)
          } else {
            noConflicts.push(file)
          }
        } catch {
          noConflicts.push(file)
        }
      }

      if (noConflicts.length > 0) {
        let copyFailed = false
        for (const file of noConflicts) {
          try {
            await invoke('copy_file_to_folder', { sourcePath: file, targetFolder })
          } catch (err) {
            console.error('Copy file failed:', err)
            copyFailed = true
          }
        }
        if (copyFailed) setStatusMessage(t('library.partialCopyFailed'))
      }

      if (conflicts.length > 0) {
        const fileName = conflicts[0].split(/[\\/]/).pop() || conflicts[0]
        setConflictFileName(fileName)
        setPendingDropFiles(conflicts)
        setPendingTargetFolder(targetFolder)
        setShowConflictDialog(true)
      } else if (noConflicts.length > 0) {
        scanAndLoad()
      }
    })

    return () => {
      setDropCallback(() => {})
    }
  }, [libraryPaths])

  const handleConfirmCopyWithSuffix = async () => {
    setShowConflictDialog(false)
    let copyFailed = false
    for (const file of pendingDropFiles) {
      try {
        await invoke('copy_file_to_folder_with_suffix', { sourcePath: file, targetFolder: pendingTargetFolder })
      } catch (err) {
        console.error('Copy file failed:', err)
        copyFailed = true
      }
    }
    if (copyFailed) {
      setStatusMessage(t('library.partialCopyFailed'))
    }
    scanAndLoad()
  }

  const handleCancelCopy = async () => {
    setShowConflictDialog(false)
    scanAndLoad()
  }

  const handleTagSelect = (tagName: string) => {
    selectTag(tagName)
  }

  const handleDeleteTagGlobally = async (tagName: string) => {
    try {
      await invoke('delete_tag_by_name', { tagName })
      setStatusMessage(t('library.tagDeleted', {0: tagName}))
      await loadAllTags()
    } catch (err) {
      setStatusMessage(t('library.tagDeleteFailed'))
    }
  }

  const handleFolderDragStart = (path: string, e: React.MouseEvent) => {
    const name = path.split(/[\\/]/).pop() || path
    setDraggedFolderPath(path)
    setDraggedFolderName(name)
    setDraggedBookPath(null)
    setDragIcon('\uD83D\uDCC1')
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    setIsDragging(false)
    window.addEventListener('mousemove', handleDragMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = ''
  }

  const handleBookDragStart = (path: string, name: string, e: React.MouseEvent) => {
    setDraggedBookPath(path)
    setDraggedBookName(name)
    setDraggedFolderPath(null)
    setDragIcon('\uD83D\uDCD6')
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    setIsDragging(false)
    window.addEventListener('mousemove', handleDragMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = ''
  }

  const handleDragMouseMove = (e: MouseEvent) => {
    if (dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance > 5 && !isDraggingRef.current) {
        setIsDragging(true)
        isDraggingRef.current = true
        document.body.style.cursor = 'move'
      }
    }
    if (isDraggingRef.current) {
      setDragPosition({ x: e.clientX + 12, y: e.clientY + 12 })

      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (el) {
        const folderEl = el.closest('[data-folder-path]')
        if (folderEl) {
          const targetPath = folderEl.getAttribute('data-folder-path')
          if (targetPath) {
            setDragOverFolderPath(targetPath)
            dragOverFolderPathRef.current = targetPath
          }
        } else {
          setDragOverFolderPath(null)
          dragOverFolderPathRef.current = null
        }
      }
    }
  }

  const handleGlobalMouseUp = useCallback(() => {
    window.removeEventListener('mousemove', handleDragMouseMove)
    window.removeEventListener('mouseup', handleGlobalMouseUp)
    const draggedFolder = draggedFolderPathRef.current
    const draggedBook = draggedBookPathRef.current
    const target = dragOverFolderPathRef.current
    if (isDraggingRef.current && target) {
      if (draggedFolder) {
        handleFolderDrop(target)
      } else if (draggedBook) {
        handleBookDrop(target)
      }
    } else {
      setDraggedFolderPath(null)
      setDraggedBookPath(null)
      setDragOverFolderPath(null)
    }
    setDragPosition(null)
    setIsDragging(false)
    isDraggingRef.current = false
    dragStartRef.current = null
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  const handleFolderDragOver = (path: string, _e: React.DragEvent | React.MouseEvent) => {
    setDragOverFolderPath(path)
  }

  const handleFolderDrop = async (targetPath: string) => {
    const dragged = draggedFolderPathRef.current
    if (!dragged) {
      return
    }

    if (dragged === targetPath) {
      setDraggedFolderPath(null)
      setDragOverFolderPath(null)
      return
    }

    if (targetPath.startsWith(dragged + '/') || targetPath === dragged) {
      setDraggedFolderPath(null)
      setDragOverFolderPath(null)
      return
    }

    try {
      await invoke('move_folder', { sourcePath: dragged, targetParentPath: targetPath })
      setStatusMessage(t('library.folderMoved'))
      useMangaStore.getState().scanAndLoad()
    } catch (err) {
      console.error('Move folder failed:', err)
      setStatusMessage(t('library.folderMoveFailed'))
    } finally {
      setDraggedFolderPath(null)
      setDragOverFolderPath(null)
    }
  }

  const handleBookDrop = async (targetPath: string) => {
    const bookPath = draggedBookPathRef.current
    if (!bookPath) {
      return
    }

    try {
      await invoke('move_file_to_folder', { sourcePath: bookPath, targetFolder: targetPath })
      setStatusMessage(t('library.bookMoved'))
      useMangaStore.getState().scanAndLoad()
    } catch (err) {
      console.error('Move book file failed:', err)
      setStatusMessage(t('library.bookMoveFailed'))
    } finally {
      setDraggedBookPath(null)
      setDragOverFolderPath(null)
    }
  }

  return (
    <>
      <div
        className="flex-1 flex overflow-hidden"
        onContextMenu={handleGlobalContextMenu}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('text/plain')) {
            e.preventDefault()
            setIsDragOverLibrary(true)
          }
        }}
        onDragEnter={() => setIsDragOverLibrary(true)}
        onDragLeave={(e) => {
          if (!e.dataTransfer.types.includes('text/plain')) {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOverLibrary(false)
          }
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes('text/plain')) {
            e.preventDefault()
            setIsDragOverLibrary(false)
          }
        }}
      >
        {isDragOverLibrary && (
          <div className="absolute inset-0 z-40 bg-accent bg-opacity-10 border-2 border-dashed border-accent flex items-center justify-center pointer-events-none">
            <div className="bg-bg-panel border border-accent rounded-xl px-8 py-4 text-center">
              <p className="text-accent text-lg font-medium">{t('library.dragToLibrary')}</p>
              <p className="text-text-muted text-sm mt-1">{t('library.filesCopiedToLibrary')}</p>
            </div>
          </div>
        )}

        {/* Left Panel - Sidebar */}
        <div className="flex-shrink-0 bg-bg-panel border-r border-border-1 flex flex-col overflow-hidden" style={{ width: leftPanelWidth }}>
          {/* Search Box */}
          <div className="p-2 border-b border-border-1">
            <div className="relative">
              <RxMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    handleSearch()
                  }
                }}
                placeholder={t('library.searchPlaceholder')}
                className="w-full pl-8 pr-8 py-1.5 bg-bg-input border border-border-1 rounded text-text-primary text-xs placeholder-text-muted focus:outline-none focus:border-accent"
              />
              {searchQuery ? (
                <>
                  <button
                    onClick={handleClearSearch}
                    className="absolute right-6 top-1/2 -translate-y-1/2 p-0.5 hover:bg-bg-hover rounded text-text-muted"
                  >
                    <RxCross2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleSearch}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 hover:bg-accent/20 rounded text-text-muted hover:text-accent transition-colors"
                  >
                    <RxMagnifyingGlass className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {/* View Mode Buttons */}
          <div className="flex border-b border-border-1">
            <button
              onClick={() => setViewMode('library')}
              className={`flex-1 py-2 text-xs flex items-center justify-center gap-1 transition-colors ${
                currentViewMode === 'library'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <RxReader className="w-3.5 h-3.5" />
              {t('library.libraryTab')}
            </button>
            <button
              onClick={() => setViewMode('favorites')}
              className={`flex-1 py-2 text-xs flex items-center justify-center gap-1 transition-colors ${
                currentViewMode === 'favorites'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <RxStar className="w-3.5 h-3.5" />
              {t('library.favoritesTab')}
            </button>
            <button
              onClick={() => setViewMode('tags')}
              className={`flex-1 py-2 text-xs flex items-center justify-center gap-1 transition-colors ${
                currentViewMode === 'tags'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <HiOutlineTag className="w-3.5 h-3.5" />
              {t('library.tagsTab')}
            </button>
          </div>

          {/* Folder Tree (only in library mode) */}
          {currentViewMode === 'library' && (
            <>
              {/* Folder Tree Header */}
              <div className="px-3 py-2 border-b border-border-1">
                <span className="text-text-muted text-[10px] font-bold">
                  {t('library.folderLabel')} <span className="text-[#404040]">{folderTree[0]?.count || 0}</span>
                </span>
              </div>

              {/* Folder Tree */}
              <div className="flex-1 overflow-auto">
                {folderTree.length > 0 ? (
                  folderTree.map((node) => (
                    <FolderTreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      onSelect={selectFolder}
                      onDragStart={handleFolderDragStart}
                      onDragOver={handleFolderDragOver}
                      onDrop={handleFolderDrop}
                      onShowMessage={setStatusMessage}
                    />
                  ))
                ) : (
                  <div className="p-4 text-center">
                    <HiBookOpen className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-30" />
                    <p className="text-text-muted text-xs">
                      {t('library.addLibraryPath')}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Settings Button */}
          <div className="p-2 border-t border-border-1">
            <button
              onClick={handleSettingsClick}
              className="w-full py-1.5 bg-bg-hover hover:bg-border-1 rounded text-text-secondary hover:text-text-primary text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <RxGear className="w-3.5 h-3.5" />
              {t('library.settings')}
            </button>
          </div>
        </div>

        {/* Left Resize Handle */}
        <div
          className={`w-1 cursor-col-resize hover:bg-accent/50 transition-colors ${isResizingLeft ? 'bg-accent/50' : 'bg-transparent'}`}
          onMouseDown={(e) => { e.preventDefault(); setIsResizingLeft(true); }}
        />

        {/* Middle Panel - Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tag Cloud View */}
          {currentViewMode === 'tags' && !selectedTag ? (
            <>
              {/* Tag Toolbar */}
              <div className="h-10 flex-shrink-0 bg-bg-panel border-b border-border-1 flex items-center px-3 gap-2">
                <span className="text-text-muted text-xs font-bold">{t('library.allTags')}</span>
                <div className="flex-1" />
                <button
                  onClick={() => setShowTagManagement(!showTagManagement)}
                  className={`px-2 py-1 rounded text-xs border transition-colors ${
                    showTagManagement
                      ? 'bg-[#2A3010] border-accent text-accent'
                      : 'bg-[#252525] border-border-1 text-text-secondary hover:text-accent hover:border-accent'
                  }`}
                >
                  {showTagManagement ? t('library.done') : t('library.manageTags')}
                </button>
              </div>

              {/* Tag List */}
              <div className="flex-1 overflow-auto p-4">
                {allTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag) => (
                      showTagManagement ? (
                        <div
                          key={tag.id}
                          className="px-3 py-1.5 bg-[#252525] border border-border-1 rounded text-sm text-text-secondary flex items-center gap-2"
                        >
                          <span>{tag.name}</span>
                          <button
                            onClick={() => handleDeleteTagGlobally(tag.name)}
                            className="text-text-muted hover:text-red-400 transition-colors"
                          >
                            <RxCross2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          key={tag.id}
                          onClick={() => handleTagSelect(tag.name)}
                          className="px-3 py-1.5 bg-[#252525] border border-border-1 rounded text-sm text-text-secondary hover:text-accent hover:border-accent transition-colors"
                        >
                          {tag.name}
                        </button>
                      )
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <HiTag className="w-12 h-12 text-text-muted opacity-30 mb-4" />
                    <p className="text-text-secondary text-sm mb-2">{t('library.noTags')}</p>
                    <p className="text-text-muted text-xs">{t('library.noTagsHint')}</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Book Toolbar (library / favorites / tag-books view) */}
              <div className="h-10 flex-shrink-0 bg-bg-panel border-b border-border-1 flex items-center px-3 gap-2">
                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="px-2 py-1 text-xs bg-bg-input border border-border-1 rounded text-text-secondary disabled:text-text-muted hover:text-text-primary hover:border-accent transition-colors"
                      title={t('library.previousPage')}
                    >
                      &lt;
                    </button>
                    <span className="text-text-muted text-xs min-w-[40px] text-center">
                      {currentPage}/{totalPages}
                    </span>
                    <button
                      onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2 py-1 text-xs bg-bg-input border border-border-1 rounded text-text-secondary disabled:text-text-muted hover:text-text-primary hover:border-accent transition-colors"
                      title={t('library.nextPage')}
                    >
                      &gt;
                    </button>
                  </div>
                )}

                <span className="text-text-secondary text-xs">
                  {isScanning ? t('library.scanning') : selectedTag ? `${t('library.tagsTab')} "${selectedTag}": ${totalFilteredCount}` : `${t('library.allBooks')} (${totalFilteredCount})`}
                </span>

                {selectedTag && (
                  <button
                    onClick={() => {
                      selectTag(null)
                      loadAllTags()
                    }}
                    className="px-2 py-1 bg-[#252525] border border-border-1 rounded text-xs text-text-secondary hover:text-accent hover:border-accent transition-colors"
                  >
                    <RxCross2 className="w-3 h-3 inline mr-1" />
                    {t('library.clearTag')}
                  </button>
                )}

                <div className="flex-1" />

                {/* Sort Button */}
                <div className="relative">
                  <button
                    onClick={() => setShowSortMenu(!showSortMenu)}
                    className="px-2 py-1 bg-bg-input border border-border-1 rounded text-text-secondary hover:text-text-primary hover:border-accent text-xs flex items-center gap-1 transition-colors"
                  >
                    <HiFunnel className="w-3.5 h-3.5" />
                    {sortOptions.find((s) => s.value === sortBy)?.label || t('library.sortBy')}
                  </button>
                  {showSortMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                      <div className="absolute top-full right-0 mt-1 bg-bg-card border border-border-1 rounded shadow-lg z-20 min-w-28">
                        {sortOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setSortBy(option.value)
                              setShowSortMenu(false)
                            }}
                            className={`w-full px-3 py-1.5 text-left text-xs hover:bg-bg-hover transition-colors ${
                              sortBy === option.value ? 'text-accent' : 'text-text-primary'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Pagination mode toggle */}
                <button
                  onClick={() => togglePaginationMode()}
                  className={`px-2 py-1 text-xs rounded transition-colors border ${
                    isPaginationMode
                      ? 'bg-accent text-accent-text font-medium border-accent'
                      : 'bg-bg-input text-text-secondary hover:text-text-primary border-border-1'
                  }`}
                  title={isPaginationMode ? t('library.pagination') : t('library.showAll')}
                >
                  {isPaginationMode ? t('library.pagination') : t('library.showAll')}
                </button>

                {/* Card Size Slider */}
                <div className="flex items-center gap-1.5 text-text-muted text-xs">
                  <span>{t('library.size')}</span>
                  <input
                    type="range"
                    min="120"
                    max="280"
                    value={coverSize}
                    onChange={(e) => setCoverSize(Number(e.target.value))}
                    className="w-16 accent-accent"
                  />
                </div>

                {/* Refresh button */}
                <button
                  onClick={() => {
                    if (libraryPaths.length > 0) {
                      scanAndLoad()
                    }
                  }}
                  disabled={isScanning}
                  className="px-2 py-1 bg-bg-input border border-border-1 rounded text-text-secondary hover:text-text-primary hover:border-accent text-xs flex items-center gap-1 transition-colors disabled:opacity-50"
                  title={t('library.rescan')}
                >
                  <svg className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {t('library.refresh')}
                </button>
              </div>

              {/* Book Grid Content */}
              <div className="flex-1 overflow-auto p-3">
                {pagedBookList.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {pagedBookList.map((book) => (
                      <BookCard
                        key={book.id}
                        book={book}
                        onClick={() => selectBook(book)}
                        isSelected={selectedBook?.id === book.id}
                        onDragStart={handleBookDragStart}
                        onShowMessage={setStatusMessage}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <HiBookOpen className="w-16 h-16 text-text-muted opacity-30 mb-4" />
                    <p className="mb-2 font-semibold" style={{ fontSize: '16px', color: '#808080' }}>
                      {currentViewMode === 'favorites' ? t('library.noFavorites') : searchQuery ? t('library.noSearchResults') : t('library.noBooks')}
                    </p>
                    <p style={{ fontSize: '12px', color: '#505050' }}>
                      {currentViewMode === 'favorites'
                        ? t('library.addFavoriteHint')
                        : searchQuery
                        ? t('library.adjustSearch')
                        : t('library.addLibraryToStart')
                      }
                    </p>
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="h-8 flex-shrink-0 bg-bg-panel border-t border-border-1 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-2 py-0.5 text-xs text-text-secondary disabled:text-text-muted hover:text-text-primary transition-colors"
                  >
                    {t('library.previousPage')}
                  </button>
                  <span className="text-text-muted text-xs">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2 py-0.5 text-xs text-text-secondary disabled:text-text-muted hover:text-text-primary transition-colors"
                  >
                    {t('library.nextPage')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Resize Handle */}
        <div
          className={`w-1 cursor-col-resize hover:bg-accent/50 transition-colors ${isResizingRight ? 'bg-accent/50' : 'bg-transparent'}`}
          onMouseDown={(e) => { e.preventDefault(); setIsResizingRight(true); }}
        />

        {/* Right Panel - Details */}
        {selectedBook ? (
          <div className="flex-shrink-0 border-l border-border-1 flex flex-col overflow-hidden" style={{ width: rightPanelWidth, backgroundColor: '#212121', borderRadius: '0 0 8px 0' }}>
            {/* Header */}
            <div className="p-3 border-b border-border-1 flex items-center">
              <h3 className="text-sm font-medium text-text-primary">{t('library.bookDetail')}</h3>
            </div>

            <div className="flex-1 overflow-auto">
              {/* Book Icon with Format Badge */}
              <div className="p-4 flex justify-center">
                <div
                  className="flex items-center justify-center relative overflow-hidden"
                  style={{ width: 120, height: 160, backgroundColor: '#1E1E1E', borderRadius: '5px' }}
                >
                  <FormatIcon sourceType={selectedBook.sourceType} size={48} />
                  <span
                    className="absolute top-2 left-2 font-bold"
                    style={{ ...(() => {
                      const s = getFormatBadgeStyle(selectedBook.formatText)
                      return { backgroundColor: s.bg, color: s.text }
                    })(), borderRadius: '3px', padding: '2px 7px', fontSize: '10px' }}
                  >
                    {selectedBook.formatText}
                  </span>
                </div>
              </div>

              {/* Title */}
              <div className="px-4 pb-3">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-medium truncate flex-1" title={selectedBook.title} style={{ fontSize: '13px', color: '#E0E0E0' }}>
                    {selectedBook.title}
                  </h2>
                  <button
                    onClick={async () => {
                      const newTitle = prompt(t('library.editTitle'), selectedBook.title)
                      if (newTitle && newTitle !== selectedBook.title) {
                        try {
                          await invoke('save_book_metadata', { book: { ...selectedBook, title: newTitle } })
                          useMangaStore.getState().scanAndLoad()
                        } catch { /* ignore */ }
                      }
                    }}
                    className="text-text-muted hover:text-accent transition-colors flex-shrink-0"
                    title={t('library.editTitle')}
                  >
                    <RxPencil1 className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {selectedBook.author ? (
                    <p className="truncate flex-1" style={{ fontSize: '11px', color: '#909090' }}>
                      {selectedBook.author}
                    </p>
                  ) : <span className="flex-1" />}
                  <button
                    onClick={async () => {
                      const newAuthor = prompt(t('library.editAuthor'), selectedBook.author || '')
                      if (newAuthor !== null && newAuthor !== selectedBook.author) {
                        try {
                          await invoke('save_book_metadata', { book: { ...selectedBook, author: newAuthor } })
                          useMangaStore.getState().scanAndLoad()
                        } catch { /* ignore */ }
                      }
                    }}
                    className="text-text-muted hover:text-accent transition-colors flex-shrink-0"
                    title={t('library.editAuthor')}
                  >
                    <RxPencil1 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Format Tag */}
              <div className="px-4 pb-3">
                <span
                  className="inline-block font-bold"
                  style={{ ...(() => {
                    const s = getFormatBadgeStyle(selectedBook.formatText)
                    return { backgroundColor: s.bg, color: s.text }
                  })(), borderRadius: '3px', padding: '2px 7px', fontSize: '10px' }}
                >
                  {selectedBook.formatText}
                </span>
              </div>

              {/* Info Table */}
              <div className="px-4 pb-3">
                <div className="space-y-2">
                  {/* Author */}
                  <div className="flex items-center">
                    <span className="w-20 font-bold" style={{ fontSize: '10px', color: '#505050' }}>{t('library.author')}</span>
                    <span style={{ fontSize: '11px', color: '#686868' }}>
                      {selectedBook.author || '-'}
                    </span>
                  </div>
                  {/* Pages */}
                  <div className="flex items-center">
                    <span className="w-20 font-bold" style={{ fontSize: '10px', color: '#505050' }}>{t('library.pages')}</span>
                    <span style={{ fontSize: '11px', color: '#686868' }}>
                      {selectedBook.totalPages > 0 ? `${selectedBook.totalPages} ${t('library.page')}` : '-'}
                    </span>
                  </div>
                  {/* Chapters */}
                  <div className="flex items-center">
                    <span className="w-20 font-bold" style={{ fontSize: '10px', color: '#505050' }}>{t('library.chapters')}</span>
                    <span style={{ fontSize: '11px', color: '#686868' }}>
                      {selectedBook.chapterCount > 0 ? `${selectedBook.chapterCount} ${t('library.chapter')}` : '-'}
                    </span>
                  </div>
                  {/* Word Count */}
                  <div className="flex items-center">
                    <span className="w-20 font-bold" style={{ fontSize: '10px', color: '#505050' }}>{t('library.wordCount')}</span>
                    <span style={{ fontSize: '11px', color: '#686868' }}>
                      {selectedBook.wordCount > 0 ? `${selectedBook.wordCount.toLocaleString()} 字` : '-'}
                    </span>
                  </div>
                  {/* File Size */}
                  <div className="flex items-center">
                    <span className="w-20 font-bold" style={{ fontSize: '10px', color: '#505050' }}>{t('library.fileSize')}</span>
                    <span style={{ fontSize: '11px', color: '#686868' }}>
                      {selectedBook.fileSizeText || '-'}
                    </span>
                  </div>
                  {/* Progress */}
                  <div className="flex items-center">
                    <span className="w-20 font-bold" style={{ fontSize: '10px', color: '#505050' }}>{t('library.progress')}</span>
                    <span style={{ fontSize: '11px', color: '#686868' }}>
                      {selectedBook.currentPage > 0
                        ? t('library.currentPage', {0: selectedBook.currentPage})
                        : t('library.notRead')}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span style={{ fontSize: '10px', color: '#686868' }}>
                        {selectedBook.totalPages > 0
                          ? `${Math.round(((selectedBook.currentPage || 0) / selectedBook.totalPages) * 100)}%`
                          : '0%'}
                      </span>
                      <span style={{ fontSize: '10px', color: '#686868' }}>
                        {selectedBook.totalPages > 0 ? `${selectedBook.totalPages} ${t('library.page')}` : '-'}
                      </span>
                    </div>
                    <div className="w-full overflow-hidden" style={{ height: '3px', backgroundColor: '#333333', borderRadius: '1.5px' }}>
                      <div
                        className="h-full bg-accent transition-all duration-300"
                        style={{ width: selectedBook.totalPages > 0 ? `${((selectedBook.currentPage || 0) / selectedBook.totalPages) * 100}%` : '0%', borderRadius: '1.5px' }}
                      />
                    </div>
                  </div>
                  {/* Divider */}
                  <div className="w-full" style={{ height: '1px', backgroundColor: '#2E2E2E' }} />
                  {/* Date Added */}
                  <div className="flex items-center">
                    <span className="w-20 font-bold" style={{ fontSize: '10px', color: '#505050' }}>{t('library.dateAdded')}</span>
                    <span style={{ fontSize: '11px', color: '#686868' }}>
                      {selectedBook.addedDate
                        ? new Date(selectedBook.addedDate).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
                        : '-'}
                    </span>
                  </div>
                  {/* Last Read */}
                  <div className="flex items-center">
                    <span className="w-20 font-bold" style={{ fontSize: '10px', color: '#505050' }}>{t('library.lastRead')}</span>
                    <span style={{ fontSize: '11px', color: '#686868' }}>
                      {selectedBook.lastOpened
                        ? new Date(selectedBook.lastOpened).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : t('library.notRead')}
                    </span>
                  </div>
                  {/* Divider */}
                  <div className="w-full" style={{ height: '1px', backgroundColor: '#2E2E2E' }} />
                  {/* Path */}
                  <div className="flex items-start">
                    <span className="w-20 font-bold flex-shrink-0" style={{ fontSize: '10px', color: '#505050' }}>{t('library.path')}</span>
                    <span className="truncate" title={selectedBook.path} style={{ fontSize: '11px', color: '#686868' }}>
                      {selectedBook.path}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="px-4 pb-3 flex gap-2">
                <button
                  onClick={() => handleOpenReader(selectedBook)}
                  className="flex-1 py-1.5 bg-accent hover:bg-accent-hover rounded text-accent-text text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RxReader className="w-3.5 h-3.5" />
                  {t('library.read')}
                </button>
                <button
                  onClick={() => toggleFavorite(selectedBook)}
                  className={`px-3 py-1.5 rounded text-xs flex items-center gap-1 transition-colors ${
                    selectedBook.isFavorite
                      ? 'bg-accent text-accent-text'
                      : 'bg-bg-card text-text-secondary border border-border-1 hover:text-accent hover:border-accent'
                  }`}
                >
                  {selectedBook.isFavorite ? (
                    <RxStarFilled className="w-3.5 h-3.5" />
                  ) : (
                    <RxStar className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {/* Tags */}
              <div className="px-4 pb-4 pt-3" style={{ borderTop: '1px solid #2E2E2E' }}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium flex items-center gap-1" style={{ fontSize: '11px', color: '#909090' }}>
                    <HiTag className="w-3.5 h-3.5" />
                    {t('library.tags')}
                  </h4>
                  {!showTagInput ? (
                    <button
                      onClick={() => setShowTagInput(true)}
                      className="p-0.5 hover:bg-bg-hover rounded text-text-muted hover:text-accent transition-colors"
                    >
                      <RxPlus className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>

                {showTagInput && (
                  <div className="flex gap-1.5 mb-2">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder={t('library.tagName')}
                      className="flex-1 px-2 py-1 bg-bg-input border border-border-1 rounded text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                    />
                    <button
                      onClick={handleAddTag}
                      className="px-2 py-1 bg-accent hover:bg-accent-hover rounded text-accent-text text-xs transition-colors"
                    >
                      {t('library.addTag')}
                    </button>
                    <button
                      onClick={() => {
                        setShowTagInput(false)
                        setNewTagName('')
                      }}
                      className="p-1 hover:bg-bg-hover rounded text-text-muted transition-colors"
                    >
                      <RxCross2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {bookTags.length > 0 ? (
                    bookTags.map((tag) => (
                      <span
                        key={tag.id}
                        className="flex items-center gap-1"
                        style={{ backgroundColor: '#252525', borderRadius: '4px', padding: '3px 6px', fontSize: '11px', color: '#A0A0A0' }}
                      >
                        {tag.name}
                        <button
                          onClick={() => handleRemoveTag(tag.id ?? 0)}
                          className="hover:text-red-400 transition-colors"
                          style={{ color: '#A0A0A0' }}
                        >
                          <RxCross2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <p style={{ fontSize: '11px', color: '#555555' }}>{t('library.noTags')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-shrink-0 border-l border-border-1 flex items-center justify-center" style={{ width: rightPanelWidth, backgroundColor: '#212121', borderRadius: '0 0 8px 0' }}>
            <div className="text-center p-4">
              <HiBookOpen className="w-12 h-12 mx-auto mb-3 text-text-muted opacity-30" />
              <p style={{ fontSize: '12px', color: '#505050' }}>{t('library.selectBookHint')}</p>
            </div>
          </div>
        )}

        {/* Status Toast */}
        {statusMessage && (
          <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 border rounded-lg shadow-xl px-4 py-2 text-sm max-w-md ${
            statusMessage.includes('Failed') || statusMessage.includes('failed') || statusMessage.includes('失败')
              ? 'bg-red-900/90 border-red-700 text-red-100'
              : 'bg-bg-card border-border-1 text-text-primary'
          }`}>
            {statusMessage}
            <button
              onClick={() => setStatusMessage('')}
              className="ml-2 text-text-muted hover:text-text-primary"
            >
              <RxCross2 className="w-4 h-4 inline" />
            </button>
          </div>
        )}

        {/* File Conflict Dialog */}
        {showConflictDialog && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-bg-panel border border-border-1 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
              <h3 className="text-sm font-medium text-text-primary mb-3">{t('library.fileNameConflict')}</h3>
              <p className="text-text-secondary text-xs mb-2">
                {t('library.conflictExists')}
              </p>
              <p className="text-accent text-xs mb-2 font-mono bg-bg-input px-2 py-1 rounded">
                {conflictFileName}
              </p>
              <p className="text-text-muted text-xs mb-4">
                {t('library.useSuffixImport')}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancelCopy}
                  className="px-3 py-1.5 bg-bg-hover hover:bg-border-1 rounded text-text-secondary text-xs transition-colors"
                >
                  {t('library.cancel')}
                </button>
                <button
                  onClick={handleConfirmCopyWithSuffix}
                  className="px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-accent-text text-xs transition-colors"
                >
                  {t('library.useSuffixImportBtn')}
                </button>
              </div>
            </div>
          </div>
        )}

        <SettingsDialog isOpen={isSettingsOpen} onClose={handleSettingsClose} />
      </div>

      {dragPosition && isDragging && (
        <div
          className="fixed z-[9999] pointer-events-none px-3 py-2 bg-bg-panel border-2 border-accent rounded-lg shadow-2xl flex items-center gap-2 transition-opacity duration-150"
          style={{
            left: dragPosition.x,
            top: dragPosition.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span className="text-lg">{dragIcon}</span>
          <span className="text-text-primary text-sm font-medium truncate max-w-40">
            {draggedFolderName || draggedBookName}
          </span>
        </div>
      )}
    </>
  )
}

export default LibraryView
