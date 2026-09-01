"use client";

import { FlaskConical } from "lucide-react";

/**
 * Marks a screen that is still running on the in-memory demo data.
 *
 * The floor board reads and writes the real `game` schema; these four screens
 * do not yet. Because the database was seeded from the same fixture the mock
 * uses, the two are visually identical - which already cost an afternoon of
 * "is this live or not?". Anything not yet converted says so on its face, so
 * nobody demonstrates invented takings to the client believing they are real.
 *
 * Delete this component when the last screen is converted.
 */
export function DemoNotice() {
  return (
    <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-lg border border-[#e3d4a8] bg-[#fdf9ec] px-4 py-3 text-[13px] text-[#7a5c14]">
      <FlaskConical size={16} className="mt-px flex-none" />
      <div>
        <strong className="font-semibold">Demo data.</strong> This screen still runs on the
        built-in sample set. Nothing here is read from or saved to the database, and changes
        disappear on reload. The floor board is the live one.
      </div>
    </div>
  );
}
