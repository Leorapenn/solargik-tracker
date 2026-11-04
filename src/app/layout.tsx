import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";
import { TaskBell } from "@/components/TaskBell";
import { currentRole } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solargik Tracker",
  description: "Project tracker",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // staff see a top bar with the Tasks tab only (the pages and actions refuse them anyway)
  const role = await currentRole();
  return (
    <html lang="en">
      <body>
        <NavBar bell={<TaskBell />} staff={role === "staff"} />
        {children}
      </body>
    </html>
  );
}
