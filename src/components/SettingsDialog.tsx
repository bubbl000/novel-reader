import { useState } from 'react'
import { useMangaStore } from '../stores/mangaStore'
import { open } from '@tauri-apps/plugin-dialog'
import { useTranslation } from '../i18n/useTranslation'
import { Language } from '../i18n/translations'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const { libraryPaths, addLibraryPath, removeLibraryPath, scanAndLoad, isScanning, language, setLanguage } = useMangaStore()
  const { t } = useTranslation()
  const [newPath, setNewPath] = useState('')

  const handleSelectAndAdd = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('settings.selectDirectory'),
      })
      if (selected && typeof selected === 'string') {
        await addLibraryPath(selected)
        setNewPath('')
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
    }
  }

  const handleAddPath = async () => {
    if (newPath.trim()) {
      await addLibraryPath(newPath.trim())
      setNewPath('')
    }
  }

  const handleRemovePath = async (path: string) => {
    await removeLibraryPath(path)
  }

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang)
  }

  const handleSaveAndScan = async () => {
    await scanAndLoad()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative bg-bg-card rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border-1">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('settings.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bg-hover rounded text-text-secondary"
          >
            ×
          </button>
        </div>

        <div className="p-4 flex-1 overflow-auto">
          <div className="mb-6">
            <h3 className="text-sm font-medium text-text-primary mb-3">
              {t('settings.language')}
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleLanguageChange('zh')}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  language === 'zh'
                    ? 'bg-accent text-accent-text'
                    : 'bg-bg-input border border-border-1 text-text-secondary hover:text-text-primary'
                }`}
              >
                简体中文
              </button>
              <button
                onClick={() => handleLanguageChange('en')}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  language === 'en'
                    ? 'bg-accent text-accent-text'
                    : 'bg-bg-input border border-border-1 text-text-secondary hover:text-text-primary'
                }`}
              >
                English
              </button>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-medium text-text-primary mb-3">
              {t('settings.libraryPaths')}
            </h3>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddPath()
                  }
                }}
                placeholder={t('settings.enterPath')}
                className="flex-1 px-3 py-2 bg-bg-input border border-border-1 rounded text-text-primary text-sm focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleSelectAndAdd}
                className="px-4 py-2 bg-accent hover:bg-accent-hover rounded text-accent-text text-sm font-medium whitespace-nowrap"
              >
                {t('settings.add')}
              </button>
            </div>

            {libraryPaths.length > 0 ? (
              <div className="space-y-2">
                {libraryPaths.map((path, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-bg-panel rounded border border-border-1"
                  >
                    <span className="text-text-secondary text-sm truncate flex-1 mr-2">
                      {path}
                    </span>
                    <button
                      onClick={() => handleRemovePath(path)}
                      className="p-1 text-text-muted hover:text-red-400 transition-colors"
                      title={t('settings.remove')}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-text-muted text-sm text-center py-4">
                {t('settings.noPaths')}
              </p>
            )}

            {isScanning && (
              <p className="text-accent text-sm mt-2">
                {t('settings.scanning')}
              </p>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border-1 flex justify-end">
          <button
            onClick={handleSaveAndScan}
            className="px-4 py-2 bg-accent hover:bg-accent-hover rounded text-accent-text text-sm font-medium"
          >
            {t('settings.saveAndScan')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsDialog
