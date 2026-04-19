import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

const users = [
  { name: "Alice Johnson", email: "alice@acme.com", role: "Admin", status: "active", joined: "Jan 12, 2024" },
  { name: "Bob Smith", email: "bob@acme.com", role: "Editor", status: "active", joined: "Feb 3, 2024" },
  { name: "Carol White", email: "carol@acme.com", role: "Viewer", status: "inactive", joined: "Mar 15, 2024" },
  { name: "David Lee", email: "david@acme.com", role: "Editor", status: "active", joined: "Apr 22, 2024" },
  { name: "Eve Martinez", email: "eve@acme.com", role: "Admin", status: "active", joined: "May 8, 2024" },
  { name: "Frank Chen", email: "frank@acme.com", role: "Viewer", status: "pending", joined: "Jun 1, 2024" },
  { name: "Grace Kim", email: "grace@acme.com", role: "Editor", status: "active", joined: "Jul 14, 2024" },
  { name: "Henry Wilson", email: "henry@acme.com", role: "Viewer", status: "inactive", joined: "Aug 30, 2024" },
];

function getStatusVariant(status: string) {
  switch (status) {
    case "active":
      return "default" as const;
    case "inactive":
      return "secondary" as const;
    case "pending":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

function getRoleBadgeVariant(role: string) {
  switch (role) {
    case "Admin":
      return "destructive" as const;
    case "Editor":
      return "default" as const;
    default:
      return "secondary" as const;
  }
}

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">
            Manage team members and their permissions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input placeholder="Search users..." className="w-64" />
          <Button>Invite User</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {users.filter((u) => u.status === "active").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">
              {users.filter((u) => u.status === "pending").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Admins
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === "Admin").length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox />
                </TableHead>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.email}>
                  <TableCell>
                    <Checkbox />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {user.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{user.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {user.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(user.status)}>
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.joined}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
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
