"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

export interface LightboxImageItem {
  src: string;
  alt: string;
}

export default function ImageLightboxGallery({
  images,
  initialIndex = 0,
  onClose,
}: {
  images: LightboxImageItem[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const safeInitial = Math.max(0, Math.min(images.length - 1, initialIndex));
  const [activeIndex, setActiveIndex] = useState(safeInitial);
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const clamped = Math.max(0, Math.min(images.length - 1, index));
      setActiveIndex(clamped);
      const track = trackRef.current;
      if (!track) return;
      const slideWidth = track.clientWidth || window.innerWidth;
      track.scrollTo({ left: clamped * slideWidth, behavior });
    },
    [images.length]
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const raf = requestAnimationFrame(() => {
      const slideWidth = track.clientWidth || window.innerWidth;
      track.scrollTo({ left: safeInitial * slideWidth, behavior: "auto" });
      setActiveIndex(safeInitial);
    });
    return () => cancelAnimationFrame(raf);
  }, [safeInitial, images]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && images.length > 1) {
        e.preventDefault();
        scrollToIndex(activeIndex - 1);
      } else if (e.key === "ArrowRight" && images.length > 1) {
        e.preventDefault();
        scrollToIndex(activeIndex + 1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, images.length, onClose, scrollToIndex]);

  if (images.length === 0) return null;

  const currentImage = images[activeIndex] ?? images[0];

  const handleTrackScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const nextIdx = Math.round(track.scrollLeft / track.clientWidth);
    if (nextIdx >= 0 && nextIdx < images.length && nextIdx !== activeIndex) {
      setActiveIndex(nextIdx);
    }
  };

  const handleDownloadCurrent = () => {
    const link = document.createElement("a");
    link.href = currentImage.src;
    link.download = currentImage.alt || `image-${activeIndex + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image gallery"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm select-none"
    >
      {/* Top Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-14 shrink-0 items-center justify-between gap-4 px-4 text-white sm:px-6"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {images.length > 1 && (
            <span className="shrink-0 rounded-full bg-white/12 px-2.5 py-0.5 text-[12px] font-medium tabular-nums text-white/90">
              {activeIndex + 1} / {images.length}
            </span>
          )}
          <span className="truncate text-[13px] font-medium text-white/85">
            {currentImage.alt}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadCurrent}
            aria-label="Download image"
            title="Download image"
            className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <Download className="size-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close gallery"
            title="Close"
            className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Scroll-Snap Stage */}
      <div className="relative flex min-h-0 flex-1 items-center">
        {images.length > 1 && activeIndex > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scrollToIndex(activeIndex - 1);
            }}
            aria-label="Previous image"
            className="absolute left-3 top-1/2 z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15 transition-colors hover:bg-black/80 sm:flex"
          >
            <ChevronLeft className="size-5" />
          </button>
        )}

        <div
          ref={trackRef}
          onScroll={handleTrackScroll}
          onWheel={(e) => {
            const track = trackRef.current;
            if (!track || images.length <= 1) return;
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
              e.preventDefault();
              track.scrollBy({ left: e.deltaY * 1.4, behavior: "smooth" });
            }
          }}
          className="no-scrollbar flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
        >
          {images.map((item, idx) => (
            <div
              key={`${item.src.slice(0, 32)}-${idx}`}
              className="flex h-full w-full shrink-0 snap-center items-center justify-center p-4 sm:px-16 sm:py-6"
            >
              <img
                src={item.src}
                alt={item.alt}
                onClick={(e) => e.stopPropagation()}
                draggable={false}
                className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
              />
            </div>
          ))}
        </div>

        {images.length > 1 && activeIndex < images.length - 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scrollToIndex(activeIndex + 1);
            }}
            aria-label="Next image"
            className="absolute right-3 top-1/2 z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15 transition-colors hover:bg-black/80 sm:flex"
          >
            <ChevronRight className="size-5" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip (for multi-image messages) */}
      {images.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="no-scrollbar flex shrink-0 items-center justify-center gap-2 overflow-x-auto px-4 pb-5 pt-2"
        >
          {images.map((item, idx) => {
            const active = idx === activeIndex;
            return (
              <button
                key={`thumb-${idx}`}
                type="button"
                onClick={() => scrollToIndex(idx)}
                aria-label={`View image ${idx + 1}`}
                className={`relative size-12 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                  active
                    ? "scale-105 border-white opacity-100"
                    : "border-transparent opacity-55 hover:opacity-85"
                }`}
              >
                <img
                  src={item.src}
                  alt={item.alt}
                  className="size-full object-cover"
                  draggable={false}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
