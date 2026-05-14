import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Eye, Download } from "lucide-react";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
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
  const { data: reports, isLoading } = trpc.reports.list.useQuery();
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = (reports ?? []).filter(
    item => statusFilter === "all" || item.report.status === statusFilter
  );

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
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(item => (
                      <TableRow key={item.report.id}>
                        <TableCell className="font-medium">
                          {item.patient?.name ?? "Unknown"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {item.study?.description ?? item.study?.studyId ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{item.study?.modality ?? "—"}</span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(item.report.status)}`}>
                            {item.report.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {new Date(item.report.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/studies/${item.study?.id}`}>
                            <Button variant="ghost" size="sm" disabled={!item.study?.id}>
                              <Eye className="h-4 w-4 mr-1" />
                              View Study
                            </Button>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => exportReportPdf({ patient: item.patient, study: item.study, report: item.report })}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            PDF
                          </Button>
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
