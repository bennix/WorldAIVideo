import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Plus,
  Minus,
  RotateCcw,
  Download,
  ImagePlus,
  Video,
} from "lucide-react";
import { zoomImage } from "./image-transform";
export default function ImageViewer({
  asset,
  t,
  onClose,
  onDownload,
  onReference,
}) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const stage = useRef(null),
    gesture = useRef(null);
  const reset = () => setTransform({ scale: 1, x: 0, y: 0 });
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") onClose();
    };
    const wheel = (e) => {
      e.preventDefault();
      const rect = stage.current.getBoundingClientRect();
      const anchor = {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      };
      setTransform((previous) =>
        zoomImage(previous, Math.exp(-e.deltaY * 0.0015), anchor),
      );
    };
    const element = stage.current;
    element.addEventListener("wheel", wheel, { passive: false });
    document.addEventListener("keydown", key);
    return () => {
      element.removeEventListener("wheel", wheel);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div
      className="image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={t.imageViewer}
    >
      <header>
        <strong>{asset.name}</strong>
        <div>
          <button onClick={() => onReference("image")}>
            <ImagePlus size={15} />
            {t.referenceImage}
          </button>
          <button onClick={() => onReference("video")}>
            <Video size={15} />
            {t.referenceVideo}
          </button>
          <button onClick={onDownload}>
            <Download size={16} />
            {t.download}
          </button>
          <button aria-label={t.close} onClick={onClose}>
            <X size={22} />
          </button>
        </div>
      </header>
      <div
        className="image-stage"
        ref={stage}
        onDoubleClick={reset}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          gesture.current = {
            pointerId: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            start: transform,
          };
        }}
        onPointerMove={(e) => {
          const start = gesture.current;
          if (!start || start.pointerId !== e.pointerId) return;
          setTransform({
            ...start.start,
            x: start.start.x + e.clientX - start.x,
            y: start.start.y + e.clientY - start.y,
          });
        }}
        onPointerUp={() => {
          gesture.current = null;
        }}
        onPointerCancel={() => {
          gesture.current = null;
        }}
      >
        <img
          src={`wm://${asset.id}/`}
          alt={asset.name}
          draggable={false}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        />
      </div>
      <footer>
        <span>{t.imageNavigationHint}</span>
        <div>
          <button
            aria-label={t.zoomOut}
            onClick={() => setTransform((value) => zoomImage(value, 1 / 1.25))}
          >
            <Minus size={18} />
          </button>
          <output aria-label={t.zoomLevel}>
            {Math.round(transform.scale * 100)}%
          </output>
          <button
            aria-label={t.zoomIn}
            onClick={() => setTransform((value) => zoomImage(value, 1.25))}
          >
            <Plus size={18} />
          </button>
          <button onClick={reset}>
            <RotateCcw size={15} />
            {t.resetView}
          </button>
        </div>
      </footer>
    </div>
  );
}
