import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownMessageProps {
  content: string;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-3 text-zinc-100">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-semibold mb-2 mt-3 text-zinc-100">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 text-zinc-200">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-zinc-300">{children}</li>,
        code: ({ children, className }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 text-xs font-mono border border-white/10">
                {children}
              </code>
            );
          }
          return (
            <pre className="p-3 rounded-xl bg-zinc-950 border border-white/10 overflow-x-auto my-2">
              <code className="text-xs font-mono text-zinc-300 block">{children}</code>
            </pre>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-blue-500/50 pl-3 my-2 text-zinc-400 italic">
            {children}
          </blockquote>
        ),
        a: ({ children, href }) => (
          <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
        em: ({ children }) => <em className="italic text-zinc-300">{children}</em>,
        hr: () => <hr className="border-white/10 my-3" />,
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-zinc-800/50">{children}</thead>,
        th: ({ children }) => (
          <th className="px-3 py-1.5 text-left text-zinc-200 font-semibold border border-white/10">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-1.5 text-zinc-300 border border-white/10">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
