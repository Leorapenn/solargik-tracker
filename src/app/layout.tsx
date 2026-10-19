import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";
import { TaskBell } from "@/components/TaskBell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solargik Tracker",
  description: "Project tracker",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <NavBar bell={<TaskBell />} />
        {children}
      </body>
    </html>
  );
}
