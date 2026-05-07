import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, FileText, AlertCircle, Layout, Layers, Box } from "lucide-react";

// Commands we can send into the OHIF iframe via postMessage
function sendOhifCommand(iframe: HTMLIFrameElement | null, commandName: string, options: Record<string, unknown> = {}) {
  iframe?.contentWindow?.postMessage(
    { type: 'OHIF_RUN_COMMAND', commandName, options },
    window.location.origin
  );
}

export default function OHIFViewer() {
  const [, params] = useRoute("/viewer/:id");
  const [, setLocation] = useLocation();
  const studyDbId = params?.id ? parseInt(params.id) : null;

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

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

  // ── Pre-populate draft report when data arrives ──────────────────────
  useEffect(() => {
    if (!existingReports) return;
    const draft = existingReports.find(r => r.status === "draft");
    if (draft && findings === "") {
      setFindings(draft.findings);
      setImpression(draft.impression);
      setRecommendations(draft.recommendations ?? "");
      setEditingReportId(draft.id);
    }
  }, [existingReports]);

  // ── postMessage bridge: OHIF → parent ────────────────────────────────
  // Appends a formatted bullet to the findings field whenever a measurement
  // is added inside OHIF (pacs-bridge extension in ohif-config.js posts
  // OHIF_MEASUREMENT_ADDED to window.parent).
  const handleOhifMessage = useCallback((event: MessageEvent) => {
    // Same-origin guard
    if (event.origin !== window.location.origin) return;
    const msg = event.data as { type?: string; findingText?: string };
    if (!msg?.type) return;

    if (msg.type === 'OHIF_MEASUREMENT_ADDED' && msg.findingText) {
      const bullet = `• ${msg.findingText}`;
      setFindings(prev => {
        const base = prev.trim();
        return base ? `${base}\n${bullet}` : bullet;
      });
      toast.info(`Measurement added: ${msg.findingText}`, { duration: 2500 });
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleOhifMessage);
    return () => window.removeEventListener('message', handleOhifMessage);
  }, [handleOhifMessage]);

  // ── Report save ───────────────────────────────────────────────────────
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

  // ── Build OHIF URL from DICOM Study Instance UID ──────────────────────
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

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ── OHIF iframe ─────────────────────────────── */}
      <div className="flex-1 min-w-0 relative flex flex-col">

        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border shrink-0">
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

          {/* Layout shortcut buttons — send OHIF_RUN_COMMAND into iframe */}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              title="MPR layout"
              className="h-7 px-2 text-xs"
              onClick={() => sendOhifCommand(iframeRef.current, 'setLayout', { numRows: 1, numCols: 3 })}
            >
              <Layers className="w-3.5 h-3.5 mr-1" />
              MPR
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="3D layout"
              className="h-7 px-2 text-xs"
              onClick={() => sendOhifCommand(iframeRef.current, 'setLayout', { numRows: 1, numCols: 1 })}
            >
              <Box className="w-3.5 h-3.5 mr-1" />
              3D
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="2×2 grid"
              className="h-7 px-2 text-xs"
              onClick={() => sendOhifCommand(iframeRef.current, 'setLayout', { numRows: 2, numCols: 2 })}
            >
              <Layout className="w-3.5 h-3.5 mr-1" />
              Grid
            </Button>
            <div className="w-px h-4 bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPanelOpen(o => !o)}
              className="h-7 px-2"
            >
              <FileText className="w-4 h-4 mr-1" />
              {panelOpen ? "Hide" : "Report"}
            </Button>
          </div>
        </div>

        {/* OHIF or fallback */}
        <div className="flex-1 min-h-0">
          {ohifUrl ? (
            <iframe
              ref={iframeRef}
              src={ohifUrl}
              className="w-full h-full border-0"
              title="OHIF DICOM Viewer"
              allow="fullscreen"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <AlertCircle className="w-10 h-10" />
              {study === null ? <p>Study not found.</p> : <p>Loading study…</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Report panel ─────────────────────────────── */}
      {panelOpen && (
        <div className="w-[380px] min-w-[320px] border-l border-border flex flex-col bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border shrink-0">
            <h2 className="font-semibold text-foreground text-sm">Radiology Report</h2>
            {existingReports && existingReports.length > 0 && (
              <Badge className={`mt-1 text-xs ${statusColors[existingReports[0].status]}`}>
                {existingReports[0].status}
              </Badge>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Measurements added in the viewer are appended to Findings automatically.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Finalized reports (read-only) */}
            {existingReports?.filter(r => r.status !== "draft").map(report => (
              <div key={report.id} className="text-xs space-y-2 border border-border rounded p-3">
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${statusColors[report.status]}`}>{report.status}</Badge>
                  <span className="text-muted-foreground">
                    {new Date(report.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Findings</p>
                  <p className="text-foreground whitespace-pre-wrap">{report.findings}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Impression</p>
                  <p className="text-foreground whitespace-pre-wrap">{report.impression}</p>
                </div>
                {report.recommendations && (
                  <div>
                    <p className="font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Recommendations</p>
                    <p className="text-foreground whitespace-pre-wrap">{report.recommendations}</p>
                  </div>
                )}
              </div>
            ))}

            {/* Draft / new report form */}
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
          </div>

          <div className="px-4 py-3 border-t border-border flex gap-2 shrink-0">
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
          </div>
        </div>
      )}
    </div>
  );
}
