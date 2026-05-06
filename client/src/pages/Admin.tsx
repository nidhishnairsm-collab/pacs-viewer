import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { toast } from "sonner";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-500/15 text-red-600 border-red-500/30",
  doctor: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  patient: "bg-green-500/15 text-green-600 border-green-500/30",
};

export default function Admin() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: users, isLoading, refetch } = trpc.users.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  if (user?.role !== "admin") {
    navigate("/");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Assign roles to registered users</p>
        </div>

        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Current role</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Change role</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading…</td>
                </tr>
              )}
              {!isLoading && users?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No users found</td>
                </tr>
              )}
              {users?.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{u.name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={ROLE_COLORS[u.role ?? "patient"]}>
                      {u.role ?? "patient"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {u.id === user.id ? (
                      <span className="text-xs text-muted-foreground">You</span>
                    ) : (
                      <Select
                        value={u.role ?? "patient"}
                        onValueChange={(role) =>
                          updateRole.mutate({ id: u.id, role: role as "admin" | "doctor" | "patient" })
                        }
                        disabled={updateRole.isPending}
                      >
                        <SelectTrigger className="h-8 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="doctor">Doctor</SelectItem>
                          <SelectItem value="patient">Patient</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
