"use client";

import { useState } from "react";

type ThemeChoice = "system" | "light" | "dark";

const LABELS: Record<ThemeChoice, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

function applyTheme(choice: ThemeChoice) {
  if (choice === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", choice);
  }
}

function readStoredTheme(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function ThemeToggle() {
  // Starts from the theme layout.tsx already applied. The server can't see
  // localStorage, so the <select> below uses suppressHydrationWarning.
  const [choice, setChoice] = useState<ThemeChoice>(readStoredTheme);

  function handleChange(next: ThemeChoice) {
    setChoice(next);
    applyTheme(next);
    try {
      if (next === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {
      // If storage is blocked, the theme still applies until the page closes.
    }
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Theme
      <select
        value={choice}
        onChange={(e) => handleChange(e.target.value as ThemeChoice)}
        className="rounded-sm border border-divider bg-transparent px-2 py-1 text-text"
        suppressHydrationWarning
      >
        {(Object.keys(LABELS) as ThemeChoice[]).map((c) => (
          <option key={c} value={c}>
            {LABELS[c]}
          </option>
        ))}
      </select>
    </label>
  );
}
