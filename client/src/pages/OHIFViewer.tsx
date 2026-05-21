import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { sendToOhif, type OhifInboundMessage } from "@/lib/ohifBridge";
import OHIFToolbar from "@/components/OHIFToolbar";
import { useTheme } from "@/contexts/ThemeContext";

export default function OHIFViewer() {
  const [, params] = useRoute("/viewer/:id");
  const [, setLocation] = useLocation();
  const studyDbId = params?.id ? parseInt(params.id) : null;
  const { theme } = useTheme();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Maps measurement uid → bullet text so we can remove it if the user clicks "No" to tracking
  const measurementBulletsRef = useRef<Map<string, string>>(new Map());
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [showNewReportForm, setShowNewReportForm] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const { data: studyData } = trpc.studies.getById.useQuery(
    { id: studyDbId! },
    { enabled: !!studyDbId }
  );
  const study = studyData?.study;
  const patient = studyData?.patient;

  const { data: existingReports, refetch: refetchReports } = trpc.reports.getByStudyId.useQuery(
    { studyId: studyDbId! },
    { enabled: !!studyDbId }
  );

  const createReport = trpc.reports.create.useMutation({
    onSuccess: () => { toast.success("Report saved"); refetchReports(); },
    onError: (e) => toast.error(e.message),
  });
  const updateReport = trpc.reports.update.useMutation({
    onSuccess: () => { toast.success("Report updated"); refetchReports(); },
    onError: (e) => toast.error(e.message),
  });

  // Auto-open the panel and pre-populate when reports load
  useEffect(() => {
    if (!existingReports || existingReports.length === 0) return;
    // Open the panel automatically so the report is visible from the start
    setReportOpen(true);
    const draft = existingReports.find(r => r.status === "draft");
    if (draft && findings === "") {
      setFindings(draft.findings);
      setImpression(draft.impression);
      setRecommendations(draft.recommendations ?? "");
      setEditingReportId(draft.id);
      setShowNewReportForm(true);
    }
  }, [existingReports]);

  // Sync theme with OHIF whenever it changes (after iframe loads)
  useEffect(() => {
    if (!iframeLoaded) return;
    sendToOhif(iframeRef.current, { type: 'OHIF_SET_THEME', theme: theme === 'dark' ? 'dark' : 'light' });
  }, [theme, iframeLoaded]);

  // Send theme immediately when iframe finishes loading
  const handleIframeLoad = useCallback(() => {
    setIframeLoaded(true);
    sendToOhif(iframeRef.current, { type: 'OHIF_SET_THEME', theme: theme === 'dark' ? 'dark' : 'light' });
  }, [theme]);

  // postMessage bridge: OHIF → parent
  const handleOhifMessage = useCallback((event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const msg = event.data as OhifInboundMessage;
    if (!msg?.type) return;

    switch (msg.type) {
      case 'OHIF_MEASUREMENT_ADDED':
        if (msg.findingText && msg.uid) {
          const bullet = `• ${msg.findingText}`;
          measurementBulletsRef.current.set(msg.uid, bullet);
          setFindings(prev => {
            const base = prev.trim();
            return base ? `${base}\n${bullet}` : bullet;
          });
          toast.info(`Measurement captured — open the report panel to review`, { duration: 2000 });
        }
        break;
      case 'OHIF_MEASUREMENT_UPDATED':
        break;
      case 'OHIF_MEASUREMENT_REMOVED':
        if (msg.uid) {
          const bullet = measurementBulletsRef.current.get(msg.uid);
          measurementBulletsRef.current.delete(msg.uid);
          if (bullet) {
            setFindings(prev =>
              prev.split('\n').filter(line => line !== bullet).join('\n').trim()
            );
          }
        }
        break;
      case 'OHIF_TOOL_CHANGED':
        setActiveTool(msg.toolId);
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleOhifMessage);
    return () => window.removeEventListener('message', handleOhifMessage);
  }, [handleOhifMessage]);

  const handleSave = (status: "draft" | "final") => {
    if (!findings.trim() || !impression.trim()) {
      toast.error("Findings and Impression are required");
      return;
    }
    if (editingReportId) {
      updateReport.mutate({ id: editingReportId, findings, impression, recommendations: recommendations || undefined, status });
    } else if (studyDbId) {
      createReport.mutate({ studyId: studyDbId, findings, impression, recommendations: recommendations || undefined, status });
    }
  };

  const ohifUrl = study?.studyId
    ? `/ohif/viewer?StudyInstanceUIDs=${encodeURIComponent(study.studyId)}`
    : null;

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-600",
    in_progress: "bg-blue-600",
    completed: "bg-green-600",
    reported: "bg-purple-600",
    draft: "bg-yellow-600",
    final: "bg-green-600",
    amended: "bg-blue-600",
  };

  const hasReport = !!existingReports && existingReports.length > 0;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">

      {/* OHIF iframe — fills the entire viewport */}
      {ohifUrl ? (
        <iframe
          ref={iframeRef}
          src={ohifUrl}
          className="absolute inset-0 w-full h-full border-0"
          title="OHIF DICOM Viewer"
          allow="fullscreen"
          onLoad={handleIframeLoad}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <AlertCircle className="w-10 h-10" />
          {study === null ? <p>Study not found.</p> : <p>Loading study…</p>}
        </div>
      )}

      {/* Floating toolbar strip — left edge, full height */}
      <div className="absolute left-0 top-0 h-full z-10 pointer-events-none">
        <OHIFToolbar
          iframeRef={iframeRef}
          activeTool={activeTool}
          reportOpen={reportOpen}
          onToggleReport={() => setReportOpen(o => !o)}
          hasReport={hasReport}
        />
      </div>

      {/* Slim top bar — Back button + study info, starts after toolbar */}
      <div className="absolute top-0 left-12 right-0 z-10 h-10 bg-background/80 backdrop-blur-sm border-b border-border/50 flex items-center px-3 gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation(`/studies/${studyDbId}`)}
          className="h-7 px-2 shrink-0"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        {study && (
          <span className="text-sm text-muted-foreground truncate min-w-0">
            {patient?.name && (
              <span className="font-medium text-foreground mr-2">{patient.name}</span>
            )}
            {study.description}
            <span className="ml-2 text-xs opacity-70">{study.modality}</span>
          </span>
        )}
      </div>

      {/* Radiology report — slide-over from right */}
      <Sheet open={reportOpen} onOpenChange={setReportOpen}>
        <SheetContent side="right" className="w-[420px] flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
            <SheetTitle className="text-sm font-semibold">Radiology Report</SheetTitle>
            {hasReport && (
              <Badge className={`mt-1 w-fit text-xs ${statusColors[existingReports![0].status]}`}>
                {existingReports![0].status}
              </Badge>
            )}
            <p className="text-xs text-muted-foreground">
              Measurements drawn in the viewer are appended to Findings automatically.
            </p>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Finalized / final reports — read-only */}
            {existingReports?.filter(r => r.status !== "draft").map(report => (
              <div key={report.id} className="text-xs space-y-3 border border-border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${statusColors[report.status]}`}>{report.status}</Badge>
                  <span className="text-muted-foreground">
                    {new Date(report.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Findings</p>
                  <p className="text-foreground whitespace-pre-wrap leading-relaxed">{report.findings}</p>
                </div>
                {report.impression && (
                  <div>
                    <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Impression</p>
                    <p className="text-foreground whitespace-pre-wrap leading-relaxed">{report.impression}</p>
                  </div>
                )}
                {report.recommendations && (
                  <div>
                    <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Recommendations</p>
                    <p className="text-foreground whitespace-pre-wrap leading-relaxed">{report.recommendations}</p>
                  </div>
                )}
              </div>
            ))}

            {/* Add / edit report form — shown when there's a draft or the user clicks Add */}
            {(showNewReportForm || editingReportId) ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-foreground">
                  {editingReportId ? "Edit Draft" : "New Report"}
                </p>
                <div className="space-y-1">
                  <Label htmlFor="ov-findings" className="text-xs">Findings *</Label>
                  <Textarea
                    id="ov-findings"
                    rows={5}
                    value={findings}
                    onChange={e => setFindings(e.target.value)}
                    placeholder="Describe imaging findings… (measurements auto-appended)"
                    className="bg-background text-sm resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ov-impression" className="text-xs">Impression *</Label>
                  <Textarea
                    id="ov-impression"
                    rows={3}
                    value={impression}
                    onChange={e => setImpression(e.target.value)}
                    placeholder="Clinical impression…"
                    className="bg-background text-sm resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ov-recs" className="text-xs">Recommendations</Label>
                  <Textarea
                    id="ov-recs"
                    rows={2}
                    value={recommendations}
                    onChange={e => setRecommendations(e.target.value)}
                    placeholder="Optional follow-up…"
                    className="bg-background text-sm resize-none"
                  />
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setShowNewReportForm(true)}
              >
                + Add Report
              </Button>
            )}
          </div>

          {(showNewReportForm || editingReportId) && (
            <SheetFooter className="px-4 py-3 border-t border-border flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => handleSave("draft")}
                disabled={createReport.isPending || updateReport.isPending}
              >
                Save Draft
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => handleSave("final")}
                disabled={createReport.isPending || updateReport.isPending}
              >
                Finalize
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
