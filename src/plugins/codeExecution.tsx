import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Code2, Play, Copy, Check, Loader2, Terminal, Database } from "lucide-react";
import { GQuickPlugin, SearchResultItem, ToolResult } from "./types";
import { cn } from "../utils/cn";

interface ExecuteResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

interface CodeExecutionViewProps {
  initialType: "python" | "sql";
  initialCode: string;
}

function CodeExecutionView({ initialType, initialCode }: CodeExecutionViewProps) {
  const [type, setType] = useState<"python" | "sql">(initialType);
  const [code, setCode] = useState(initialCode);
  const [isLoading, setIsLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [success, setSuccess] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [hasEdited, setHasEdited] = useState(false);

  // Sync type and code if the user updates them from the main search bar,
  // but only if the user hasn't started manually editing the code yet.
  useEffect(() => {
    if (!hasEdited) {
      setCode(initialCode);
    }
  }, [initialCode, hasEdited]);

  useEffect(() => {
    setType(initialType);
  }, [initialType]);

  const handleRun = async () => {
    if (!code.trim()) return;

    setIsLoading(true);
    setError("");
    setOutput("");
    setSuccess(null);

    try {
      if (type === "python") {
        const result = await invoke<ExecuteResult>("execute_python", { code });
        setSuccess(result.success);
        if (result.success) {
          setOutput(result.stdout || "Execution succeeded with no output.");
        } else {
          setError(result.stderr || "Execution failed with no error output.");
        }
      } else {
        const result = await invoke<ExecuteResult>("execute_sql", { query: code });
        setSuccess(result.success);
        if (result.success) {
          setOutput(result.stdout || "Query succeeded with no output.");
        } else {
          setError(result.stderr || "Query failed with no error output.");
        }
      }
    } catch (err: any) {
      setSuccess(false);
      setError(err.toString());
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    const textToCopy = output || error;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleRun();
    }
  };

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setType("python")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all",
              type === "python"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-zinc-400 hover:text-zinc-200 border border-transparent"
            )}
          >
            <Terminal className="h-3.5 w-3.5" />
            Python
          </button>
          <button
            onClick={() => setType("sql")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all",
              type === "sql"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-zinc-400 hover:text-zinc-200 border border-transparent"
            )}
          >
            <Database className="h-3.5 w-3.5" />
            SQL
          </button>
        </div>
        <span className="text-[10px] text-zinc-500 font-medium font-mono">
          Press ⌘↵ or ⌃↵ to run
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <textarea
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setHasEdited(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            type === "python"
              ? "# Write your Python code here...\nprint('Hello, world!')"
              : "-- Write your SQL query here...\nSELECT * FROM users;"
          }
          rows={6}
          className="w-full bg-zinc-950 border border-white/5 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-blue-500/30 transition-all resize-none font-mono"
        />
      </div>

      <button
        onClick={handleRun}
        disabled={isLoading || !code.trim()}
        className="flex items-center justify-center gap-2 w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-900/30"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Running code...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 fill-current" />
            Run Code
          </>
        )}
      </button>

      {success !== null && (
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="flex items-center justify-between">
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-wider",
              success ? "text-green-400" : "text-red-400"
            )}>
              {success ? "Success (stdout)" : "Error / Output"}
            </span>
            {(output || error) && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-green-400" />
                    <span className="text-green-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Output
                  </>
                )}
              </button>
            )}
          </div>
          <pre className={cn(
            "w-full max-h-[160px] overflow-auto border rounded-xl px-3 py-2.5 text-xs font-mono whitespace-pre-wrap break-all",
            success 
              ? "bg-zinc-950/80 border-green-500/20 text-zinc-300"
              : "bg-red-500/5 border-red-500/20 text-red-300"
          )}>
            {output || error || "Code ran successfully with no output."}
          </pre>
        </div>
      )}
    </div>
  );
}

function parseQuery(query: string) {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  let type: "python" | "sql" = "python";
  let code = "";

  if (lower.startsWith("python:")) {
    type = "python";
    code = query.substring("python:".length).trim();
  } else if (lower.startsWith("python ")) {
    type = "python";
    code = query.substring("python ".length).trim();
  } else if (lower.startsWith("sql:")) {
    type = "sql";
    code = query.substring("sql:".length).trim();
  } else if (lower.startsWith("sql ")) {
    type = "sql";
    code = query.substring("sql ".length).trim();
  } else if (lower.startsWith("code:")) {
    type = "python";
    code = query.substring("code:".length).trim();
  } else if (lower.startsWith("code ")) {
    type = "python";
    code = query.substring("code ".length).trim();
  } else if (lower.startsWith("/code")) {
    type = "python";
    code = query.substring("/code".length).trim();
  } else if (lower === "code" || lower === "python" || lower === "sql") {
    type = lower === "sql" ? "sql" : "python";
    code = "";
  } else {
    type = "python";
    code = query;
  }

  return { type, code };
}

export const codeExecutionPlugin: GQuickPlugin = {
  metadata: {
    id: "codeExecution",
    title: "Code Execution",
    subtitle: "Run Python and SQL scripts in a sandbox",
    icon: Code2,
    keywords: ["code", "run", "python", "sql", "execute", "sandbox"],
    queryPrefixes: ["code:", "python:", "sql:", "/code", "code ", "python ", "sql "],
  },
  shouldSearch: (query: string) => {
    const trimmed = query.trim().toLowerCase();
    return trimmed.startsWith("code:") ||
           trimmed.startsWith("python:") ||
           trimmed.startsWith("sql:") ||
           trimmed.startsWith("/code") ||
           trimmed === "code" ||
           trimmed === "python" ||
           trimmed === "sql" ||
           trimmed.startsWith("code ") ||
           trimmed.startsWith("python ") ||
           trimmed.startsWith("sql ");
  },
  tools: [
    {
      name: "execute_python",
      description: "Write and execute Python code in a sandboxed/local environment. Use it for data analysis, complex math, or automated text transformations.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "Python code to execute.",
          },
        },
        required: ["code"],
      },
    },
    {
      name: "execute_sql",
      description: "Run SQL queries against a sandboxed SQLite database. Perfect for tabular data manipulation, filtering, and structured analysis.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "SQL statements/queries to execute.",
          },
        },
        required: ["query"],
      },
    },
  ],
  executeTool: async (name: string, args: Record<string, any>): Promise<ToolResult> => {
    if (name === "execute_python") {
      const code = args.code;
      if (typeof code !== "string") {
        return { content: "", success: false, error: "Missing 'code' parameter" };
      }
      try {
        const result = await invoke<ExecuteResult>("execute_python", { code });
        if (result.success) {
          return { content: result.stdout || "Execution succeeded with no output.", success: true };
        } else {
          return {
            content: result.stderr || "Execution failed with no error output.",
            success: false,
            error: result.stderr,
          };
        }
      } catch (err: any) {
        return { content: "", success: false, error: err.toString() };
      }
    }

    if (name === "execute_sql") {
      const query = args.query;
      if (typeof query !== "string") {
        return { content: "", success: false, error: "Missing 'query' parameter" };
      }
      try {
        const result = await invoke<ExecuteResult>("execute_sql", { query });
        if (result.success) {
          return { content: result.stdout || "Query succeeded with no output.", success: true };
        } else {
          return {
            content: result.stderr || "Query failed with no error output.",
            success: false,
            error: result.stderr,
          };
        }
      } catch (err: any) {
        return { content: "", success: false, error: err.toString() };
      }
    }

    return { content: "", success: false, error: `Unsupported tool: ${name}` };
  },
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    const trimmed = query.trim().toLowerCase();

    const isCodeQuery = trimmed.startsWith("code:") ||
                        trimmed.startsWith("python:") ||
                        trimmed.startsWith("sql:") ||
                        trimmed.startsWith("/code") ||
                        trimmed === "code" ||
                        trimmed === "python" ||
                        trimmed === "sql" ||
                        trimmed.startsWith("code ") ||
                        trimmed.startsWith("python ") ||
                        trimmed.startsWith("sql ");

    if (!isCodeQuery) {
      return [];
    }

    const { type: initialType, code: initialCode } = parseQuery(query);

    return [{
      id: "code-execution-open",
      pluginId: "codeExecution",
      title: "Execute Code Sandbox",
      subtitle: initialType === "python" ? "Run Python script in a local sandbox" : "Run SQL query against SQLite database",
      icon: Code2,
      score: 100,
      onSelect: () => {},
      renderPreview: () => {
        return <CodeExecutionView initialType={initialType} initialCode={initialCode} />;
      },
    }];
  },
};
