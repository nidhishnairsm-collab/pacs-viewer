import { useState, useMemo, Fragment } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Eye, Download, History, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { toast } from "sonner";
import { exportReportPdf } from "@/lib/reportPdf";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const getStatusColor = (status: string) => {
  switch (status) {
    case "final":   return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
    case "amended": return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    default:        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300";
  }
};

export default function Reports() {
  const { data: reports, isLoading, refetch } = trpc.reports.list.useQuery();
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedStudies, setExpandedStudies] = useState<Set<number>>(new Set());
  const [deletingReportId, setDeletingReportId] = useState<number | null>(null);

  const deleteReport = trpc.reports.delete.useMutation({
    onSuccess: () => {
      toast.success("Report deleted");
      setDeletingReportId(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // Group by study, latest report first per study (already DESC by createdAt from server)
  const groupedByStudy = useMemo(() => {
    const map = new Map<number, NonNullable<typeof reports>>();
    for (const item of reports ?? []) {
      const key = item.study?.id ?? item.report.studyId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.values());
  }, [reports]);

  // For status filter: match against the current (latest) report's status
  const filtered = groupedByStudy.filter(group => {
    const current = group[0];
    return statusFilter === "all" || current.report.status === statusFilter;
  });

  const toggleHistory = (studyId: number) => {
    setExpandedStudies(prev => {
      const next = new Set(prev);
      if (next.has(studyId)) next.delete(studyId);
      else next.add(studyId);
      return next;
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">Radiology reports across all studies</p>
        </div>

        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="final">Final</SelectItem>
              <SelectItem value="amended">Amended</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Reports</CardTitle>
            <CardDescription>
              {filtered.length} {filtered.length === 1 ? "report" : "reports"} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading reports...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No reports found</p>
                <p className="text-sm mt-1">Reports created from the Study Detail page will appear here</p>
              </div>
            ) : (
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Study</TableHead>
                      <TableHead>Modality</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Versions</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(group => {
                      const current = group[0];
                      const studyId = current.study?.id ?? current.report.studyId;
                      const isExpanded = expandedStudies.has(studyId);
                      const hasHistory = group.length > 1;

                      return (
                        <Fragment key={`study-${studyId}`}>
                          <TableRow key={`current-${current.report.id}`}>
                            <TableCell className="font-medium">
                              {current.patient?.name ?? "Unknown"}
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {current.study?.description ?? current.study?.studyId ?? "—"}
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-sm">{current.study?.modality ?? "—"}</span>
                            </TableCell>
                            <TableCell>
                              <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(current.report.status)}`}>
                                {current.report.status}
                              </span>
                            </TableCell>
                            <TableCell>
                              {new Date(current.report.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              {hasHistory ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1 text-xs h-7"
                                  onClick={() => toggleHistory(studyId)}
                                >
                                  <History className="h-3 w-3" />
                                  {group.length} versions
                                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">1 version</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Link href={`/studies/${current.study?.id}`}>
                                  <Button variant="ghost" size="sm" disabled={!current.study?.id}>
                                    <Eye className="h-4 w-4 mr-1" />
                                    View Study
                                  </Button>
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => exportReportPdf({ patient: current.patient, study: current.study, report: current.report, radiologistName: current.radiologistName ?? null })}
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  PDF
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setDeletingReportId(current.report.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* History rows */}
                          {isExpanded && group.slice(1).map((item, idx) => (
                            <TableRow key={`history-${item.report.id}`} className="bg-muted/30 text-sm">
                              <TableCell colSpan={3} className="pl-8 text-muted-foreground italic">
                                Version {group.length - 1 - idx} (superseded)
                              </TableCell>
                              <TableCell>
                                <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(item.report.status)}`}>
                                  {item.report.status}
                                </span>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {new Date(item.report.createdAt).toLocaleDateString()}
                              </TableCell>
                              <TableCell />
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => exportReportPdf({ patient: item.patient, study: item.study, report: item.report, radiologistName: item.radiologistName ?? null })}
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  PDF
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={deletingReportId !== null} onOpenChange={open => !open && setDeletingReportId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Report</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete this report. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingReportId(null)} disabled={deleteReport.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingReportId !== null && deleteReport.mutate({ id: deletingReportId })}
              disabled={deleteReport.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
