#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sort_utils;
mod database;
mod events;
mod file_operations;
mod folder_manager;
mod library_scanner;
mod settings;
mod pdf_text_extractor;
mod txt_parser;
mod md_parser;

use tauri::{AppHandle, Emitter, Manager, State};
use database::AppState;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::LazyLock;

const MAX_RECURSION_DEPTH: usize = 20;

#[tauri::command]
async fn scan_directory(app: AppHandle, directory: String) -> library_scanner::ScanResult {
    let app_clone = app.clone();
    let dir_clone = directory.clone();
    tokio::task::spawn_blocking(move || {
        events::emit_scan_progress(&app_clone, "started", "开始扫描...", Some(0.0));
        let result = library_scanner::scan_book_directory(&dir_clone);
        events::emit_scan_progress(&app_clone, "completed", "扫描完成", Some(100.0));
        result
    }).await.unwrap()
}

#[tauri::command]
fn load_settings() -> Result<settings::AppSettings, String> {
    settings::load_settings()
}

#[tauri::command]
fn save_settings(settings_data: settings::AppSettings) -> Result<(), String> {
    settings::save_settings(&settings_data)
}

#[tauri::command]
fn add_library_path(app: AppHandle, path: String) -> Result<Vec<String>, String> {
    let result = settings::add_library_path(path.clone());
    if result.is_ok() {
        events::emit_path_added(&app, &path);
    }
    result
}

#[tauri::command]
fn remove_library_path(app: AppHandle, path: String) -> Result<Vec<String>, String> {
    let result = settings::remove_library_path(&path);
    if result.is_ok() {
        events::emit_path_removed(&app, &path);
    }
    result
}

#[tauri::command]
fn init_db() -> Result<(), String> {
    database::init_database_schema()
}

#[tauri::command]
fn save_book_metadata(state: State<AppState>, book: database::BookMetadata) -> Result<i64, String> {
    database::upsert_book_metadata(&state, &book)
}

#[tauri::command]
fn batch_save_book_metadata(state: State<AppState>, books: Vec<database::BookMetadata>) -> Result<Vec<i64>, String> {
    database::batch_upsert_book_metadata(&state, &books)
}

#[tauri::command]
fn get_all_books_metadata(state: State<AppState>) -> Result<Vec<database::BookMetadata>, String> {
    database::get_all_books(&state)
}

#[tauri::command]
fn get_book_by_path(state: State<AppState>, path: String) -> Result<Option<database::BookMetadata>, String> {
    database::get_book_by_path(&state, &path)
}

#[tauri::command]
fn get_book_id_by_path(state: State<AppState>, path: String) -> Result<Option<i64>, String> {
    database::get_book_id_by_path(&state, &path)
}

#[tauri::command]
fn update_book_last_opened(state: State<AppState>, book_id: i64) -> Result<(), String> {
    database::update_book_last_opened(&state, book_id)
}

#[tauri::command]
fn save_reading_progress(
    app: AppHandle,
    state: State<AppState>,
    book_id: i64,
    current_page: i64,
    total_pages: i64,
    current_chapter: Option<i64>,
    chapter_offset: Option<i64>,
) -> Result<(), String> {
    let result = database::save_reading_progress(&state, book_id, current_page, total_pages, current_chapter, chapter_offset);
    if result.is_ok() {
        events::emit_reading_progress_saved(&app, book_id, current_page);
    }
    result
}

#[tauri::command]
fn get_reading_progress(state: State<AppState>, book_id: i64) -> Result<Option<database::ReadingProgress>, String> {
    database::get_reading_progress(&state, book_id)
}

#[tauri::command]
fn save_chapters(state: State<AppState>, book_id: i64, chapters: Vec<database::Chapter>) -> Result<(), String> {
    database::save_chapters(&state, book_id, &chapters)
}

#[tauri::command]
fn get_chapters(state: State<AppState>, book_id: i64) -> Result<Vec<database::Chapter>, String> {
    database::get_chapters(&state, book_id)
}

#[tauri::command]
fn add_bookmark(state: State<AppState>, book_id: i64, chapter_id: Option<i64>, offset: Option<i64>, title: String) -> Result<i64, String> {
    database::add_bookmark(&state, book_id, chapter_id, offset, &title)
}

#[tauri::command]
fn get_bookmarks(state: State<AppState>, book_id: i64) -> Result<Vec<database::Bookmark>, String> {
    database::get_bookmarks(&state, book_id)
}

#[tauri::command]
fn delete_bookmark(state: State<AppState>, bookmark_id: i64) -> Result<(), String> {
    database::delete_bookmark(&state, bookmark_id)
}

#[tauri::command]
fn add_highlight(
    state: State<AppState>,
    book_id: i64,
    chapter_id: Option<i64>,
    start_offset: i64,
    end_offset: i64,
    text_content: Option<String>,
    note: Option<String>,
    color: String,
) -> Result<i64, String> {
    database::add_highlight(&state, book_id, chapter_id, start_offset, end_offset, text_content.as_deref(), note.as_deref(), &color)
}

#[tauri::command]
fn get_highlights(state: State<AppState>, book_id: i64) -> Result<Vec<database::Highlight>, String> {
    database::get_highlights(&state, book_id)
}

#[tauri::command]
fn delete_highlight(state: State<AppState>, highlight_id: i64) -> Result<(), String> {
    database::delete_highlight(&state, highlight_id)
}

#[tauri::command]
fn add_to_favorites(app: AppHandle, state: State<AppState>, book_id: i64) -> Result<(), String> {
    let result = database::add_to_favorites(&state, book_id);
    if result.is_ok() {
        events::emit_favorite_toggled(&app, book_id, true);
    }
    result
}

#[tauri::command]
fn remove_from_favorites(app: AppHandle, state: State<AppState>, book_id: i64) -> Result<(), String> {
    let result = database::remove_from_favorites(&state, book_id);
    if result.is_ok() {
        events::emit_favorite_toggled(&app, book_id, false);
    }
    result
}

#[tauri::command]
fn is_favorite(state: State<AppState>, book_id: i64) -> Result<bool, String> {
    database::is_favorite(&state, book_id)
}

#[tauri::command]
fn get_favorite_books(state: State<AppState>) -> Result<Vec<database::BookMetadata>, String> {
    database::get_favorite_books(&state)
}

#[tauri::command]
fn add_tag_to_book(app: AppHandle, state: State<AppState>, book_id: i64, tag_name: String) -> Result<(), String> {
    let result = database::add_tag_to_book(&state, book_id, &tag_name);
    if result.is_ok() {
        events::emit_tag_added(&app, book_id, &tag_name);
    }
    result
}

#[tauri::command]
fn remove_tag_from_book(app: AppHandle, state: State<AppState>, book_id: i64, tag_id: i64) -> Result<(), String> {
    let result = database::remove_tag_from_book(&state, book_id, tag_id);
    if result.is_ok() {
        events::emit_tag_removed(&app, book_id, tag_id);
    }
    result
}

#[tauri::command]
fn get_book_tags(state: State<AppState>, book_id: i64) -> Result<Vec<database::Tag>, String> {
    database::get_book_tags(&state, book_id)
}

#[tauri::command]
fn get_all_tags(state: State<AppState>) -> Result<Vec<database::Tag>, String> {
    database::get_all_tags(&state)
}

#[tauri::command]
fn delete_tag_by_name(state: State<AppState>, tag_name: String) -> Result<(), String> {
    database::delete_tag_by_name(&state, &tag_name)
}

#[tauri::command]
fn get_books_by_tag(state: State<AppState>, tag_name: String) -> Result<Vec<database::BookMetadata>, String> {
    database::get_books_by_tag(&state, &tag_name)
}

#[tauri::command]
fn create_folder(parent_path: String, folder_name: String) -> folder_manager::FolderOperationResult {
    folder_manager::create_folder(&parent_path, &folder_name)
}

#[tauri::command]
fn rename_folder(old_path: String, new_name: String) -> folder_manager::FolderOperationResult {
    folder_manager::rename_folder(&old_path, &new_name)
}

#[tauri::command]
fn rename_file_or_folder(old_path: String, new_name: String) -> folder_manager::FolderOperationResult {
    folder_manager::rename_file_or_folder(&old_path, &new_name)
}

#[tauri::command]
fn delete_folder(folder_path: String, force: bool) -> folder_manager::FolderOperationResult {
    folder_manager::delete_folder(&folder_path, force)
}

#[tauri::command]
fn copy_file_to_folder(source_path: String, target_folder: String) -> file_operations::FileOperationResult {
    file_operations::copy_file_to_folder(&source_path, &target_folder)
}

#[tauri::command]
fn move_file_to_folder(source_path: String, target_folder: String) -> file_operations::FileOperationResult {
    file_operations::move_file_to_folder(&source_path, &target_folder)
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    file_operations::open_in_explorer(&path)
}

#[tauri::command]
fn delete_file_or_folder(path: String) -> Result<String, String> {
    file_operations::delete_file_or_folder(&path)
}

#[tauri::command]
fn count_books_in_folder(state: State<AppState>, folder_path: String) -> Result<usize, String> {
    database::count_books_in_folder(&state, &folder_path)
}

#[tauri::command]
fn create_subfolder(parent_path: String, folder_name: String) -> Result<String, String> {
    file_operations::create_subfolder(&parent_path, &folder_name)
}

#[tauri::command]
fn check_file_conflict(source_path: String, target_folder: String) -> Result<file_operations::CopyWithConflictResult, String> {
    file_operations::check_file_conflict(&source_path, &target_folder)
}

#[tauri::command]
fn copy_file_to_folder_with_suffix(source_path: String, target_folder: String) -> Result<String, String> {
    file_operations::copy_file_to_folder_with_suffix(&source_path, &target_folder)
}

#[tauri::command]
fn move_folder(source_path: String, target_parent_path: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    if !source.exists() || !source.is_dir() {
        return Err("源文件夹不存在".to_string());
    }
    let target_parent = Path::new(&target_parent_path);
    if !target_parent.exists() || !target_parent.is_dir() {
        return Err("目标父文件夹不存在".to_string());
    }
    let folder_name = source.file_name().unwrap().to_string_lossy().to_string();
    let target_path = target_parent.join(&folder_name);
    if target_path.exists() {
        return Err("目标文件夹已存在".to_string());
    }
    fs::rename(source, &target_path)
        .map_err(|e| format!("移动文件夹失败: {}", e))?;
    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_all_subfolders(root_path: String) -> Result<Vec<String>, String> {
    fn collect_folders(
        dir: &Path,
        result: &mut Vec<String>,
        visited: &mut HashSet<String>,
        current_depth: usize,
    ) -> Result<(), String> {
        if current_depth >= MAX_RECURSION_DEPTH {
            return Ok(());
        }

        let canonical = match fs::canonicalize(dir) {
            Ok(c) => c.to_string_lossy().to_string(),
            Err(e) => return Err(format!("无法解析路径 {}: {}", dir.display(), e)),
        };

        if visited.contains(&canonical) {
            return Ok(());
        }
        visited.insert(canonical);

        let metadata = match fs::symlink_metadata(dir) {
            Ok(m) => m,
            Err(e) => return Err(format!("无法读取元数据 {}: {}", dir.display(), e)),
        };

        if metadata.file_type().is_symlink() {
            return Ok(());
        }

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Ok(entry_metadata) = fs::symlink_metadata(&path) {
                    if entry_metadata.file_type().is_symlink() {
                        continue;
                    }
                }

                if path.is_dir() {
                    if let Some(s) = path.to_str() {
                        result.push(s.to_string());
                    }
                    collect_folders(&path, result, visited, current_depth + 1)?;
                }
            }
        }
        Ok(())
    }

    let mut folders = Vec::new();
    let mut visited = HashSet::new();
    collect_folders(Path::new(&root_path), &mut folders, &mut visited, 0)?;
    Ok(folders)
}

#[tauri::command]
async fn extract_pdf_text(file_path: String) -> Result<pdf_text_extractor::PdfExtractResult, String> {
    tokio::task::spawn_blocking(move || {
        pdf_text_extractor::extract_text_from_pdf(&file_path)
    }).await.unwrap()
}

#[tauri::command]
async fn extract_pdf_outline(file_path: String) -> Result<Vec<pdf_text_extractor::PdfOutlineItem>, String> {
    tokio::task::spawn_blocking(move || {
        pdf_text_extractor::extract_pdf_outline(&file_path)
    }).await.unwrap()
}

#[tauri::command]
async fn parse_txt_file(file_path: String) -> Result<txt_parser::TxtParseResult, String> {
    tokio::task::spawn_blocking(move || {
        txt_parser::parse_txt_file(&file_path)
    }).await.unwrap()
}

#[tauri::command]
async fn parse_md_file(file_path: String) -> Result<md_parser::MdParseResult, String> {
    tokio::task::spawn_blocking(move || {
        md_parser::parse_md_file(&file_path)
    }).await.unwrap()
}

#[tauri::command]
fn read_file_text(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let ext = path.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "txt" => {
            let result = txt_parser::parse_txt_file(&file_path)?;
            Ok(result.text)
        }
        "md" | "markdown" => {
            let result = md_parser::parse_md_file(&file_path)?;
            Ok(result.html_content)
        }
        _ => Err(format!("不支持的文件格式: {}", ext)),
    }
}

fn main() {
    if let Err(e) = database::init_database_schema() {
        eprintln!("数据库表初始化失败: {}", e);
    }

    let db_path = database::get_db_path();
    let app_state = AppState::new(&db_path).unwrap_or_else(|e| {
        panic!("数据库连接初始化失败: {}", e);
    });

    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            load_settings,
            save_settings,
            add_library_path,
            remove_library_path,
            init_db,
            save_book_metadata,
            batch_save_book_metadata,
            get_all_books_metadata,
            get_book_by_path,
            get_book_id_by_path,
            update_book_last_opened,
            save_reading_progress,
            get_reading_progress,
            save_chapters,
            get_chapters,
            add_bookmark,
            get_bookmarks,
            delete_bookmark,
            add_highlight,
            get_highlights,
            delete_highlight,
            add_to_favorites,
            remove_from_favorites,
            is_favorite,
            get_favorite_books,
            add_tag_to_book,
            remove_tag_from_book,
            get_book_tags,
            get_all_tags,
            delete_tag_by_name,
            get_books_by_tag,
            create_folder,
            rename_folder,
            rename_file_or_folder,
            delete_folder,
            copy_file_to_folder,
            move_file_to_folder,
            open_in_explorer,
            delete_file_or_folder,
            count_books_in_folder,
            create_subfolder,
            get_all_subfolders,
            check_file_conflict,
            copy_file_to_folder_with_suffix,
            move_folder,
            extract_pdf_text,
            extract_pdf_outline,
            parse_txt_file,
            parse_md_file,
            read_file_text,
        ])
        .setup(|app| {
            let main_window = app.get_webview_window("main")
                .ok_or_else(|| "Failed to get main window".to_string())?;
            main_window.set_title("Novel Reader - 书库")?;

            let app_handle = app.handle().clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, position: _ }) = event {
                    let paths_str: Vec<String> = paths.iter().map(|p| p.to_string_lossy().to_string()).collect();
                    let _ = app_handle.emit("tauri://file-drop", &paths_str);
                }
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Enter { paths: _, position: _ }) = event {
                    let _ = app_handle.emit("tauri://file-drop-enter", ());
                }
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Leave) = event {
                    let _ = app_handle.emit("tauri://file-drop-leave", ());
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
