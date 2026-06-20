import { useState } from "react";
import { Message } from "../App";
import { cn } from "../utils/cn";
import {
  Globe,
  Search,
  Terminal,
  Zap,
  StickyNote,
  Cloud,
  Network,
  ChevronRight,
  ChevronDown,
  Loader2,
  Check,
  FileCode,
  AlertCircle,
  X
} from "lucide-react";

interface ToolCallsViewProps {
  msg: Message;
  messages: Message[];
}

function getToolDetails(name: string, args: Record<string, any>, isCompleted: boolean, isFailed: boolean) {
  let Icon = Terminal;
  let label = `Tool: ${name}`;
  let description = isCompleted 
    ? `Executed ${name}` 
    : `Executing ${name}...`;

  switch (name) {
    case "web_search":
      Icon = Globe;
      label = "Web Search";
      description = isCompleted
        ? `Searched web for "${args.query || ""}"`
        : `Searching web for "${args.query || ""}"...`;
      break;
    case "search_files":
      Icon = Search;
      label = "File Search";
      description = isCompleted
        ? `Searched files for "${args.query || ""}"`
        : `Searching files for "${args.query || ""}"...`;
      break;
    case "read_file":
      Icon = FileCode;
      label = "Read File";
      const fileBasename = args.path ? args.path.split("/").pop() : "";
      description = isCompleted
        ? `Read file "${fileBasename || args.path}"`
        : `Reading file "${fileBasename || args.path}"...`;
      break;
    case "calculate":
      Icon = Zap;
      label = "Calculator";
      description = isCompleted
        ? `Calculated "${args.expression || ""}"`
        : `Calculating "${args.expression || ""}"...`;
      break;
    case "search_notes":
      Icon = StickyNote;
      label = "Search Notes";
      description = isCompleted
        ? `Searched notes for "${args.query || ""}"`
        : `Searching notes for "${args.query || ""}"...`;
      break;
    case "create_note":
      Icon = StickyNote;
      label = "Create Note";
      description = isCompleted
        ? `Created note "${args.title || ""}"`
        : `Creating note "${args.title || ""}"...`;
      break;
    case "get_current_weather":
      Icon = Cloud;
      label = "Current Weather";
      description = isCompleted
        ? `Fetched current weather for "${args.location || ""}"`
        : `Fetching current weather for "${args.location || ""}"...`;
      break;
    case "get_weather_forecast":
      Icon = Cloud;
      label = "Weather Forecast";
      description = isCompleted
        ? `Fetched weather forecast for "${args.location || ""}"`
        : `Fetching weather forecast for "${args.location || ""}"...`;
      break;
    case "get_network_info":
      Icon = Network;
      label = "Network Info";
      description = isCompleted
        ? "Retrieved network info"
        : "Retrieving network info...";
      break;
    case "execute_python":
      Icon = Terminal;
      label = "Python Sandbox";
      description = isCompleted
        ? "Run Python code"
        : "Running Python code...";
      break;
    case "execute_sql":
      Icon = Terminal;
      label = "SQL Sandbox";
      description = isCompleted
        ? "Run SQL query"
        : "Running SQL query...";
      break;
  }

  if (isFailed && isCompleted) {
    description = `Failed: ${description
      .replace(/^Executed\s+/i, "executing ")
      .replace(/^Searched\s+/i, "searching ")
      .replace(/^Read\s+/i, "reading ")
      .replace(/^Calculated\s+/i, "calculating ")
      .replace(/^Fetched\s+/i, "fetching ")
      .replace(/^Retrieved\s+/i, "retrieving ")
      .replace(/^Run\s+/i, "running ")}`;
  }

  return { Icon, label, description };
}

export function ToolCallsView({ msg, messages }: ToolCallsViewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedToolCalls, setExpandedToolCalls] = useState<Record<string, boolean>>({});

  const toolCalls = msg.toolCalls || [];
  if (toolCalls.length === 0) return null;

  // Determine if any tool call is still running
  const completedCount = toolCalls.filter(tc => 
    messages.some(m => m.role === "tool" && m.toolCallId === tc.id)
  ).length;
  
  const isAllCompleted = completedCount === toolCalls.length;

  // Determine if any tool call failed
  const hasFailed = toolCalls.some(tc => {
    const resultMsg = messages.find(m => m.role === "tool" && m.toolCallId === tc.id);
    return resultMsg && (resultMsg.content.startsWith("Tool failed:") || resultMsg.content.includes("failed:"));
  });

  const runningToolCall = toolCalls.find(tc => 
    !messages.some(m => m.role === "tool" && m.toolCallId === tc.id)
  );

  const runningDetails = runningToolCall 
    ? getToolDetails(runningToolCall.name, runningToolCall.arguments, false, false)
    : null;

  const toolNames = Array.from(
    new Set(
      toolCalls.map(tc => {
        const { label } = getToolDetails(tc.name, tc.arguments, false, false);
        return label;
      })
    )
  ).join(", ");

  const toggleOpen = () => setIsOpen(!isOpen);

  const toggleExpandTool = (id: string) => {
    setExpandedToolCalls(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <div className="flex flex-col rounded-xl bg-zinc-900/40 border border-white/5 overflow-hidden m-0 max-w-full">
      {/* Header */}
      <button
        onClick={toggleOpen}
        className="flex items-center justify-between px-4 py-2.5 bg-zinc-950/40 hover:bg-zinc-950/60 transition-colors w-full text-left select-none cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {!isAllCompleted ? (
            <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
          ) : hasFailed ? (
            <X className="h-3.5 w-3.5 text-rose-500" />
          ) : (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          )}
          <span className="text-[12px] font-semibold text-zinc-300">
            {!isAllCompleted 
              ? runningDetails?.description || "Using tools..."
              : `Used ${toolCalls.length} tool${toolCalls.length > 1 ? "s" : ""} (${toolNames})`
            }
          </span>
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-zinc-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-400" />
        )}
      </button>

      {/* Expandable Tools List */}
      {isOpen && (
        <div className="divide-y divide-white/5 border-t border-white/5">
          {toolCalls.map((tc) => {
            const resultMsg = messages.find(m => m.role === "tool" && m.toolCallId === tc.id);
            const isCompleted = !!resultMsg;
            const isFailed = isCompleted && (resultMsg.content.startsWith("Tool failed:") || resultMsg.content.includes("failed:"));
            const isExpanded = !!expandedToolCalls[tc.id];

            const { Icon, label, description } = getToolDetails(tc.name, tc.arguments, isCompleted, isFailed);

            return (
              <div key={tc.id} className="flex flex-col bg-zinc-900/20 hover:bg-zinc-900/30 transition-colors">
                {/* Tool Row Header */}
                <button
                  onClick={() => toggleExpandTool(tc.id)}
                  className="flex items-center justify-between px-4 py-2.5 w-full text-left cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "p-1 rounded bg-zinc-800 border border-white/5 shrink-0",
                      isFailed ? "text-rose-400 border-rose-500/20 bg-rose-500/5" : "text-zinc-400"
                    )}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">{label}</span>
                      <span className="text-[12px] text-zinc-300 truncate font-medium">{description}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {/* Status badge */}
                    {!isCompleted ? (
                      <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />
                    ) : isFailed ? (
                      <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                    )}
                  </div>
                </button>

                {/* Details Section */}
                {isExpanded && (
                  <div className="px-4 pb-3 pt-1 border-t border-white/5 bg-zinc-950/30 space-y-2.5">
                    {/* Arguments */}
                    <div>
                      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Arguments</div>
                      <pre className="p-2 rounded-lg bg-zinc-950/80 border border-white/5 overflow-x-auto text-[11px] font-mono text-zinc-300 max-h-[100px]">
                        {JSON.stringify(tc.arguments, null, 2)}
                      </pre>
                    </div>

                    {/* Result */}
                    {isCompleted && resultMsg && (
                      <div>
                        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Response</div>
                        <pre className="p-2 rounded-lg bg-zinc-950/80 border border-white/5 overflow-y-auto text-[11px] font-mono text-zinc-300 max-h-[150px] whitespace-pre-wrap break-all">
                          {resultMsg.content}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
