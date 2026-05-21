import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { initCornerstone, displayDICOMImage, cornerstone } from "@/lib/cornerstone";
import { toast } from "sonner";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Grid2X2,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface EnhancedDicomViewerProps {
  imageIds: string[];
  onClose?: () => void;
  /** When true, renders inline (no fixed overlay). Default: false (full-screen overlay) */
  inline?: boolean;
}

export function EnhancedDicomViewer({ imageIds, onClose, inline = false }: EnhancedDicomViewerProps) {
  const viewportRef1 = useRef<HTMLDivElement>(null);
  const viewportRef2 = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [splitScreen, setSplitScreen] = useState(false);
  const [totalFrames, setTotalFrames] = useState(Math.max(imageIds.length, 1));
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize Cornerstone once
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        await initCornerstone();
        if (!cancelled) {
          setIsInitialized(true);
          setTotalFrames(Math.max(imageIds.length, 1));
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to initialize DICOM viewer";
          setError(msg);
          setIsLoading(false);
          console.error("[EnhancedDicomViewer] Init error:", err);
        }
      }
    };
    init();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Destroy the rendering engine on unmount so stale WebGL contexts don't prevent re-render.
  // Refs are null by the time useEffect cleanup fires, so we reference the engine by its ID.
  useEffect(() => {
    return () => {
      try {
        cornerstone.getRenderingEngine('pacsRenderingEngine')?.destroy();
      } catch {}
    };
  }, []);

  // Load image whenever frame changes or initialization completes
  const loadCurrentImage = useCallback(async () => {
    if (!isInitialized || imageIds.length === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const imageId = imageIds[currentFrame];
      if (viewportRef1.current) {
        await displayDICOMImage(viewportRef1.current, imageId, "group-1");
      }
      if (splitScreen && viewportRef2.current) {
        const secondId = imageIds[Math.min(currentFrame + 1, imageIds.length - 1)];
        await displayDICOMImage(viewportRef2.current, secondId, "group-2");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load DICOM image";
      // Suppress the "Event type was not defined" noise — it's a non-fatal WADO loader event
      if (!msg.includes("Event type")) {
        setError(msg);
        toast.error("Failed to load DICOM image");
      }
      console.warn("[EnhancedDicomViewer] Load error (non-fatal):", err);
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, imageIds, currentFrame, splitScreen]);

  useEffect(() => {
    loadCurrentImage();
  }, [loadCurrentImage]);

  // Cine playback
  useEffect(() => {
    if (isPlaying) {
      const frameTime = 1000 / (30 * playbackSpeed);
      playbackIntervalRef.current = setInterval(() => {
        setCurrentFrame((prev) => {
          if (prev >= totalFrames - 1) {
            if (loop) return 0;
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, frameTime);
    } else {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    }
    return () => {
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    };
  }, [isPlaying, playbackSpeed, loop, totalFrames]);

  const wrapperClass = inline
    ? "flex flex-col bg-black rounded-lg overflow-hidden"
    : "fixed inset-0 bg-black z-50 flex flex-col";

  const viewportHeight = inline ? "h-96" : "flex-1";

  return (
    <div className={wrapperClass}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <h2 className="text-white text-sm font-semibold">DICOM Viewer</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSplitScreen(!splitScreen)}
            className="text-white border-gray-600 h-7 text-xs"
          >
            <Grid2X2 className="w-3 h-3 mr-1" />
            {splitScreen ? "Single" : "Split"}
          </Button>
          {onClose && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-white border-gray-600 h-7 text-xs"
            >
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Viewport Area */}
      <div className={`flex ${viewportHeight} min-h-0`}>
        {/* Primary Viewport */}
        <div className={`relative ${splitScreen ? "w-1/2 border-r border-gray-700" : "w-full"} bg-black`}>
          <div
            ref={viewportRef1}
            className="w-full h-full"
            style={{ minHeight: inline ? "384px" : undefined }}
          />
          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          )}
          {/* Error overlay */}
          {error && !isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-center px-4">
              <AlertCircle className="w-10 h-10 text-red-400 mb-2" />
              <p className="text-red-300 text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={loadCurrentImage}
                className="mt-3 text-white border-gray-600"
              >
                Retry
              </Button>
            </div>
          )}
        </div>

        {/* Secondary Viewport (Split Screen) */}
        {splitScreen && (
          <div className="relative w-1/2 bg-black">
            <div
              ref={viewportRef2}
              className="w-full h-full"
              style={{ minHeight: inline ? "384px" : undefined }}
            />
          </div>
        )}
      </div>

      {/* Cine Controls — only shown for multi-frame studies */}
      {totalFrames > 1 && (
        <div className="bg-gray-900 border-t border-gray-700 p-3 shrink-0">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentFrame((p) => Math.max(0, p - 1))}
              disabled={currentFrame === 0}
              className="text-white border-gray-600 h-7 w-7 p-0"
            >
              <SkipBack className="w-3 h-3" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPlaying(!isPlaying)}
              className="text-white border-gray-600 h-7 w-7 p-0"
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentFrame((p) => Math.min(totalFrames - 1, p + 1))}
              disabled={currentFrame === totalFrames - 1}
              className="text-white border-gray-600 h-7 w-7 p-0"
            >
              <SkipForward className="w-3 h-3" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setLoop(!loop)}
              className={`text-white border-gray-600 h-7 w-7 p-0 ${loop ? "bg-blue-600" : ""}`}
            >
              <Repeat className="w-3 h-3" />
            </Button>
          </div>

          <Slider
            value={[currentFrame]}
            onValueChange={(v) => { setCurrentFrame(v[0]); setIsPlaying(false); }}
            max={totalFrames - 1}
            step={1}
            className="w-full mb-2"
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Frame {currentFrame + 1} / {totalFrames}</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400 mr-1">Speed:</span>
              {[0.25, 0.5, 1, 2, 4].map((speed) => (
                <Button
                  key={speed}
                  variant="outline"
                  size="sm"
                  onClick={() => setPlaybackSpeed(speed)}
                  className={`text-white border-gray-600 h-6 px-2 text-xs ${playbackSpeed === speed ? "bg-blue-600" : ""}`}
                >
                  {speed}x
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
