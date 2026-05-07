import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Eye, Upload, Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Studies() {
  const { data: studies, isLoading, refetch } = trpc.studies.list.useQuery();
  const [, setLocation] = useLocation();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!selectedFiles.length) { toast.error("Select at least one DICOM file"); return; }
    if (!patientName.trim()) { toast.error("Enter a patient name"); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("patientName", patientName.trim());
      selectedFiles.forEach(f => formData.append("files", f));
      const res = await fetch("/api/upload-dicom", { method: "POST", body: formData });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Upload failed"); }
      const data = await res.json();
      await refetch();
      setUploadOpen(false);
      setPatientName("");
      setSelectedFiles([]);
      toast.success("Study uploaded successfully");
      if (data.studyId) setLocation(`/studies/${data.studyId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'in_progress':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'reported':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
      default:
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'stat':
        return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
      case 'urgent':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Studies</h1>
            <p className="text-muted-foreground mt-1">View and manage DICOM studies</p>
          </div>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Study
          </Button>
        </div>

        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload DICOM Study</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="patientName">Patient Name</Label>
                <Input
                  id="patientName"
                  placeholder="e.g. John Doe"
                  value={patientName}
                  onChange={e => setPatientName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>DICOM Files (.dcm)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".dcm"
                  multiple
                  className="hidden"
                  onChange={e => setSelectedFiles(Array.from(e.target.files ?? []))}
                />
                <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  {selectedFiles.length > 0 ? `${selectedFiles.length} file(s) selected` : "Choose files"}
                </Button>
                {selectedFiles.length > 0 && (
                  <ul className="text-sm text-muted-foreground space-y-0.5 mt-1">
                    {selectedFiles.map(f => <li key={f.name} className="truncate">{f.name}</li>)}
                  </ul>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Upload
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle>All Studies</CardTitle>
            <CardDescription>
              Browse all DICOM studies in the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading studies...
              </div>
            ) : !studies || studies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No studies found</p>
                <p className="text-sm mt-1">Upload your first DICOM study to get started</p>
              </div>
            ) : (
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Study Date</TableHead>
                      <TableHead>Modality</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Body Part</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studies.map((item) => (
                      <TableRow key={item.study.id}>
                        <TableCell className="font-medium">
                          {item.patient?.name || "Unknown"}
                        </TableCell>
                        <TableCell>
                          {new Date(item.study.studyDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">
                            {item.study.modality}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {item.study.description || "N/A"}
                        </TableCell>
                        <TableCell>{item.study.bodyPart || "N/A"}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(item.study.priority)}`}>
                            {item.study.priority}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(item.study.status)}`}>
                            {item.study.status.replace('_', ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/viewer/${item.study.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
