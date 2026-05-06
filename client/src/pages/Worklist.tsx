import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Eye } from "lucide-react";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
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
    case "completed":   return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
    case "in_progress": return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    case "reported":    return "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300";
    default:            return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300";
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "stat":   return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
    case "urgent": return "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300";
    default:       return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
};

const getAccessColor = (level: string) => {
  switch (level) {
    case "report": return "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300";
    case "edit":   return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    default:       return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
};

export default function Worklist() {
  const { user } = useAuth();
  const isDoctor = user?.role === "doctor";
  const isAdmin = user?.role === "admin";

  const { data: sharedStudies, isLoading: sharedLoading } =
    trpc.studySharing.myAccessibleStudies.useQuery(undefined, { enabled: isDoctor });

  const { data: allStudies, isLoading: allLoading } =
    trpc.studies.list.useQuery(undefined, { enabled: isAdmin });

  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  if (user?.role === "patient") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Worklist is available for doctors only.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isLoading = isDoctor ? sharedLoading : allLoading;

  type Row = { id: number; patient: string; modality: string; studyDate: Date; priority: string; status: string; accessLevel?: string };

  const rows: Row[] = isDoctor
    ? (sharedStudies ?? []).map(item => ({
        id: item.study?.id ?? 0,
        patient: item.patient?.name ?? "Unknown",
        modality: item.study?.modality ?? "",
        studyDate: item.study?.studyDate ? new Date(item.study.studyDate) : new Date(),
        priority: item.study?.priority ?? "routine",
        status: item.study?.status ?? "pending",
        accessLevel: item.access?.accessLevel ?? "view",
      }))
    : (allStudies ?? [])
        .filter(item => item.study.status === "pending" || item.study.status === "in_progress")
        .map(item => ({
          id: item.study.id,
          patient: item.patient?.name ?? "Unknown",
          modality: item.study.modality,
          studyDate: new Date(item.study.studyDate),
          priority: item.study.priority,
          status: item.study.status,
        }));

  const filtered = rows.filter(r =>
    (statusFilter === "all" || r.status === statusFilter) &&
    (priorityFilter === "all" || r.priority === priorityFilter)
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Worklist</h1>
          <p className="text-muted-foreground mt-1">
            {isDoctor ? "Studies shared with you for review" : "Pending and in-progress studies"}
          </p>
        </div>

        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="reported">Reported</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="stat">Stat</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="routine">Routine</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Study Queue</CardTitle>
            <CardDescription>
              {filtered.length} {filtered.length === 1 ? "study" : "studies"} in your worklist
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading worklist...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No studies in your worklist</p>
                {isDoctor && <p className="text-sm mt-1">Studies shared with you will appear here</p>}
              </div>
            ) : (
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Study Date</TableHead>
                      <TableHead>Modality</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      {isDoctor && <TableHead>Access</TableHead>}
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(row => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.patient}</TableCell>
                        <TableCell>{row.studyDate.toLocaleDateString()}</TableCell>
                        <TableCell><span className="font-mono text-sm">{row.modality}</span></TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(row.priority)}`}>
                            {row.priority}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(row.status)}`}>
                            {row.status.replace("_", " ")}
                          </span>
                        </TableCell>
                        {isDoctor && (
                          <TableCell>
                            <span className={`text-xs px-2 py-1 rounded-full ${getAccessColor(row.accessLevel ?? "view")}`}>
                              {row.accessLevel}
                            </span>
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <Link href={`/studies/${row.id}`}>
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
