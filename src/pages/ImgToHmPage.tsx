import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import "./ImgToHmPage.css";

export default function ImgToHmPage() {
  const [imgPath, setImgPath] = useState<string>("");
  const [outDir, setOutDir] = useState<string>("");
  const [manualResolution, setManualResolution] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [status, setStatus] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

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
      setStatus({ text: "Ошибка: Выберите файл и папку для выгрузки", type: "error" });
      return;
    }

    let resValue: number | null = null;
    if (manualResolution.trim() !== "") {
      const parsed = parseFloat(manualResolution);
      if (isNaN(parsed) || parsed <= 0) {
        setStatus({ text: "Ошибка: Неверное значение разрешения. Введите число > 0", type: "error" });
        return;
      }
      resValue = parsed;
    }

    setIsProcessing(true);
    setStatus({ text: "⏳ Обработка... Это может занять некоторое время.", type: "info" });

    try {
      const result = await invoke<string>("process_img_to_tiles", {
        imgPath,
        outDir,
        manualResolution: resValue,
      });
      setStatus({ text: `✅ Успех:\n${result}`, type: "success" });
    } catch (error) {
      setStatus({ text: `❌ Ошибка: ${error}`, type: "error" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="converter-page">
      <h2 className="page-heading">Конвертер PDS IMG в PNG тайлы</h2>

      <div className="cards-container">
        <div className="converter-form">
          <div className="form-group">
            <label>1. Выберите исходный .IMG файл:</label>
            <div className="form-row">
              <input
                type="text"
                value={imgPath}
                readOnly
                placeholder="Путь к файлу не выбран"
              />
              <button onClick={selectFile} disabled={isProcessing}>
                Обзор...
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>2. Разрешение (м/пиксель):</label>
            <div className="form-row">
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={manualResolution}
                onChange={(e) => setManualResolution(e.target.value)}
                placeholder="Авто (из заголовка)"
                style={{ maxWidth: "200px" }}
              />
            </div>
            <div className="form-hint">
              Оставьте пустым для автоопределения, или укажите точно (напр., 1.0 или 0.25 для HiRISE)
            </div>
          </div>

          <div className="form-group">
            <label>3. Выберите папку для выгрузки PNG:</label>
            <div className="form-row">
              <input
                type="text"
                value={outDir}
                readOnly
                placeholder="Папка не выбрана"
              />
              <button onClick={selectDir} disabled={isProcessing}>
                Обзор...
              </button>
            </div>
          </div>

          <div className="converter-actions">
            <button
              className="full-width lg"
              onClick={handleProcess}
              disabled={isProcessing || !imgPath || !outDir}
            >
              {isProcessing ? "Обработка..." : "Запустить конвертацию"}
            </button>
          </div>

          {status && (
            <div className={`status-message ${status.type} converter-status`}>
              {status.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}