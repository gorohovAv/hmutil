import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

export default function ImgToHmPage() {
  const [imgPath, setImgPath] = useState<string>("");
  const [outDir, setOutDir] = useState<string>("");
  const [manualResolution, setManualResolution] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");

  const selectFile = async () => {
    const selected = await open({
      filters: [{ name: "PDS Image", extensions: ["img", "IMG"] }],
    });
    if (selected) {
      setImgPath(selected as string);
    }
  };

  const selectDir = async () => {
    const selected = await open({
      directory: true,
    });
    if (selected) {
      setOutDir(selected as string);
    }
  };

  const handleProcess = async () => {
    if (!imgPath || !outDir) {
      setStatus("Ошибка: Выберите файл и папку для выгрузки");
      return;
    }

    let resValue: number | null = null;
    if (manualResolution.trim() !== "") {
      const parsed = parseFloat(manualResolution);
      if (isNaN(parsed) || parsed <= 0) {
        setStatus("Ошибка: Неверное значение разрешения. Введите число > 0");
        return;
      }
      resValue = parsed;
    }

    setIsProcessing(true);
    setStatus("Обработка... Это может занять некоторое время.");
    
    try {
      const result = await invoke<string>("process_img_to_tiles", {
        imgPath,
        outDir,
        manualResolution: resValue,
      });
      setStatus(`✅ Успех:\n${result}`);
    } catch (error) {
      setStatus(`❌ Ошибка: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="analyzer-container">
      <h2>Конвертер PDS IMG в PNG тайлы</h2>
      <div className="cards-container">
        <div className="form-group" style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
            1. Выберите исходный .IMG файл:
          </label>
          <div style={{ display: "flex", gap: "1rem" }}>
            <input 
              type="text" 
              value={imgPath} 
              readOnly 
              placeholder="Путь к файлу не выбран"
              style={{ flex: 1, padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
            />
            <button onClick={selectFile} disabled={isProcessing}>Обзор...</button>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
            2. Разрешение (м/пиксель):
          </label>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <input 
              type="number" 
              step="0.01"
              min="0.01"
              value={manualResolution}
              onChange={(e) => setManualResolution(e.target.value)}
              placeholder="Авто (из заголовка)"
              style={{ width: "200px", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
            />
            <span style={{ fontSize: "0.85rem", color: "#666" }}>
              Оставьте пустым для автоопределения, или укажите точно (напр., 1.0 или 0.25 для HiRISE)
            </span>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
            3. Выберите папку для выгрузки PNG:
          </label>
          <div style={{ display: "flex", gap: "1rem" }}>
            <input 
              type="text" 
              value={outDir} 
              readOnly 
              placeholder="Папка не выбрана"
              style={{ flex: 1, padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
            />
            <button onClick={selectDir} disabled={isProcessing}>Обзор...</button>
          </div>
        </div>

        <button 
          onClick={handleProcess} 
          disabled={isProcessing || !imgPath || !outDir}
          style={{ width: "100%", padding: "0.75rem", fontSize: "1.1rem", fontWeight: 600 }}
        >
          {isProcessing ? "Обработка..." : "Запустить конвертацию"}
        </button>

        {status && (
          <div 
            className={`status-message ${status.startsWith("❌") ? "error-state" : "loading-state"}`}
            style={{ marginTop: "1.5rem", whiteSpace: "pre-wrap" }}
          >
            {status}
          </div>
        )}
      </div>
    </div>
  );
}