import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, FileText, Clock } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";

export default function Dashboard() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: recentStudies } = trpc.studies.list.useQuery();

  const statCards = [
    {
      title: "Total Patients",
      value: stats?.totalPatients || 0,
      icon: Users,
      description: "Registered patients",
      color: "text-blue-600",
    },
    {
      title: "Total Studies",
      value: stats?.totalStudies || 0,
      icon: FileText,
      description: "DICOM studies",
      color: "text-green-600",
    },
    {
      title: "Pending Studies",
      value: stats?.pendingStudies || 0,
      icon: Clock,
      description: "Awaiting review",
      color: "text-yellow-600",
    },
    {
      title: "Completed Studies",
      value: stats?.completedStudies || 0,
      icon: Activity,
      description: "Reviewed studies",
      color: "text-purple-600",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome to your PACS system overview
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isLoading ? "..." : stat.value}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recent Studies */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Studies</CardTitle>
            <CardDescription>
              Latest DICOM studies uploaded to the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!recentStudies || recentStudies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No studies yet</p>
                <p className="text-sm mt-1">Upload your first DICOM study to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentStudies.slice(0, 5).map((item) => (
                  <div
                    key={item.study.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-foreground">
                        {item.patient?.name || "Unknown Patient"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {item.study.modality} • {item.study.description || "No description"} • {item.study.bodyPart || ""}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {item.study.studyDate.toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        item.study.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                        item.study.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                      }`}>
                        {item.study.status}
                      </span>
                      <Link href={`/studies/${item.study.id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/patients/add">
              <Button>
                <Users className="h-4 w-4 mr-2" />
                Add Patient
              </Button>
            </Link>
            <Link href="/patients">
              <Button variant="outline">
                <Users className="h-4 w-4 mr-2" />
                View Patients
              </Button>
            </Link>
            <Link href="/studies">
              <Button variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                View Studies
              </Button>
            </Link>
            <Link href="/viewer">
              <Button variant="outline">
                <Activity className="h-4 w-4 mr-2" />
                DICOM Viewer
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
