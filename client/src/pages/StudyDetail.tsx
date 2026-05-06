import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Calendar, User, FileText, Download, Share2, Eye } from "lucide-react";
import { EnhancedDicomViewer } from "@/components/EnhancedDicomViewer";

export default function StudyDetail() {
  const [, params] = useRoute("/studies/:id");
  const [, setLocation] = useLocation();
  const studyId = params?.id ? parseInt(params.id) : null;

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
                <CardTitle className="text-foreground">DICOM Viewer</CardTitle>
                <CardDescription>
                  View and analyze medical images with advanced tools
                </CardDescription>
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
                <CardTitle className="text-foreground">Radiology Report</CardTitle>
                <CardDescription>
                  {study.status === "reported"
                    ? "Report available"
                    : "Report not yet available"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {study.status === "reported" ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-foreground mb-2">Findings</h3>
                      <p className="text-muted-foreground">
                        Report content would be displayed here. In a production system, this
                        would show the actual radiology report with findings, impressions, and
                        recommendations.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No report available yet</p>
                    <p className="text-sm mt-2">
                      The study is currently {study.status.replace("_", " ")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
