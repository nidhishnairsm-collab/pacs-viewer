import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { sendToOhif } from "@/lib/ohifBridge";
import {
  SunMedium, Move, ZoomIn, ScanSearch, Layers,
  Ruler, ArrowLeftRight, Triangle, CornerUpRight, Pipette, Milestone,
  Circle, CircleDot, Square, PenLine, Spline, Waypoints, ArrowUpRight, Crop,
  Crosshair, Globe, AlignCenter, Link2, Eye, Inspect,
  RotateCw, FlipHorizontal2, FlipVertical2, RefreshCw, Contrast,
  Play, Pause, Camera, Tag, FileText, Grid2x2, LayoutTemplate,
} from "lucide-react";
import { useState } from "react";

interface OHIFToolbarProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  activeTool: string | null;
  reportOpen: boolean;
  onToggleReport: () => void;
  hasReport: boolean;
}

interface ToolBtn {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  isTool?: boolean;
}

export default function OHIFToolbar({ iframeRef, activeTool, reportOpen, onToggleReport, hasReport }: OHIFToolbarProps) {
  const [cineActive, setCineActive] = useState(false);
  const send = (msg: Parameters<typeof sendToOhif>[1]) => sendToOhif(iframeRef.current, msg);
  const tool = (id: string) => send({ type: 'OHIF_SET_TOOL', toolName: id });
  const cmd = (commandName: string, options?: Record<string, unknown>) =>
    send({ type: 'OHIF_RUN_COMMAND', commandName, options });

  const toggleCine = () => {
    send({ type: 'OHIF_TOGGLE_CINE' });
    setCineActive(v => !v);
  };

  // ── Group 1: Navigation ───────────────────────────────────────────────
  const navTools: ToolBtn[] = [
    { id: 'WindowLevel',  label: 'Window / Level',  icon: <SunMedium className="w-4 h-4" />,   action: () => tool('WindowLevel'),  isTool: true },
    { id: 'Pan',          label: 'Pan',              icon: <Move className="w-4 h-4" />,         action: () => tool('Pan'),          isTool: true },
    { id: 'Zoom',         label: 'Zoom',             icon: <ZoomIn className="w-4 h-4" />,       action: () => tool('Zoom'),         isTool: true },
    { id: 'StackScroll',  label: 'Stack Scroll',     icon: <Layers className="w-4 h-4" />,       action: () => tool('StackScroll'),  isTool: true },
    { id: 'Magnify',      label: 'Magnify Probe',    icon: <ScanSearch className="w-4 h-4" />,   action: () => tool('Magnify'),      isTool: true },
  ];

  // ── Group 2: Measurements ─────────────────────────────────────────────
  const measureTools: ToolBtn[] = [
    { id: 'Length',       label: 'Length',           icon: <Ruler className="w-4 h-4" />,        action: () => tool('Length'),       isTool: true },
    { id: 'Bidirectional',label: 'Bidirectional',    icon: <ArrowLeftRight className="w-4 h-4" />,action: () => tool('Bidirectional'),isTool: true },
    { id: 'Angle',        label: 'Angle',            icon: <Triangle className="w-4 h-4" />,     action: () => tool('Angle'),        isTool: true },
    { id: 'CobbAngle',    label: 'Cobb Angle',       icon: <CornerUpRight className="w-4 h-4" />,action: () => tool('CobbAngle'),    isTool: true },
    { id: 'Probe',        label: 'Probe',            icon: <Pipette className="w-4 h-4" />,      action: () => tool('Probe'),        isTool: true },
    { id: 'CalibrationLine', label: 'Calibration Line', icon: <Milestone className="w-4 h-4" />, action: () => tool('CalibrationLine'), isTool: true },
  ];

  // ── Group 3: ROI & Annotation ─────────────────────────────────────────
  const roiTools: ToolBtn[] = [
    { id: 'EllipticalROI',    label: 'Ellipse ROI',      icon: <Circle className="w-4 h-4" />,    action: () => tool('EllipticalROI'),    isTool: true },
    { id: 'CircleROI',        label: 'Circle ROI',       icon: <CircleDot className="w-4 h-4" />, action: () => tool('CircleROI'),        isTool: true },
    { id: 'RectangleROI',     label: 'Rectangle ROI',    icon: <Square className="w-4 h-4" />,    action: () => tool('RectangleROI'),     isTool: true },
    { id: 'PlanarFreehandROI',label: 'Freehand ROI',     icon: <PenLine className="w-4 h-4" />,   action: () => tool('PlanarFreehandROI'),isTool: true },
    { id: 'SplineROI',        label: 'Spline ROI',       icon: <Spline className="w-4 h-4" />,    action: () => tool('SplineROI'),        isTool: true },
    { id: 'LivewireContour',  label: 'Livewire Contour', icon: <Waypoints className="w-4 h-4" />, action: () => tool('LivewireContour'),  isTool: true },
    { id: 'ArrowAnnotate',    label: 'Arrow Annotate',   icon: <ArrowUpRight className="w-4 h-4" />, action: () => tool('ArrowAnnotate'), isTool: true },
    { id: 'WindowLevelRegion',label: 'W/L Region',       icon: <Crop className="w-4 h-4" />,      action: () => tool('WindowLevelRegion'),isTool: true },
  ];

  // ── Group 4: Advanced / MPR / 3D ──────────────────────────────────────
  const advancedTools: ToolBtn[] = [
    { id: 'Crosshairs',        label: 'Crosshairs (MPR)',    icon: <Crosshair className="w-4 h-4" />, action: () => cmd('toggleActiveDisabledToolbar', { toolGroupIds: ['mpr'], toolName: 'Crosshairs' }) },
    { id: 'TrackballRotate',   label: '3D Rotate',           icon: <Globe className="w-4 h-4" />,     action: () => tool('TrackballRotate'), isTool: true },
    { id: 'ReferenceLines',    label: 'Reference Lines',     icon: <AlignCenter className="w-4 h-4" />,action: () => cmd('toggleEnabledDisabledToolbar', { toolName: 'ReferenceLines' }) },
    { id: 'ImageSliceSync',    label: 'Image Slice Sync',    icon: <Link2 className="w-4 h-4" />,     action: () => cmd('toggleSynchronizer', { type: 'imageSlice' }) },
    { id: 'ImageOverlayViewer',label: 'Image Overlay',       icon: <Eye className="w-4 h-4" />,       action: () => cmd('toggleEnabledDisabledToolbar', { toolName: 'ImageOverlayViewer' }) },
    { id: 'AdvancedMagnify',   label: 'Magnify Loupe',       icon: <Inspect className="w-4 h-4" />,   action: () => cmd('toggleActiveDisabledToolbar', { toolName: 'AdvancedMagnify' }) },
  ];

  // ── Group 5: Viewport operations ──────────────────────────────────────
  const viewportOps: ToolBtn[] = [
    { id: 'Reset',    label: 'Reset Viewport',   icon: <RefreshCw className="w-4 h-4" />,       action: () => send({ type: 'OHIF_RESET_VIEWPORT' }) },
    { id: 'FlipH',    label: 'Flip Horizontal',  icon: <FlipHorizontal2 className="w-4 h-4" />, action: () => send({ type: 'OHIF_FLIP_H' }) },
    { id: 'FlipV',    label: 'Flip Vertical',    icon: <FlipVertical2 className="w-4 h-4" />,   action: () => send({ type: 'OHIF_FLIP_V' }) },
    { id: 'RotateCW', label: 'Rotate CW',        icon: <RotateCw className="w-4 h-4" />,        action: () => send({ type: 'OHIF_ROTATE_CW' }) },
    { id: 'Invert',   label: 'Invert Colors',    icon: <Contrast className="w-4 h-4" />,        action: () => send({ type: 'OHIF_INVERT' }) },
  ];

  const layouts = [
    { label: '1×1', numRows: 1, numCols: 1, icon: <div className="w-3 h-3 border border-current rounded-sm" /> },
    { label: '2×1', numRows: 2, numCols: 1, icon: <div className="w-3 h-3 flex flex-col gap-0.5"><div className="flex-1 border border-current rounded-sm" /><div className="flex-1 border border-current rounded-sm" /></div> },
    { label: '1×2', numRows: 1, numCols: 2, icon: <div className="w-3 h-3 flex gap-0.5"><div className="flex-1 border border-current rounded-sm" /><div className="flex-1 border border-current rounded-sm" /></div> },
    { label: '2×2', numRows: 2, numCols: 2, icon: <Grid2x2 className="w-3.5 h-3.5" /> },
    { label: '1×3 (MPR)', numRows: 1, numCols: 3, icon: <div className="w-3 h-3 flex gap-0.5"><div className="flex-1 border border-current rounded-sm" /><div className="flex-1 border border-current rounded-sm" /><div className="flex-1 border border-current rounded-sm" /></div> },
  ];

  const renderBtn = (btn: ToolBtn) => {
    const isActive = btn.isTool && activeTool === btn.id;
    return (
      <Tooltip key={btn.id}>
        <TooltipTrigger asChild>
          <Button
            variant={isActive ? "secondary" : "ghost"}
            size="icon"
            className="w-9 h-9"
            onClick={btn.action}
          >
            {btn.icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">{btn.label}</TooltipContent>
      </Tooltip>
    );
  };

  const divider = (key: string) => <div key={key} className="w-6 h-px bg-border my-1" />;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col items-center gap-0.5 bg-background/90 backdrop-blur-sm border-r border-border py-2 px-1 w-12 h-full pointer-events-auto overflow-y-auto">

        {/* Cine playback — top of toolbar for easy access */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={cineActive ? "secondary" : "ghost"}
              size="icon"
              className={`w-9 h-9 ${cineActive ? "text-blue-400" : ""}`}
              onClick={toggleCine}
            >
              {cineActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{cineActive ? "Pause Cine" : "Play Cine"}</TooltipContent>
        </Tooltip>
        {divider('d0')}

        {/* Navigation */}
        {navTools.map(renderBtn)}
        {divider('d1')}

        {/* Measurements */}
        {measureTools.map(renderBtn)}
        {divider('d2')}

        {/* ROI & Annotation */}
        {roiTools.map(renderBtn)}
        {divider('d3')}

        {/* Advanced / MPR / 3D */}
        {advancedTools.map(renderBtn)}
        {divider('d4')}

        {/* Viewport Operations */}
        {viewportOps.map(renderBtn)}
        {divider('d5')}

        {/* Layout switcher */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default">
              <LayoutTemplate className="w-4 h-4 text-muted-foreground" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Layouts</TooltipContent>
        </Tooltip>
        <div className="flex flex-col gap-0.5 mt-0.5 w-full items-center">
          {layouts.map(l => (
            <Tooltip key={l.label}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-9 h-7 p-0"
                  onClick={() => send({ type: 'OHIF_SET_LAYOUT', numRows: l.numRows, numCols: l.numCols })}
                >
                  {l.icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">{l.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        {divider('d6')}

        {/* Actions */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="w-9 h-9" onClick={() => cmd('showDownloadViewportModal')}>
              <Camera className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Capture / Download</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="w-9 h-9" onClick={() => cmd('openDICOMTagViewer')}>
              <Tag className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">DICOM Tag Browser</TooltipContent>
        </Tooltip>

        <div className="flex-1" />
        {divider('d7')}

        {/* Report toggle — pinned to bottom */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={reportOpen ? "secondary" : "ghost"}
              size="icon"
              className="w-9 h-9 relative"
              onClick={onToggleReport}
            >
              <FileText className="w-4 h-4" />
              {hasReport && !reportOpen && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Radiology Report</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
