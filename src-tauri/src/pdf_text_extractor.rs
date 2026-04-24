use serde::{Deserialize, Serialize};
use std::path::Path;
use lopdf::Document;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfTextPage {
    pub page_number: usize,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfExtractResult {
    pub pages: Vec<PdfTextPage>,
    pub total_pages: usize,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfOutlineItem {
    pub title: String,
    pub page_number: usize,
    pub level: usize,
}

pub fn extract_text_from_pdf(file_path: &str) -> Result<PdfExtractResult, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let doc = Document::load(path)
        .map_err(|e| format!("无法加载PDF文件 {}: {}", file_path, e))?;

    let total_pages = doc.get_pages().len();

    let title = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "未知PDF".to_string());

    let mut pages = Vec::with_capacity(total_pages);

    let page_numbers: Vec<u32> = {
        let mut nums: Vec<u32> = doc.get_pages().keys().copied().collect();
        nums.sort();
        nums
    };

    for (idx, &page_num) in page_numbers.iter().enumerate() {
        let text = extract_page_text(&doc, page_num);
        pages.push(PdfTextPage {
            page_number: idx + 1,
            text,
        });
    }

    Ok(PdfExtractResult {
        pages,
        total_pages,
        title,
    })
}

fn extract_page_text(doc: &Document, page_num: u32) -> String {
    let text = doc.extract_text(&[page_num]).unwrap_or_default();

    text.replace('\0', "")
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn extract_pdf_outline(file_path: &str) -> Result<Vec<PdfOutlineItem>, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let doc = Document::load(path)
        .map_err(|e| format!("无法加载PDF文件 {}: {}", file_path, e))?;

    let mut outline_items = Vec::new();

    if let Ok(toc) = doc.get_toc() {
        collect_toc_items(&toc, &mut outline_items);
    }

    Ok(outline_items)
}

fn collect_toc_items(toc: &lopdf::Toc, items: &mut Vec<PdfOutlineItem>) {
    for item in &toc.toc {
        items.push(PdfOutlineItem {
            title: item.title.clone(),
            page_number: item.page.max(1),
            level: item.level,
        });
    }
}

pub fn extract_pdf_page_count(file_path: &str) -> Result<usize, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let doc = Document::load(path)
        .map_err(|e| format!("无法加载PDF文件 {}: {}", file_path, e))?;

    Ok(doc.get_pages().len())
}
