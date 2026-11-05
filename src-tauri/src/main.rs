#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        // Инициализируем плагин диалога
        .plugin(tauri_plugin_dialog::init())
        // Инициализируем плагин opener (уже был в зависимостях)
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
