import { useEffect, useRef } from "react";
import {
  SunMedium, Move, ZoomIn, Layers, Ruler,
  Circle, Triangle, Pipette, RefreshCw, Contrast,
} from "lucide-react";

export interface RadialTool {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
}

interface Props {
  x: number;
  y: number;
  open: boolean;
  onClose: () => void;
  tools: RadialTool[];
}

const RADIUS = 96;
const ITEM_SIZE = 40;

export const DEFAULT_RADIAL_TOOLS = (
  tool: (id: string) => void,
  resetViewport: () => void,
  invertColors: () => void,
): RadialTool[] => [
  { id: "WindowLevel",   label: "W / L",        icon: <SunMedium className="w-4 h-4" />, action: () => tool("WindowLevel") },
  { id: "Zoom",          label: "Zoom",          icon: <ZoomIn className="w-4 h-4" />,    action: () => tool("Zoom") },
  { id: "Pan",           label: "Pan",           icon: <Move className="w-4 h-4" />,      action: () => tool("Pan") },
  { id: "StackScroll",   label: "Stack Scroll",  icon: <Layers className="w-4 h-4" />,    action: () => tool("StackScroll") },
  { id: "Length",        label: "Length",        icon: <Ruler className="w-4 h-4" />,     action: () => tool("Length") },
  { id: "EllipticalROI",label: "Ellipse ROI",   icon: <Circle className="w-4 h-4" />,    action: () => tool("EllipticalROI") },
  { id: "Angle",         label: "Angle",         icon: <Triangle className="w-4 h-4" />,  action: () => tool("Angle") },
  { id: "Probe",         label: "Probe (HU)",    icon: <Pipette className="w-4 h-4" />,   action: () => tool("Probe") },
  { id: "Reset",         label: "Reset View",    icon: <RefreshCw className="w-4 h-4" />, action: resetViewport },
  { id: "Invert",        label: "Invert",        icon: <Contrast className="w-4 h-4" />,  action: invertColors },
];

export function RadialToolMenu({ x, y, open, onClose, tools }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  // Clamp position so the menu stays within the viewport
  const half = RADIUS + ITEM_SIZE;
  const cx = Math.min(Math.max(x, half), window.innerWidth - half);
  const cy = Math.min(Math.max(y, half), window.innerHeight - half);

  const svgSize = (RADIUS + ITEM_SIZE) * 2;

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* dim backdrop */}
      <div className="absolute inset-0 bg-black/20" />

      {/* SVG spokes */}
      <svg
        className="absolute pointer-events-none"
        style={{
          left: cx - svgSize / 2,
          top: cy - svgSize / 2,
          width: svgSize,
          height: svgSize,
        }}
      >
        {tools.map((_, i) => {
          const angle = (i * 360) / tools.length - 90;
          const rad = (angle * Math.PI) / 180;
          const half = svgSize / 2;
          return (
            <line
              key={i}
              x1={half}
              y1={half}
              x2={half + Math.cos(rad) * RADIUS}
              y2={half + Math.sin(rad) * RADIUS}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={1}
            />
          );
        })}
        {/* center ring */}
        <circle
          cx={svgSize / 2}
          cy={svgSize / 2}
          r={6}
          fill="rgba(255,255,255,0.25)"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={1.5}
        />
      </svg>

      {/* tool buttons */}
      <div
        ref={containerRef}
        className="absolute pointer-events-none"
        style={{ left: cx, top: cy }}
      >
        {tools.map((t, i) => {
          const angle = (i * 360) / tools.length - 90;
          const rad = (angle * Math.PI) / 180;
          const tx = Math.cos(rad) * RADIUS;
          const ty = Math.sin(rad) * RADIUS;

          // Label positioning: push label further out than the button
          const labelDist = RADIUS + ITEM_SIZE / 2 + 10;
          const lx = Math.cos(rad) * labelDist;
          const ly = Math.sin(rad) * labelDist;

          return (
            <div
              key={t.id}
              className="absolute pointer-events-auto animate-in zoom-in-50 fade-in duration-150"
              style={{ left: tx, top: ty, transform: "translate(-50%, -50%)" }}
            >
              <button
                className="flex flex-col items-center gap-1 group outline-none"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  t.action();
                  onClose();
                }}
              >
                <div
                  className="rounded-full bg-background/95 backdrop-blur-sm border border-border shadow-xl flex items-center justify-center transition-all duration-100 group-hover:bg-accent group-hover:border-primary group-hover:scale-110"
                  style={{ width: ITEM_SIZE, height: ITEM_SIZE }}
                >
                  {t.icon}
                </div>
              </button>

              {/* floating label — offset radially, not affected by button transform */}
              <span
                className="absolute text-[9px] font-medium text-white/90 drop-shadow-md text-center leading-tight whitespace-nowrap pointer-events-none select-none"
                style={{
                  left: lx - tx,
                  top: ly - ty,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {t.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
