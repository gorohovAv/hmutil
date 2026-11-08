import { useState, useRef, useCallback } from "react";
import "./ImageAnalyzerPage.css";

interface ImageData {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  error?: string;
  loading?: boolean;
}

interface PointData {
  id: string;
  name: string;
  x: number;
  y: number;
  yBottom: number;
  whiteness: number;
  sourceImageId: string;
}

export default function ImageAnalyzerPage() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [fixedPoints, setFixedPoints] = useState<PointData[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectImages = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const availableSlots = 3 - images.length;
    if (availableSlots <= 0) {
      alert("Можно загрузить максимум 3 картинки. Удалите старые, чтобы добавить новые.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const filesToAdd = Array.from(files).slice(0, availableSlots);

    const newImages: ImageData[] = await Promise.all(
      filesToAdd.map(async (file, index) => {
        try {
          console.log(`Обработка файла: ${file.name}`);

          const arrayBuffer = await file.arrayBuffer();
          const blob = new Blob([arrayBuffer], { type: file.type || "image/png" });
          const blobUrl = URL.createObjectURL(blob);

          console.log(`Файл ${file.name} успешно преобразован в Blob URL`);

          return {
            id: `img-${Date.now()}-${index}`,
            name: file.name,
            src: blobUrl,
            width: 0,
            height: 0,
            loading: true,
          };
        } catch (error) {
          console.error(`Ошибка чтения файла ${file.name}:`, error);
          return {
            id: `img-${Date.now()}-${index}`,
            name: file.name,
            src: "",
            width: 0,
            height: 0,
            loading: false,
            error: `Не удалось прочитать файл: ${error}`,
          };
        }
      })
    );

    setImages((prev) => [...prev, ...newImages]);
    setFixedPoints([]);
    setHoverPoint(null);
    setActiveImageId(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImageLoad = (id: string, width: number, height: number) => {
    console.log(`Изображение ${id} загружено: ${width}x${height}`);
    setImages((prev) =>
      prev.map((img) =>
        img.id === id ? { ...img, width, height, loading: false, error: undefined } : img
      )
    );
  };

  const handleImageError = (id: string, error: string) => {
    console.error(`Ошибка загрузки изображения ${id}:`, error);
    setImages((prev) =>
      prev.map((img) =>
        img.id === id ? { ...img, loading: false, error } : img
      )
    );
  };

  const calculateWhiteness = (imgElement: HTMLImageElement, x: number, y: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;

    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;

    ctx.drawImage(imgElement, 0, 0);

    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const r = pixel[0];
    const g = pixel[1];
    const b = pixel[2];

    const whiteness = ((r + g + b) / (3 * 255)) * 100;
    return Math.round(whiteness * 10) / 10;
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLImageElement>, img: ImageData) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.floor(e.clientX - rect.left);
      const y = Math.floor(e.clientY - rect.top);

      if (x < 0 || x >= img.width || y < 0 || y >= img.height) {
        setHoverPoint(null);
        setActiveImageId(null);
        return;
      }

      setHoverPoint({ x, y });
      setActiveImageId(img.id);
    },
    []
  );

  const handleMouseLeave = () => {
    setHoverPoint(null);
    setActiveImageId(null);
  };

  const handleClick = () => {
    if (!hoverPoint || !activeImageId) return;

    const activeImg = images.find((img) => img.id === activeImageId);
    if (!activeImg) return;

    const imgElement = document.querySelector(`img[data-id="${activeImageId}"]`) as HTMLImageElement;
    const whiteness = imgElement ? calculateWhiteness(imgElement, hoverPoint.x, hoverPoint.y) : 0;

    const newPoint: PointData = {
      id: `point-${Date.now()}`,
      name: "",
      x: hoverPoint.x,
      y: hoverPoint.y,
      yBottom: activeImg.height - hoverPoint.y,
      whiteness,
      sourceImageId: activeImageId,
    };

    setFixedPoints((prev) => [...prev, newPoint]);
  };

  const removePoint = (id: string) => {
    setFixedPoints((prev) => prev.filter((p) => p.id !== id));
  };

  const updatePointName = (id: string, newName: string) => {
    setFixedPoints((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: newName } : p))
    );
  };

  const handleCopyToClipboard = async () => {
    if (fixedPoints.length === 0) {
      alert("Нет точек для копирования");
      return;
    }

    const exportData = fixedPoints.map((point, index) => ({
      id: index + 1,
      name: point.name || "",
      x: String(point.x),
      y: String(point.y),
    }));

    try {
      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
      alert("Данные успешно скопированы в буфер обмена!");
    } catch (err) {
      console.error("Ошибка копирования: ", err);
      alert("Не удалось скопировать данные в буфер обмена.");
    }
  };

  const clearAllImages = () => {
    images.forEach((img) => {
      if (img.src.startsWith("blob:")) {
        URL.revokeObjectURL(img.src);
      }
    });

    setImages([]);
    setFixedPoints([]);
    setHoverPoint(null);
    setActiveImageId(null);
  };

  return (
    <div className="analyzer-container">
      <h1 className="page-heading">Анализатор изображений</h1>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/png"
        multiple
        onChange={handleFileChange}
      />

      <div className="controls">
        <button onClick={handleSelectImages} disabled={images.length >= 3}>
          {images.length === 0
            ? "Выбрать PNG картинки (макс. 3)"
            : `Добавить ещё (${3 - images.length} осталось)`}
        </button>
        {images.length > 0 && (
          <button className="danger-outline" onClick={clearAllImages}>
            Очистить всё
          </button>
        )}
      </div>

      {images.length > 0 && (
        <>
          <div className="images-row">
            {images.map((img) => (
              <div key={img.id} className="image-wrapper">
                {img.loading && <div className="loading-state">Загрузка...</div>}

                {img.error && (
                  <div className="error-state">
                    <div>Ошибка загрузки</div>
                    <small>{img.name}</small>
                  </div>
                )}

                <img
                  data-id={img.id}
                  src={img.src}
                  alt={img.name}
                  onLoad={(e) =>
                    handleImageLoad(img.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
                  }
                  onError={() => handleImageError(img.id, "Failed to load")}
                  onMouseMove={(e) => handleMouseMove(e, img)}
                  onMouseLeave={handleMouseLeave}
                  onClick={handleClick}
                  className="analyzer-image"
                  style={{ display: img.loading || img.error ? "none" : "block" }}
                />

                {!img.loading && !img.error && hoverPoint && activeImageId === img.id && (
                  <div
                    className="marker hover-marker"
                    style={{ left: hoverPoint.x, top: hoverPoint.y }}
                  />
                )}

                {!img.loading && !img.error && hoverPoint && activeImageId !== img.id && (
                  <div
                    className="marker sync-marker"
                    style={{ left: hoverPoint.x, top: hoverPoint.y }}
                  />
                )}

                {!img.loading &&
                  !img.error &&
                  fixedPoints.map((point) => (
                    <div
                      key={point.id}
                      className="marker fixed-marker"
                      style={{ left: point.x, top: point.y }}
                      title={`X: ${point.x}, Y(низ): ${point.yBottom}, Белота: ${point.whiteness}%`}
                    />
                  ))}
              </div>
            ))}
          </div>

          <div className="cards-container">
            <div className="flex-between mb-0" style={{ marginBottom: "var(--spacing-lg)" }}>
              <h3 className="mb-0" style={{ borderBottom: "none", paddingBottom: 0, marginBottom: 0 }}>
                Зафиксированные точки ({fixedPoints.length})
              </h3>
              {fixedPoints.length > 0 && (
                <button className="success sm" onClick={handleCopyToClipboard}>
                  Скопировать в буфер обмена
                </button>
              )}
            </div>

            {fixedPoints.length === 0 ? (
              <p className="empty-state">Кликните на изображение, чтобы зафиксировать точку</p>
            ) : (
              <div className="cards-grid">
                {fixedPoints.map((point) => {
                  const sourceImg = images.find((img) => img.id === point.sourceImageId);
                  return (
                    <div key={point.id} className="data-card">
                      <div className="card-header">
                        <span className="card-title" title={sourceImg?.name || "Unknown"}>
                          {sourceImg?.name || "Unknown"}
                        </span>
                        <button className="remove-btn" onClick={() => removePoint(point.id)}>
                          ×
                        </button>
                      </div>
                      <div className="card-body">
                        <div className="metric-name-row">
                          <span className="metric-label">Имя точки:</span>
                          <input
                            type="text"
                            className="metric-input"
                            value={point.name}
                            onChange={(e) => updatePointName(point.id, e.target.value)}
                            placeholder="Например: coal1"
                          />
                        </div>
                        <div className="metric">
                          <span className="metric-label">X:</span>
                          <span className="metric-value">{point.x} px</span>
                        </div>
                        <div className="metric">
                          <span className="metric-label">Y (от низа):</span>
                          <span className="metric-value">{point.yBottom} px</span>
                        </div>
                        <div className="metric whiteness-metric">
                          <span className="metric-label">Белота:</span>
                          <span className="metric-value">{point.whiteness}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}