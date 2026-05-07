import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Calendar, User, FileText, Download, Share2, Eye, Maximize2 } from "lucide-react";
import { EnhancedDicomViewer } from "@/components/EnhancedDicomViewer";

export default function StudyDetail() {
  const [, params] = useRoute("/studies/:id");
  const [, setLocation] = useLocation();
  const studyId = params?.id ? parseInt(params.id) : null;

  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [editingReportId, setEditingReportId] = useState<number | null>(null);

  const { data: studyData, isLoading } = trpc.studies.getById.useQuery(
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
    onSuccess: () => { toast.success("Report saved"); refetchReports(); },
    onError: (e) => toast.error(e.message),
  });
  const updateReport = trpc.reports.update.useMutation({
    onSuccess: () => { toast.success("Report updated"); refetchReports(); },
    onError: (e) => toast.error(e.message),
  });

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

  const handleSaveReport = (status: "draft" | "final") => {
    if (!findings.trim() || !impression.trim()) {
      toast.error("Findings and Impression are required");
      return;
    }
    if (editingReportId) {
      updateReport.mutate({ id: editingReportId, findings, impression, recommendations: recommendations || undefined, status });
    } else if (studyId) {
      createReport.mutate({ studyId, findings, impression, recommendations: recommendations || undefined, status });
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
                {existingReports?.filter(r => r.status !== "draft").map(report => (
                  <div key={report.id} className="space-y-4 border border-border rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">{report.status}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(report.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-1">Findings</h4>
                      <p className="text-foreground whitespace-pre-wrap">{report.findings}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-1">Impression</h4>
                      <p className="text-foreground whitespace-pre-wrap">{report.impression}</p>
                    </div>
                    {report.recommendations && (
                      <div>
                        <h4 className="text-sm font-semibold text-muted-foreground mb-1">Recommendations</h4>
                        <p className="text-foreground whitespace-pre-wrap">{report.recommendations}</p>
                      </div>
                    )}
                  </div>
                ))}

                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground">
                    {editingReportId ? "Edit Draft Report" : "New Report"}
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
                      Finalize Report
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
