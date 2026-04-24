pub mod sort_utils;
pub mod database;
pub mod events;
pub mod file_operations;
pub mod folder_manager;
pub mod library_scanner;
pub mod settings;
pub mod pdf_text_extractor;
pub mod txt_parser;
pub mod md_parser;
pub mod search_engine;
pub mod reading_stats;

pub fn setup() {
    println!("Novel Reader initialized");
}
