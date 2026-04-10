import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";

const stats = [
  { label: "Total Revenue", value: "$45,231", change: "+20.1%", up: true },
  { label: "Active Users", value: "2,350", change: "+180", up: true },
  { label: "Pending Orders", value: "12", change: "-3", up: false },
  { label: "Conversion Rate", value: "3.2%", change: "+0.4%", up: true },
];

const recentActivity = [
  { user: "Alice Johnson", action: "Created new project", time: "2 min ago", status: "success" },
  { user: "Bob Smith", action: "Updated billing info", time: "15 min ago", status: "default" },
  { user: "Carol White", action: "Submitted support ticket", time: "1 hr ago", status: "destructive" },
  { user: "David Lee", action: "Deployed v2.4.1", time: "3 hrs ago", status: "success" },
  { user: "Eve Martinez", action: "Invited team member", time: "5 hrs ago", status: "default" },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, Jane. Here&apos;s your overview.
          </p>
        </div>
        <Button>Download Report</Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <Badge variant={stat.up ? "default" : "destructive"}>
                {stat.change}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
            <CardDescription>Monthly revenue for the current year</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border bg-muted/50">
              <span className="text-sm text-muted-foreground">
                Chart placeholder — revenue trend
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Performers</CardTitle>
            <CardDescription>This month&apos;s leading contributors</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {["Alice Johnson", "Bob Smith", "Carol White"].map((name, i) => (
              <div key={name} className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {name.split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium">{name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[142, 118, 96][i]} contributions
                  </span>
                </div>
                <Badge variant="secondary">#{i + 1}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest actions across the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentActivity.map((activity) => (
                <TableRow key={`${activity.user}-${activity.time}`}>
                  <TableCell className="flex items-center gap-2 font-medium">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px]">
                        {activity.user.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    {activity.user}
                  </TableCell>
                  <TableCell>{activity.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {activity.time}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={
                        activity.status as "default" | "destructive" | "secondary"
                      }
                    >
                      {activity.status === "success" ? "Completed" : activity.status === "destructive" ? "Urgent" : "Info"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
