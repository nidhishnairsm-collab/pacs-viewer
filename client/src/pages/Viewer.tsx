import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Upload,
  MousePointer2,
  Move,
  ZoomIn,
  RotateCw,
  Ruler,
  Type,
  ArrowRight,
  ArrowLeft,
  Circle,
  Square,
  FlipHorizontal,
  FlipVertical,
  RefreshCw,
  Play,
  Pause,
  Grid3x3,
  Layers,
  FileImage
} from "lucide-react";
import { toast } from "sonner";
import { initCornerstone, loadDICOMFile, displayDICOMImage, setActiveTool, cornerstoneTools } from "@/lib/cornerstone";

type Tool = 
  | "windowLevel" 
  | "pan" 
  | "zoom" 
  | "rotate" 
  | "length" 
  | "angle"
  | "ellipse"
  | "rectangle"
  | "arrow"
  | "text"
  | "none";

type Layout = "1x1" | "2x2" | "3x3";

interface LoadedImage {
  file: File;
  imageId: string;
}

const SAMPLE_FILES = [
  { name: "CT Scan (Small)", path: "/samples/CT_small.dcm" },
  { name: "MRI Brain (Small)", path: "/samples/MR_small.dcm" },
  { name: "JPEG2000 Sample", path: "/samples/JPEG2000.dcm" },
];

export default function Viewer() {
  const [, setLocation] = useLocation();
  const [selectedTool, setSelectedTool] = useState<Tool>("windowLevel");
  const [layout, setLayout] = useState<Layout>("1x1");
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadedImages, setLoadedImages] = useState<LoadedImage[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewportRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Initialize Cornerstone on mount
  useEffect(() => {
    const init = async () => {
      try {
        await initCornerstone();
        setIsInitialized(true);
        toast.success("PACS Viewer initialized");
      } catch (error) {
        console.error("Failed to initialize:", error);
        toast.error("Failed to initialize viewer");
      }
    };
    init();
  }, []);

  const loadSampleFiles = async () => {
    if (!isInitialized) {
      toast.error("Viewer not initialized yet");
      return;
    }

    try {
      toast.info("Loading sample DICOM files...");
      const loadedImagesArray: LoadedImage[] = [];

      for (const sample of SAMPLE_FILES) {
        try {
          // Fetch the sample file
          const response = await fetch(sample.path);
          if (!response.ok) {
            throw new Error(`Failed to fetch ${sample.name}`);
          }
          
          const blob = await response.blob();
          const file = new File([blob], sample.name, { type: 'application/dicom' });
          
          const imageId = await loadDICOMFile(file);
          loadedImagesArray.push({ file, imageId });
        } catch (error) {
          console.error(`Failed to load ${sample.name}:`, error);
        }
      }

      if (loadedImagesArray.length > 0) {
        setLoadedImages(loadedImagesArray);
        toast.success(`Loaded ${loadedImagesArray.length} sample DICOM file(s)`);
        
        // Display first image in first viewport
        setTimeout(() => {
          if (viewportRefs.current[0] && loadedImagesArray[0]) {
            displayDICOMImage(viewportRefs.current[0], loadedImagesArray[0].imageId)
              .catch(err => {
                console.error("Failed to display image:", err);
                toast.error("Failed to display image");
              });
          }
        }, 100);
      } else {
        toast.error("No sample files could be loaded");
      }
    } catch (error) {
      console.error("Error loading sample files:", error);
      toast.error("Error loading sample files");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!isInitialized) {
      toast.error("Viewer not initialized yet");
      return;
    }

    try {
      const fileArray = Array.from(files);
      const loadedImagesArray: LoadedImage[] = [];

      for (const file of fileArray) {
        try {
          const imageId = await loadDICOMFile(file);
          loadedImagesArray.push({ file, imageId });
        } catch (error) {
          console.error(`Failed to load ${file.name}:`, error);
          toast.error(`Failed to load ${file.name}`);
        }
      }

      if (loadedImagesArray.length > 0) {
        setLoadedImages(loadedImagesArray);
        toast.success(`Loaded ${loadedImagesArray.length} DICOM file(s)`);
        
        // Display first image in first viewport
        setTimeout(() => {
          if (viewportRefs.current[0] && loadedImagesArray[0]) {
            displayDICOMImage(viewportRefs.current[0], loadedImagesArray[0].imageId)
              .catch(err => {
                console.error("Failed to display image:", err);
                toast.error("Failed to display image");
              });
          }
        }, 100);
      }
    } catch (error) {
      console.error("Error loading files:", error);
      toast.error("Error loading files");
    }
  };

  const handleToolSelect = (tool: Tool) => {
    setSelectedTool(tool);
    
    // Map tool names to Cornerstone tool names
    const toolMap: Record<Tool, string> = {
      windowLevel: cornerstoneTools.WindowLevelTool.toolName,
      pan: cornerstoneTools.PanTool.toolName,
      zoom: cornerstoneTools.ZoomTool.toolName,
      rotate: cornerstoneTools.PanTool.toolName, // Placeholder
      length: cornerstoneTools.LengthTool.toolName,
      angle: cornerstoneTools.AngleTool.toolName,
      ellipse: cornerstoneTools.EllipticalROITool.toolName,
      rectangle: cornerstoneTools.RectangleROITool.toolName,
      arrow: cornerstoneTools.ArrowAnnotateTool.toolName,
      text: cornerstoneTools.PanTool.toolName, // Placeholder
      none: cornerstoneTools.PanTool.toolName,
    };

    const cornerstoneTool = toolMap[tool];
    if (cornerstoneTool) {
      setActiveTool(cornerstoneTool);
      toast.info(`${tool} tool activated`);
    }
  };

  const handleReset = () => {
    toast.info("View reset");
    // TODO: Reset viewport to original state
  };

  const handleFlipH = () => {
    toast.info("Flipped horizontally");
    // TODO: Flip image horizontally
  };

  const handleFlipV = () => {
    toast.info("Flipped vertically");
    // TODO: Flip image vertically
  };

  const toggleCine = () => {
    setIsPlaying(!isPlaying);
    toast.info(isPlaying ? "Cine stopped" : "Cine playing");
    // TODO: Implement cine mode
  };

  const getViewportCount = () => {
    switch (layout) {
      case "1x1": return 1;
      case "2x2": return 4;
      case "3x3": return 9;
      default: return 1;
    }
  };

  const getGridClass = () => {
    switch (layout) {
      case "1x1": return "grid-cols-1 grid-rows-1";
      case "2x2": return "grid-cols-2 grid-rows-2";
      case "3x3": return "grid-cols-3 grid-rows-3";
      default: return "grid-cols-1 grid-rows-1";
    }
  };

  const tools = [
    { id: "windowLevel" as Tool, icon: Layers, label: "Window/Level", description: "Adjust brightness and contrast" },
    { id: "pan" as Tool, icon: Move, label: "Pan", description: "Move image" },
    { id: "zoom" as Tool, icon: ZoomIn, label: "Zoom", description: "Magnify image" },
    { id: "rotate" as Tool, icon: RotateCw, label: "Rotate", description: "Rotate image" },
    { id: "length" as Tool, icon: Ruler, label: "Length", description: "Measure distance" },
    { id: "angle" as Tool, icon: MousePointer2, label: "Angle", description: "Measure angle" },
    { id: "ellipse" as Tool, icon: Circle, label: "Ellipse", description: "Draw ellipse ROI" },
    { id: "rectangle" as Tool, icon: Square, label: "Rectangle", description: "Draw rectangle ROI" },
    { id: "arrow" as Tool, icon: ArrowRight, label: "Arrow", description: "Add arrow annotation" },
    { id: "text" as Tool, icon: Type, label: "Text", description: "Add text annotation" },
  ];

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.length > 1 ? window.history.back() : setLocation("/dashboard")}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h1 className="text-lg md:text-xl font-bold text-foreground">Medical PACS Viewer</h1>
          <input
            ref={fileInputRef}
            type="file"
            accept=".dcm,.dicom"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              size="sm"
            >
              <Upload className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Load DICOM</span>
              <span className="sm:hidden">DICOM</span>
            </Button>
            <Button
              onClick={loadSampleFiles}
              variant="outline"
              size="sm"
            >
              <FileImage className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Load Samples</span>
              <span className="sm:hidden">Samples</span>
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Layout:</span>
          <Button
            variant={layout === "1x1" ? "default" : "outline"}
            size="sm"
            onClick={() => setLayout("1x1")}
          >
            1×1
          </Button>
          <Button
            variant={layout === "2x2" ? "default" : "outline"}
            size="sm"
            onClick={() => setLayout("2x2")}
          >
            2×2
          </Button>
          <Button
            variant={layout === "3x3" ? "default" : "outline"}
            size="sm"
            onClick={() => setLayout("3x3")}
          >
            3×3
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Tools Sidebar */}
        <aside className="w-16 border-r border-border bg-card flex flex-col items-center py-4 gap-2">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Button
                key={tool.id}
                variant={selectedTool === tool.id ? "default" : "ghost"}
                size="icon"
                onClick={() => handleToolSelect(tool.id)}
                title={tool.description}
                className="w-12 h-12"
              >
                <Icon className="w-5 h-5" />
              </Button>
            );
          })}
          
          <div className="flex-1" />
          
          {/* Utility Tools */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFlipH}
            title="Flip Horizontal"
            className="w-12 h-12"
          >
            <FlipHorizontal className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFlipV}
            title="Flip Vertical"
            className="w-12 h-12"
          >
            <FlipVertical className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCine}
            title={isPlaying ? "Stop Cine" : "Play Cine"}
            className="w-12 h-12"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleReset}
            title="Reset View"
            className="w-12 h-12"
          >
            <RefreshCw className="w-5 h-5" />
          </Button>
        </aside>

        {/* Main Viewer Area */}
        <main className="flex-1 flex flex-col">
          {/* Viewports Grid */}
          <div className={`flex-1 grid ${getGridClass()} gap-1 p-1 bg-black`}>
            {Array.from({ length: getViewportCount() }).map((_, index) => (
              <div
                key={index}
                className="bg-black border border-gray-800 relative overflow-hidden"
              >
                {/* Viewport Content */}
                <div className="absolute inset-0">
                  {loadedImages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-center text-gray-500">
                      <div>
                        <Grid3x3 className="w-16 h-16 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">Viewport {index + 1}</p>
                        <p className="text-xs mt-1">Load DICOM files to view</p>
                      </div>
                    </div>
                  ) : (
                    <div 
                      ref={(el) => {
                        viewportRefs.current[index] = el;
                      }}
                      className="w-full h-full" 
                      id={`viewport-${index}`}
                    >
                      {/* Cornerstone viewport will be rendered here */}
                    </div>
                  )}
                </div>
                
                {/* Viewport Overlay Info */}
                {loadedImages.length > 0 && (
                  <div className="absolute top-2 left-2 text-white text-xs font-mono bg-black/50 px-2 py-1 rounded pointer-events-none">
                    <div>Patient: Sample Patient</div>
                    <div>Study: DICOM Study</div>
                    <div>Series: 1/1</div>
                    <div>Image: {index + 1}/{loadedImages.length}</div>
                  </div>
                )}
                
                {/* Tool Info */}
                {loadedImages.length > 0 && (
                  <div className="absolute bottom-2 left-2 text-white text-xs font-mono bg-black/50 px-2 py-1 rounded pointer-events-none">
                    <div>W: 400 L: 40</div>
                    <div>Zoom: 100%</div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Status Bar */}
          <div className="border-t border-border px-4 py-2 bg-card">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span>Active Tool: <span className="text-foreground font-medium">{selectedTool}</span></span>
                <span>Files Loaded: <span className="text-foreground font-medium">{loadedImages.length}</span></span>
              </div>
              <div className="flex items-center gap-4">
                <span>{isInitialized ? "Ready" : "Initializing..."}</span>
              </div>
            </div>
          </div>
        </main>

        {/* Series Thumbnail Sidebar */}
        {loadedImages.length > 0 && (
          <aside className="w-48 border-l border-border bg-card p-2 overflow-y-auto">
            <h3 className="text-sm font-semibold mb-2 text-foreground">Series</h3>
            <div className="space-y-2">
              {loadedImages.map((image, index) => (
                <Card
                  key={index}
                  className="p-2 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => {
                    if (viewportRefs.current[0]) {
                      displayDICOMImage(viewportRefs.current[0], image.imageId)
                        .catch(err => console.error("Failed to display image:", err));
                    }
                  }}
                >
                  <div className="aspect-square bg-black rounded mb-1 flex items-center justify-center">
                    <Layers className="w-8 h-8 text-gray-600" />
                  </div>
                  <p className="text-xs text-foreground truncate">{image.file.name}</p>
                  <p className="text-xs text-muted-foreground">Series {index + 1}</p>
                </Card>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
