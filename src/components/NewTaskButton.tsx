"use client";

import { useState } from "react";
import { TaskForm, type CustomerOption, type PersonOption, type ProjectOption } from "@/components/TaskForm";
import { primaryButton } from "@/lib/theme";

// "+ New task": opens the task form in place.
export function NewTaskButton({
  customers,
  projects,
  people,
  presetCustomerId = "",
}: {
  customers: CustomerOption[];
  projects: ProjectOption[];
  people: PersonOption[];
  presetCustomerId?: string;
}) {
  const [open, setOpen] = useState(false);
  if (open) return <TaskForm presetCustomerId={presetCustomerId} customers={customers} projects={projects} people={people} onDone={() => setOpen(false)} />;
  return (
    <button type="button" style={primaryButton} onClick={() => setOpen(true)}>
      + New task
    </button>
  );
}
