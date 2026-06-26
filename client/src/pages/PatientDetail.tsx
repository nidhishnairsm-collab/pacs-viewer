import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  Mail,
  Phone,
  MapPin,
  User,
  FileText,
  Share2,
  Edit,
  Activity,
  Trash2,
} from "lucide-react";

export default function PatientDetail() {
  const [, params] = useRoute("/patients/:id");
  const [, setLocation] = useLocation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const patientId = params?.id ? parseInt(params.id) : null;

  const { data: patient, isLoading } = trpc.patients.getById.useQuery(
    { id: patientId! },
    { enabled: !!patientId }
  );

  const { data: studies } = trpc.studies.getByPatientId.useQuery(
    { patientId: patientId! },
    { enabled: !!patientId }
  );

  const deletePatient = trpc.patients.delete.useMutation({
    onSuccess: () => {
      toast.success("Patient deleted");
      setLocation("/patients");
    },
    onError: (e) => toast.error(e.message),
  });

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

  if (!patient || !patientId) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Patient Not Found</CardTitle>
            <CardDescription>The requested patient could not be found.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/patients")} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Patients
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
              onClick={() => setLocation("/patients")}
              className="border-border"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Patients
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-border">
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button variant="outline" size="sm" className="border-border">
                <Share2 className="w-4 h-4 mr-2" />
                Share
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

          <div className="flex items-start gap-6">
            <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-3xl font-bold">
              {patient.name?.charAt(0).toUpperCase() || "P"}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground mb-2">{patient.name}</h1>
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>ID: {patient.patientId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {patient.dateOfBirth
                      ? new Date(patient.dateOfBirth).toLocaleDateString()
                      : "DOB not available"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  <span className="capitalize">{patient.gender || "Not specified"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted">
            <TabsTrigger value="overview" className="data-[state=active]:bg-background">
              Overview
            </TabsTrigger>
            <TabsTrigger value="studies" className="data-[state=active]:bg-background">
              Studies ({studies?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-background">
              Medical History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contact Information */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {patient.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Email</div>
                        <div className="text-foreground">{patient.email}</div>
                      </div>
                    </div>
                  )}
                  {patient.contactNumber && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Phone</div>
                        <div className="text-foreground">{patient.contactNumber}</div>
                      </div>
                    </div>
                  )}
                  {patient.address && (
                    <div className="flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Address</div>
                        <div className="text-foreground">{patient.address}</div>
                      </div>
                    </div>
                  )}
                  {!patient.email && !patient.contactNumber && !patient.address && (
                    <div className="text-center py-4 text-muted-foreground">
                      No contact information available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Demographics */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Demographics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-sm text-muted-foreground">Patient ID</div>
                    <div className="text-foreground font-medium">{patient.patientId}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Date of Birth</div>
                    <div className="text-foreground font-medium">
                      {patient.dateOfBirth
                        ? new Date(patient.dateOfBirth).toLocaleDateString()
                        : "Not available"}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Gender</div>
                    <div className="text-foreground font-medium capitalize">
                      {patient.gender || "Not specified"}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Registered</div>
                    <div className="text-foreground font-medium">
                      {new Date(patient.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Studies */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Recent Studies</CardTitle>
                <CardDescription>Latest imaging studies for this patient</CardDescription>
              </CardHeader>
              <CardContent>
                {studies && studies.length > 0 ? (
                  <div className="space-y-3">
                    {studies.slice(0, 5).map((study) => (
                      <div
                        key={study.id}
                        className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => setLocation(`/studies/${study.id}`)}
                      >
                        <div className="flex-1">
                          <div className="font-medium text-foreground">
                            {study.description || "Untitled Study"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {study.modality} • {study.bodyPart || "N/A"} •{" "}
                            {new Date(study.studyDate).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge className={statusColors[study.status]}>
                          {study.status.replace("_", " ").toUpperCase()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No studies found for this patient</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="studies" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">All Studies</CardTitle>
                <CardDescription>Complete imaging history for this patient</CardDescription>
              </CardHeader>
              <CardContent>
                {studies && studies.length > 0 ? (
                  <div className="space-y-3">
                    {studies.map((study) => (
                      <div
                        key={study.id}
                        className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => setLocation(`/studies/${study.id}`)}
                      >
                        <div className="flex-1">
                          <div className="font-medium text-foreground">
                            {study.description || "Untitled Study"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {study.modality} • {study.bodyPart || "N/A"} •{" "}
                            {new Date(study.studyDate).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={statusColors[study.status]}>
                            {study.status.replace("_", " ").toUpperCase()}
                          </Badge>
                          <Button variant="outline" size="sm" className="border-border">
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No studies found for this patient</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Medical History</CardTitle>
              </CardHeader>
              <CardContent>
                {patient.medicalHistory ? (
                  <div className="prose prose-sm max-w-none text-foreground">
                    <p className="whitespace-pre-wrap">{patient.medicalHistory}</p>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No medical history recorded</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Patient</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>{patient?.name}</strong> and all associated studies, series, images, and reports. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deletePatient.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => patientId && deletePatient.mutate({ id: patientId })}
              disabled={deletePatient.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
