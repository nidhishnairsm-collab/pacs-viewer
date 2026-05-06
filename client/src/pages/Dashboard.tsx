import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, FileText, Clock, ScanLine } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { useAuth } from "@/_core/hooks/useAuth";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function useCountUp(target: number, duration = 1000) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(eased * target));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return count;
}

function MedicalScanIllustration() {
  return (
    <svg viewBox="0 0 180 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="90" cy="72" r="60" stroke="white" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.35" />
      <circle cx="90" cy="72" r="44" stroke="white" strokeWidth="1" strokeDasharray="4 2" opacity="0.25" />
      <line x1="30" y1="52" x2="150" y2="52" stroke="white" strokeWidth="1" opacity="0.2" />
      <line x1="26" y1="68" x2="154" y2="68" stroke="white" strokeWidth="1.5" opacity="0.45" />
      <line x1="26" y1="84" x2="154" y2="84" stroke="white" strokeWidth="1.5" opacity="0.45" />
      <line x1="30" y1="100" x2="150" y2="100" stroke="white" strokeWidth="1" opacity="0.2" />
      <rect x="84" y="58" width="12" height="30" rx="3" fill="white" opacity="0.65" />
      <rect x="76" y="66" width="28" height="12" rx="3" fill="white" opacity="0.65" />
      <polyline
        points="10,140 30,140 44,118 58,155 70,128 82,140 98,125 114,148 126,140 155,140 170,140"
        stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.55"
      />
    </svg>
  );
}

function StatCard({ title, value, icon: Icon, description, gradient, delay }: {
  title: string;
  value: number;
  icon: React.ElementType;
  description: string;
  gradient: string;
  delay: number;
}) {
  const animatedValue = useCountUp(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      <div className={`relative overflow-hidden rounded-xl p-5 ${gradient} text-white shadow-lg`}>
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <div className="absolute -right-2 -bottom-8 h-32 w-32 rounded-full bg-white/5" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-white/80">{title}</p>
            <div className="rounded-lg bg-white/20 p-2">
              <Icon className="h-4 w-4 text-white" />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight">{animatedValue}</p>
          <p className="text-xs text-white/70 mt-1">{description}</p>
        </div>
      </div>
    </motion.div>
  );
}

const MODALITY_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: recentStudies } = trpc.studies.list.useQuery();

  const modalityData = recentStudies
    ? Object.entries(
        recentStudies.reduce((acc, item) => {
          const m = item.study.modality || "Unknown";
          acc[m] = (acc[m] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      )
        .map(([modality, count]) => ({ modality, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
    : [];

  const statCards = [
    {
      title: "Total Patients",
      value: stats?.totalPatients || 0,
      icon: Users,
      description: "Registered patients",
      gradient: "bg-gradient-to-br from-blue-500 to-blue-700",
    },
    {
      title: "Total Studies",
      value: stats?.totalStudies || 0,
      icon: FileText,
      description: "DICOM studies",
      gradient: "bg-gradient-to-br from-emerald-500 to-teal-700",
    },
    {
      title: "Pending Studies",
      value: stats?.pendingStudies || 0,
      icon: Clock,
      description: "Awaiting review",
      gradient: "bg-gradient-to-br from-amber-500 to-orange-600",
    },
    {
      title: "Completed Studies",
      value: stats?.completedStudies || 0,
      icon: Activity,
      description: "Reviewed studies",
      gradient: "bg-gradient-to-br from-violet-500 to-purple-700",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome Banner */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-700 p-6 text-white shadow-xl"
        >
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/5" />
          <div className="absolute right-20 -bottom-8 h-40 w-40 rounded-full bg-white/5" />
          <div className="absolute right-0 top-0 h-full w-56 pointer-events-none select-none">
            <MedicalScanIllustration />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-medium text-white/70 mb-1">{getGreeting()},</p>
            <h1 className="text-2xl font-bold tracking-tight">{user?.name || "Welcome"}</h1>
            <p className="text-sm text-white/60 mt-2">
              PACS Imaging Platform — Manage patients, studies, and DICOM scans
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/15 backdrop-blur-sm px-3 py-1.5 text-xs font-medium">
              <ScanLine className="h-3.5 w-3.5" />
              Radiology Information System
            </div>
          </div>
        </motion.div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat, i) => (
            <StatCard
              key={stat.title}
              title={stat.title}
              value={isLoading ? 0 : stat.value}
              icon={stat.icon}
              description={stat.description}
              gradient={stat.gradient}
              delay={0.1 + i * 0.1}
            />
          ))}
        </div>

        {/* Modality Distribution Chart */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5, ease: "easeOut" }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Study Distribution by Modality</CardTitle>
              <CardDescription>Breakdown of imaging modalities across all studies</CardDescription>
            </CardHeader>
            <CardContent>
              {modalityData.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Activity className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No study data available yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={modalityData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="modality"
                      tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--card-foreground)",
                        fontSize: "12px",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                      cursor={{ fill: "var(--accent)", opacity: 0.5 }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {modalityData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={MODALITY_COLORS[index % MODALITY_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Studies */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6, ease: "easeOut" }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Recent Studies</CardTitle>
              <CardDescription>Latest DICOM studies uploaded to the system</CardDescription>
            </CardHeader>
            <CardContent>
              {!recentStudies || recentStudies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No studies yet</p>
                  <p className="text-sm mt-1">Upload your first DICOM study to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentStudies.slice(0, 5).map((item) => (
                    <div
                      key={item.study.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                          <ScanLine className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground text-sm truncate">
                            {item.patient?.name || "Unknown Patient"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {item.study.modality} • {item.study.description || "No description"}{item.study.bodyPart ? ` • ${item.study.bodyPart}` : ""}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {item.study.studyDate.toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          item.study.status === "completed"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                            : item.study.status === "in_progress"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                            : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                        }`}>
                          {item.study.status.replace("_", " ")}
                        </span>
                        <Link href={`/studies/${item.study.id}`}>
                          <Button variant="outline" size="sm" className="h-7 text-xs">
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
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7, ease: "easeOut" }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Link href="/patients/add">
                <Button className="shadow-sm">
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
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
