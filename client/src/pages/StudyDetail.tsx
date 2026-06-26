import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Calendar, User, FileText, Download, Share2, Eye, Maximize2, Loader2, History, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { exportReportPdf } from "@/lib/reportPdf";
import { EnhancedDicomViewer } from "@/components/EnhancedDicomViewer";
import dicomParser from "dicom-parser";

const DICOM_TAG_NAMES: Record<string, string> = {
  // Patient
  x00100010: "Patient Name", x00100020: "Patient ID", x00100030: "Patient Birth Date",
  x00100040: "Patient Sex", x00101000: "Other Patient IDs", x00101040: "Patient Telephone",
  x00102160: "Ethnic Group", x00104000: "Patient Comments",
  // Study
  x00080020: "Study Date", x00080030: "Study Time", x00080050: "Accession Number",
  x00080060: "Modality", x00080070: "Manufacturer", x00080080: "Institution Name",
  x00080090: "Referring Physician", x00081030: "Study Description",
  x00081040: "Institutional Department", x00081050: "Performing Physician",
  x00081090: "Manufacturer Model", x00200010: "Study ID", x0020000d: "Study Instance UID",
  // Series
  x00080021: "Series Date", x00080031: "Series Time", x0008103e: "Series Description",
  x00181030: "Protocol Name", x00180015: "Body Part Examined",
  x00200011: "Series Number", x0020000e: "Series Instance UID",
  // Instance
  x00080016: "SOP Class UID", x00080018: "SOP Instance UID", x00200013: "Instance Number",
  // Image
  x00280010: "Rows", x00280011: "Columns", x00280030: "Pixel Spacing",
  x00280100: "Bits Allocated", x00280101: "Bits Stored", x00280103: "Pixel Representation",
  x00281050: "Window Center", x00281051: "Window Width",
  // Acquisition
  x00180050: "Slice Thickness", x00180080: "Repetition Time", x00180081: "Echo Time",
  x00180087: "Magnetic Field Strength", x00180088: "Spacing Between Slices",
  x00181020: "Software Version", x00185100: "Patient Position",
  x00200032: "Image Position (Patient)", x00200037: "Image Orientation (Patient)",
  x00201041: "Slice Location",
};

const TAG_GROUPS: Record<string, string[]> = {
  "Patient": ["x00100010","x00100020","x00100030","x00100040","x00101000","x00101040","x00102160","x00104000"],
  "Study": ["x00080020","x00080030","x00080050","x00080060","x00080070","x00080080","x00080090","x00081030","x00081040","x00081050","x00081090","x00200010","x0020000d"],
  "Series": ["x00080021","x00080031","x0008103e","x00181030","x00180015","x00200011","x0020000e"],
  "Instance / Image": ["x00080016","x00080018","x00200013","x00280010","x00280011","x00280030","x00280100","x00280101","x00280103","x00281050","x00281051"],
  "Acquisition": ["x00180050","x00180080","x00180081","x00180087","x00180088","x00181020","x00185100","x00200032","x00200037","x00201041"],
};

function DicomTagsPanel({ fileUrl }: { fileUrl: string }) {
  const [tags, setTags] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(fileUrl)
      .then(r => r.arrayBuffer())
      .then(buf => {
        if (cancelled) return;
        const dataset = dicomParser.parseDicom(new Uint8Array(buf));
        const extracted: Record<string, string> = {};
        for (const tag of Object.keys(DICOM_TAG_NAMES)) {
          try {
            const val = dataset.string(tag as any);
            if (val !== undefined && val.trim() !== "") extracted[tag] = val.trim();
          } catch {}
        }
        setTags(extracted);
      })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fileUrl]);

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" />Loading DICOM metadata...</div>;
  if (error) return <div className="text-destructive py-4">Failed to load DICOM file: {error}</div>;
  if (!tags) return null;

  return (
    <div className="space-y-6">
      {Object.entries(TAG_GROUPS).map(([groupName, groupTags]) => {
        const rows = groupTags.filter(t => tags[t]);
        if (rows.length === 0) return null;
        return (
          <div key={groupName}>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">{groupName}</h3>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((tag, i) => (
                    <tr key={tag} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                      <td className="px-3 py-2 text-muted-foreground w-48 font-medium">{DICOM_TAG_NAMES[tag]}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground w-28">({tag.slice(1,5).toUpperCase()},{tag.slice(5).toUpperCase()})</td>
                      <td className="px-3 py-2 text-foreground break-all">{tags[tag]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StudyDetail() {
  const [, params] = useRoute("/studies/:id");
  const [, setLocation] = useLocation();
  const studyId = params?.id ? parseInt(params.id) : null;

  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [isAmending, setIsAmending] = useState(false);
  const [showReportHistory, setShowReportHistory] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: studyData, isLoading, refetch: refetchStudy } = trpc.studies.getById.useQuery(
    { id: studyId! },
    { enabled: !!studyId }
  );

  const study = studyData?.study;
  const patient = studyData?.patient;

  const { data: instanceData } = trpc.instances.getByStudyId.useQuery(
    { studyId: studyId! },
    { enabled: !!studyId }
  );

  const { data: existingReports, refetch: refetchReports } = trpc.reports.getByStudyId.useQuery(
    { studyId: studyId! },
    { enabled: !!studyId }
  );

  const createReport = trpc.reports.create.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const updateReport = trpc.reports.update.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const updateStudyStatus = trpc.studies.updateStatus.useMutation({
    onSuccess: () => refetchStudy(),
  });

  const deleteStudy = trpc.studies.delete.useMutation({
    onSuccess: () => {
      toast.success("Study deleted");
      setLocation("/studies");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!existingReports || findings !== "") return;
    const draft = existingReports.find(r => r.status === "draft");
    if (draft) {
      setFindings(draft.findings);
      setImpression(draft.impression);
      setRecommendations(draft.recommendations ?? "");
      setEditingReportId(draft.id);
      setIsAmending(false);
    } else if (existingReports.length > 0) {
      // Load latest final/amended report for potential amendment (reports ordered desc by createdAt)
      const latest = existingReports[0];
      setFindings(latest.findings);
      setImpression(latest.impression);
      setRecommendations(latest.recommendations ?? "");
      setEditingReportId(latest.id);
      setIsAmending(true);
    }
  }, [existingReports]);

  const handleSaveReport = async (status: "draft" | "final") => {
    if (!findings.trim() || !impression.trim()) {
      toast.error("Findings and Impression are required");
      return;
    }
    try {
      if (isAmending && status === "final") {
        // Mark existing report as superseded, create new amendment
        await updateReport.mutateAsync({ id: editingReportId!, status: "amended" });
        await createReport.mutateAsync({ studyId: studyId!, findings, impression, recommendations: recommendations || undefined, status: "amended" });
        // Reset so useEffect repopulates from the new final report
        setFindings("");
        setImpression("");
        setRecommendations("");
        setEditingReportId(null);
        setIsAmending(false);
        toast.success("Report amended");
      } else if (isAmending && status === "draft") {
        // Create a new draft without touching the existing final report
        const row = await createReport.mutateAsync({ studyId: studyId!, findings, impression, recommendations: recommendations || undefined, status: "draft" });
        setEditingReportId(row?.id ?? null);
        setIsAmending(false);
        toast.success("Draft saved");
      } else if (editingReportId) {
        await updateReport.mutateAsync({ id: editingReportId, findings, impression, recommendations: recommendations || undefined, status });
        if (status === "final") {
          setIsAmending(true);
          toast.success("Report finalized");
        } else {
          toast.success("Draft saved");
        }
      } else if (studyId) {
        const row = await createReport.mutateAsync({ studyId, findings, impression, recommendations: recommendations || undefined, status });
        setEditingReportId(row?.id ?? null);
        if (status === "final") {
          setIsAmending(true);
          toast.success("Report finalized");
        } else {
          toast.success("Draft saved");
        }
      }
      refetchReports();
      if (status === "final" && studyId) {
        updateStudyStatus.mutate({ id: studyId, status: "reported" });
      }
    } catch {
      // errors handled by mutation onError
    }
  };

  const imageIds: string[] = instanceData && instanceData.length > 0
    ? instanceData.map(row => `wadouri:${row.instance.fileUrl}`)
    : ["wadouri:/samples/CT_small.dcm"];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-800 rounded w-1/4"></div>
            <div className="h-64 bg-gray-800 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!studyData || !study || !studyId) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Study Not Found</CardTitle>
            <CardDescription>The requested study could not be found.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/studies")} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Studies
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusColors = {
    pending: "bg-yellow-600",
    in_progress: "bg-blue-600",
    completed: "bg-green-600",
    reported: "bg-purple-600",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/studies")}
              className="border-border"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Studies
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-border">
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" size="sm" className="border-border">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{study.description}</h1>
              <Badge className={statusColors[study.status]}>
                {study.status.replace("_", " ").toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <span>{patient?.name || "Unknown Patient"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{new Date(study.studyDate).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>{study.modality}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        <Tabs defaultValue="viewer" className="space-y-6">
          <TabsList className="bg-muted">
            <TabsTrigger value="viewer" className="data-[state=active]:bg-background">
              <Eye className="w-4 h-4 mr-2" />
              Viewer
            </TabsTrigger>
            <TabsTrigger value="info" className="data-[state=active]:bg-background">
              <FileText className="w-4 h-4 mr-2" />
              Study Info
            </TabsTrigger>
            <TabsTrigger value="dicom-tags" className="data-[state=active]:bg-background">
              <FileText className="w-4 h-4 mr-2" />
              DICOM Tags
            </TabsTrigger>
            <TabsTrigger value="report" className="data-[state=active]:bg-background">
              <FileText className="w-4 h-4 mr-2" />
              Report
            </TabsTrigger>
          </TabsList>

          <TabsContent value="viewer" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-foreground">DICOM Viewer</CardTitle>
                    <CardDescription>
                      View and analyze medical images with advanced tools
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => setLocation(`/viewer/${studyId}`)}
                    className="gap-2"
                  >
                    <Maximize2 className="w-4 h-4" />
                    Open Advanced Viewer
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <EnhancedDicomViewer imageIds={imageIds} inline />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="info" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Study Information */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Study Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-sm text-muted-foreground">Study ID</div>
                    <div className="text-foreground font-medium">{study.studyId}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Modality</div>
                    <div className="text-foreground font-medium">{study.modality}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Body Part</div>
                    <div className="text-foreground font-medium">{study.bodyPart || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Study Date</div>
                    <div className="text-foreground font-medium">
                      {new Date(study.studyDate).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Referring Physician</div>
                    <div className="text-foreground font-medium">{study.referringPhysician || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Status</div>
                    <Badge className={statusColors[study.status]}>
                      {study.status.replace("_", " ").toUpperCase()}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Patient Information */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Patient Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-sm text-muted-foreground">Patient ID</div>
                    <div className="text-foreground font-medium">{patient?.patientId || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Name</div>
                    <div className="text-foreground font-medium">{patient?.name || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Date of Birth</div>
                    <div className="text-foreground font-medium">
                      {patient?.dateOfBirth
                        ? new Date(patient.dateOfBirth).toLocaleDateString()
                        : "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Gender</div>
                    <div className="text-foreground font-medium capitalize">
                      {patient?.gender || "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Contact</div>
                    <div className="text-foreground font-medium">
                      {patient?.contactNumber || "N/A"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="dicom-tags" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">DICOM File Header</CardTitle>
                <CardDescription>All metadata tags extracted from the DICOM file</CardDescription>
              </CardHeader>
              <CardContent>
                {instanceData && instanceData.length > 0
                  ? <DicomTagsPanel fileUrl={instanceData[0].instance.fileUrl} />
                  : <p className="text-muted-foreground text-sm">No DICOM instances found for this study.</p>
                }
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="report" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-foreground">Radiology Report</CardTitle>
                  {existingReports && existingReports.length > 0 && (
                    <Badge variant="outline" className="capitalize">
                      {existingReports[0].status}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {(() => {
                  const nonDrafts = existingReports?.filter(r => r.status !== "draft") ?? [];
                  if (nonDrafts.length === 0) return null;
                  const current = nonDrafts[0];
                  const history = nonDrafts.slice(1);
                  return (
                    <>
                      {/* Current version */}
                      <div className="space-y-4 border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize">{current.status}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(current.createdAt).toLocaleString()}
                            </span>
                            {history.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                · Version {history.length + 1}
                              </span>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => exportReportPdf({ patient: patient ?? null, study: study ?? null, report: current, radiologistName: current.radiologistName ?? null })}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Export PDF
                          </Button>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-muted-foreground mb-1">Findings</h4>
                          <p className="text-foreground whitespace-pre-wrap">{current.findings}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-muted-foreground mb-1">Impression</h4>
                          <p className="text-foreground whitespace-pre-wrap">{current.impression}</p>
                        </div>
                        {current.recommendations && (
                          <div>
                            <h4 className="text-sm font-semibold text-muted-foreground mb-1">Recommendations</h4>
                            <p className="text-foreground whitespace-pre-wrap">{current.recommendations}</p>
                          </div>
                        )}
                      </div>

                      {/* Previous versions toggle */}
                      {history.length > 0 && (
                        <div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-muted-foreground"
                            onClick={() => setShowReportHistory(h => !h)}
                          >
                            <History className="h-4 w-4" />
                            {history.length} previous version{history.length > 1 ? "s" : ""}
                            {showReportHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                          {showReportHistory && (
                            <div className="space-y-3 mt-3 pl-4 border-l-2 border-border">
                              {history.map((report, idx) => (
                                <div key={report.id} className="space-y-3 border border-border rounded-lg p-4 bg-muted/20">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="capitalize text-muted-foreground">{report.status}</Badge>
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(report.createdAt).toLocaleString()}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        · Version {history.length - idx}
                                      </span>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => exportReportPdf({ patient: patient ?? null, study: study ?? null, report, radiologistName: report.radiologistName ?? null })}
                                    >
                                      <Download className="h-4 w-4 mr-1" />
                                      PDF
                                    </Button>
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-semibold text-muted-foreground mb-1">Findings</h4>
                                    <p className="text-sm text-foreground/70 whitespace-pre-wrap">{report.findings}</p>
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-semibold text-muted-foreground mb-1">Impression</h4>
                                    <p className="text-sm text-foreground/70 whitespace-pre-wrap">{report.impression}</p>
                                  </div>
                                  {report.recommendations && (
                                    <div>
                                      <h4 className="text-sm font-semibold text-muted-foreground mb-1">Recommendations</h4>
                                      <p className="text-sm text-foreground/70 whitespace-pre-wrap">{report.recommendations}</p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}

                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground">
                    {isAmending ? "Amend Report" : editingReportId ? "Edit Draft Report" : "New Report"}
                  </h3>
                  <div className="space-y-1">
                    <Label htmlFor="findings">Findings *</Label>
                    <Textarea
                      id="findings"
                      rows={4}
                      value={findings}
                      onChange={e => setFindings(e.target.value)}
                      placeholder="Describe imaging findings..."
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="impression">Impression *</Label>
                    <Textarea
                      id="impression"
                      rows={3}
                      value={impression}
                      onChange={e => setImpression(e.target.value)}
                      placeholder="Clinical impression..."
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="recommendations">Recommendations</Label>
                    <Textarea
                      id="recommendations"
                      rows={2}
                      value={recommendations}
                      onChange={e => setRecommendations(e.target.value)}
                      placeholder="Optional follow-up recommendations..."
                      className="bg-background"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleSaveReport("draft")}
                      disabled={createReport.isPending || updateReport.isPending}
                    >
                      Save Draft
                    </Button>
                    <Button
                      onClick={() => handleSaveReport("final")}
                      disabled={createReport.isPending || updateReport.isPending}
                    >
                      {isAmending ? "Submit Amendment" : "Finalize Report"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Study</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>{study?.description || "this study"}</strong> and all associated series, images, and reports. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleteStudy.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => studyId && deleteStudy.mutate({ id: studyId })}
              disabled={deleteStudy.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
