use image::{GrayImage, Luma};
use regex::Regex;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

fn parse_pds_header(path: &Path) -> Result<HashMap<String, String>, String> {
    let mut file = File::open(path).map_err(|e| format!("Не удалось открыть файл: {}", e))?;
    let mut buffer = vec![0u8; 300_000];
    let bytes_read = file.read(&mut buffer).map_err(|e| e.to_string())?;
    buffer.truncate(bytes_read);

    let text = String::from_utf8_lossy(&buffer);
    let re_end = Regex::new(r"(?m)^\s*END\s*$").map_err(|e| e.to_string())?;
    let end_match = re_end.find(&text).ok_or("Не найден маркер END в заголовке")?;
    let header_text = &text[..end_match.start()];

    let re_key_val = Regex::new(r"(?m)^([A-Z0-9_^]+)\s*=\s*(.+)$").map_err(|e| e.to_string())?;
    let mut header = HashMap::new();

    for line in header_text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("/*") {
            continue;
        }
        if let Some(caps) = re_key_val.captures(line) {
            let key = caps.get(1).unwrap().as_str().to_string();
            let mut val = caps.get(2).unwrap().as_str().trim().to_string();
            if let Some(idx) = val.find("/*") {
                val = val[..idx].trim().to_string();
            }
            header.insert(key, val);
        }
    }
    Ok(header)
}

fn get_int(header: &HashMap<String, String>, key: &str, default: Option<i32>) -> Result<i32, String> {
    let v = header.get(key).ok_or_else(|| format!("Нет ключа {}", key))?;
    let re = Regex::new(r"^[-+]?\d+").map_err(|e| e.to_string())?;
    let m = re.find(v).ok_or_else(|| format!("{}={} не является целым числом", key, v))?;
    m.as_str().parse::<i32>().map_err(|_| format!("{}={} не парсится в i32", key, v))
}

fn get_float(header: &HashMap<String, String>, key: &str, default: Option<f32>) -> Result<f32, String> {
    let v = header.get(key).ok_or_else(|| format!("Нет ключа {}", key))?;
    let re = Regex::new(r"^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?").map_err(|e| e.to_string())?;
    let m = re.find(v).ok_or_else(|| format!("{}={} не является числом", key, v))?;
    m.as_str().parse::<f32>().map_err(|_| format!("{}={} не парсится в f32", key, v))
}

fn calculate_percentile(data: &[f32], percentile: f64) -> f32 {
    let mut filtered: Vec<f32> = data.iter().copied().filter(|x| !x.is_nan()).collect();
    if filtered.is_empty() {
        return 0.0;
    }
    filtered.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let index = (percentile / 100.0) * (filtered.len() - 1) as f64;
    let lower = index.floor() as usize;
    let upper = index.ceil() as usize;
    if lower == upper || upper >= filtered.len() {
        filtered[lower]
    } else {
        let weight = index - lower as f64;
        filtered[lower] * (1.0 - weight) as f32 + filtered[upper] * weight as f32
    }
}

#[tauri::command]
fn process_img_to_tiles(
    img_path: String, 
    out_dir: String, 
    manual_resolution: Option<f32>
) -> Result<String, String> {
    let path = Path::new(&img_path);
    let header = parse_pds_header(path)?;

    let lines = get_int(&header, "LINES", None)? as usize;
    let samples = get_int(&header, "LINE_SAMPLES", None)? as usize;
    let record_bytes = get_int(&header, "RECORD_BYTES", Some(0))? as usize;

    let image_ptr_str = header.get("^IMAGE").ok_or("Нет ключа ^IMAGE")?;
    let re_ptr = Regex::new(r"^(\d+)").map_err(|e| e.to_string())?;
    let caps = re_ptr.captures(image_ptr_str).ok_or("^IMAGE не содержит число")?;
    let record = caps.get(1).unwrap().as_str().parse::<usize>().map_err(|_| "^IMAGE не парсится")?;
    let offset = (record.saturating_sub(1)) * record_bytes;

    let n_vals = lines * samples;
    let n_bytes = n_vals * 4;

    let mut file = File::open(path).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(offset as u64)).map_err(|e| e.to_string())?;
    let mut raw = vec![0u8; n_bytes];
    file.read_exact(&mut raw).map_err(|e| format!("Не удалось прочитать данные: {}", e))?;

    let mut arr: Vec<f32> = Vec::with_capacity(n_vals);
    for chunk in raw.chunks_exact(4) {
        arr.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }

    if let Some(missing_const_str) = header.get("MISSING_CONSTANT") {
        let re_hex = Regex::new(r"16#([0-9A-Fa-f]+)#").map_err(|e| e.to_string())?;
        if let Some(caps) = re_hex.captures(missing_const_str) {
            let hex_str = caps.get(1).unwrap().as_str();
            if let Ok(val_u32) = u32::from_str_radix(hex_str, 16) {
                let missing_val = f32::from_le_bytes(val_u32.to_le_bytes());
                for val in &mut arr {
                    if (*val - missing_val).abs() < 1e-6 {
                        *val = f32::NAN;
                    }
                }
            }
        }
    }

    let val_min_header = get_float(&header, "VALID_MINIMUM", None).ok();
    let val_max_header = get_float(&header, "VALID_MAXIMUM", None).ok();

    // 1. Определение исходного разрешения (приоритет у ручного ввода)
    let mut src_res = if let Some(manual_res) = manual_resolution {
        if manual_res <= 0.0 {
            return Err("Ручное разрешение должно быть больше 0".to_string());
        }
        manual_res
    } else {
        let mut res = get_float(&header, "MAP_SCALE", Some(1.0))?;
        if res < 0.1 {
            res *= 1000.0; // Если в км, переводим в метры
        }
        res
    };

    let target_res = 3.0;
    
    // 2. Ресемплинг с явным возвратом новых размерностей
    let (final_w, final_h, final_arr) = if src_res < target_res {
        let factor = target_res / src_res;
        let f = factor.round() as usize;
        if f > 1 {
            let w2 = (samples / f) * f;
            let h2 = (lines / f) * f;
            if w2 > 0 && h2 > 0 {
                let new_w = w2 / f;
                let new_h = h2 / f;
                let mut out = vec![f32::NAN; new_h * new_w];

                for oy in 0..new_h {
                    for ox in 0..new_w {
                        let mut sum = 0.0;
                        let mut count = 0u32;
                        for iy in 0..f {
                            for ix in 0..f {
                                let idx = (oy * f + iy) * w2 + (ox * f + ix);
                                let val = arr[idx];
                                if !val.is_nan() {
                                    sum += val;
                                    count += 1;
                                }
                            }
                        }
                        if count > 0 {
                            out[oy * new_w + ox] = sum / (count as f32);
                        }
                    }
                }
                (new_w, new_h, out)
            } else {
                (samples, lines, arr) // Fallback, если что-то пошло не так
            }
        } else {
            (samples, lines, arr)
        }
    } else {
        (samples, lines, arr)
    };

    // 3. Нормализация
    let (vmin, vmax) = if let (Some(vmin), Some(vmax)) = (val_min_header, val_max_header) {
        (vmin, vmax)
    } else {
        (calculate_percentile(&final_arr, 1.0), calculate_percentile(&final_arr, 99.0))
    };

    // 4. Нарезка на тайлы
    let tile_size = 1024usize;
    let ncols = final_w / tile_size;
    let nrows = final_h / tile_size;

    if ncols == 0 || nrows == 0 {
        return Err(format!(
            "Изображение ({}x{}) слишком маленькое для создания хотя бы одного тайла {}x{}",
            final_w, final_h, tile_size, tile_size
        ));
    }

    let base_name = Path::new(&img_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("tile")
        .to_string();

    let mut idx = 0;
    for row in 0..nrows {
        for col in 0..ncols {
            let x0 = col * tile_size;
            let y0 = row * tile_size;

            let mut img = GrayImage::new(tile_size as u32, tile_size as u32);
            let mut range = vmax - vmin;
            if range <= 0.0 {
                range = 1.0;
            }

            for y in 0..tile_size {
                for x in 0..tile_size {
                    let arr_idx = (y0 + y) * final_w + (x0 + x);
                    let val = final_arr[arr_idx];
                    if val.is_nan() {
                        img.put_pixel(x as u32, y as u32, Luma([0]));
                    } else {
                        let norm = ((val - vmin) / range).clamp(0.0, 1.0);
                        img.put_pixel(x as u32, y as u32, Luma([(norm * 255.0) as u8]));
                    }
                }
            }

            let out_path = Path::new(&out_dir).join(format!("{}_{}.png", base_name, idx));
            img.save(&out_path).map_err(|e| format!("Ошибка сохранения {}: {}", out_path.display(), e))?;
            idx += 1;
        }
    }

    Ok(format!("Успешно создано {} тайлов в {}\n(Использовано разрешение: {:.2} м/пиксель)", idx, out_dir, src_res))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![process_img_to_tiles])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}