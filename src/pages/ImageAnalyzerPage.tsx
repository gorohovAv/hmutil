import { useState, useRef, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";

interface ImageData {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
}

interface PointData {
  id: string;
  x: number;
  y: number; // От верхнего левого угла (для внутреннего использования)
  yBottom: number; // От нижнего левого угла (для отображения)
  whiteness: number;
  sourceImageId: string;
}

export default function ImageAnalyzerPage() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [fixedPoints, setFixedPoints] = useState<PointData[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleSelectImages = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "PNG Images", extensions: ["png"] }],
    });

    if (!selected || !Array.isArray(selected)) return;

    // Ограничение: всего не более 3 картинок
    const availableSlots = 3 - images.length;
    if (availableSlots <= 0) {
      alert("Можно загрузить максимум 3 картинки. Удалите старые, чтобы добавить новые.");
      return;
    }

    const filesToAdd = selected.slice(0, availableSlots);
    
    const newImages: ImageData[] = await Promise.all(
      filesToAdd.map(async (filePath, index) => {
        const fileName = filePath.split(/[/\\]/).pop() || "unknown.png";
        // Конвертируем путь к файлу в URL для Tauri
        const fileSrc = convertFileSrc(filePath);
        
        return {
          id: `img-${Date.now()}-${index}`,
          name: fileName,
          src: fileSrc,
          width: 0,
          height: 0,
        };
      })
    );

    // Добавляем новые картинки к существующим
    setImages((prev) => [...prev, ...newImages]);
    setFixedPoints([]);
    setHoverPoint(null);
    setActiveImageId(null);
  };

  const handleImageLoad = (id: string, width: number, height: number) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, width, height } : img))
    );
  };

  const calculateWhiteness = (imgElement: HTMLImageElement, x: number, y: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;

    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;

    // Рисуем изображение на канвасе для чтения пикселей
    ctx.drawImage(imgElement, 0, 0);
    
    // Получаем данные пикселя
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const r = pixel[0];
    const g = pixel[1];
    const b = pixel[2];

    // Формула белоты: среднее арифметическое RGB в процентах (0-100)
    // Черный (0,0,0) = 0%, Белый (255,255,255) = 100%
    const whiteness = ((r + g + b) / (3 * 255)) * 100;
    return Math.round(whiteness * 10) / 10; // Округление до 1 знака
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLImageElement>, img: ImageData) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.floor(e.clientX - rect.left);
      const y = Math.floor(e.clientY - rect.top);

      // Ограничиваем координаты пределами изображения
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

  const clearAllImages = () => {
    setImages([]);
    setFixedPoints([]);
    setHoverPoint(null);
    setActiveImageId(null);
  };

  return (
    <div className="analyzer-container">
      <h1>Анализатор изображений</h1>
      
      <div className="controls">
        <button onClick={handleSelectImages} disabled={images.length >= 3}>
          {images.length === 0 
            ? "Выбрать PNG картинки (макс. 3)" 
            : `Добавить ещё (${3 - images.length} осталось)`}
        </button>
        {images.length > 0 && (
          <button onClick={clearAllImages} style={{ marginLeft: '10px', backgroundColor: '#ffebee', color: '#c62828' }}>
            Очистить всё
          </button>
        )}
      </div>

      {images.length > 0 && (
        <>
          <div className="images-row">
            {images.map((img) => (
              <div key={img.id} className="image-wrapper">
                <img
                  data-id={img.id}
                  src={img.src}
                  alt={img.name}
                  onLoad={(e) => handleImageLoad(img.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                  onMouseMove={(e) => handleMouseMove(e, img)}
                  onMouseLeave={handleMouseLeave}
                  onClick={handleClick}
                  className="analyzer-image"
                />
                
                {/* Отображение точки наведения на текущем изображении */}
                {hoverPoint && activeImageId === img.id && (
                  <div
                    className="marker hover-marker"
                    style={{ left: hoverPoint.x, top: hoverPoint.y }}
                  />
                )}
                
                {/* Отображение точки наведения на ДРУГИХ изображениях по тем же координатам */}
                {hoverPoint && activeImageId !== img.id && (
                  <div
                    className="marker sync-marker"
                    style={{ left: hoverPoint.x, top: hoverPoint.y }}
                  />
                )}

                {/* Отображение зафиксированных точек на всех изображениях */}
                {fixedPoints.map((point) => (
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
            <h3>Зафиксированные точки ({fixedPoints.length})</h3>
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
                        <button className="remove-btn" onClick={() => removePoint(point.id)}>×</button>
                      </div>
                      <div className="card-body">
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

      {/* Скрытый канвас для вычислений */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}