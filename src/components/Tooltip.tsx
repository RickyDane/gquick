import React from "react";
import { cn } from "../utils/cn";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom";
  className?: string;
}

export function Tooltip({ content, children, position = "bottom", className }: TooltipProps) {
  return (
    <div className={cn("relative group", className)}>
      {children}
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-zinc-800 border border-white/10 text-[10px] text-zinc-200 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none z-50",
          position === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
        )}
      >
        {content}
      </div>
    </div>
  );
}
