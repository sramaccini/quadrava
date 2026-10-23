// Quadrava Studio as a desktop application (ADR-17): the web build of Studio in the system webview, with native dialogs
// and file access for the project folders. All the logic stays in the web application.

// No console window next to the application on Windows, in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        // Folder chooser for «Open project folder…»; the chosen folder joins the scope of the fs plugin.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Keeps the chosen folders in the scope between sessions, so the last project reopens at start.
        .plugin(tauri_plugin_persisted_scope::init())
        .run(tauri::generate_context!())
        .expect("error while running Quadrava Studio");
}
