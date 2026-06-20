import { Globe, ExternalLink, Search } from "lucide-react";

interface GroundingMetadataViewProps {
  metadata: {
    webSearchQueries?: string[];
    groundingChunks?: Array<{
      web?: {
        uri: string;
        title: string;
      };
    }>;
  };
}

export function GroundingMetadataView({ metadata }: GroundingMetadataViewProps) {
  const queries = metadata.webSearchQueries || [];
  const chunks = metadata.groundingChunks || [];

  if (queries.length === 0 && chunks.length === 0) return null;

  const getDomain = (urlStr: string) => {
    try {
      const url = new URL(urlStr);
      return url.hostname.replace("www.", "");
    } catch {
      return "link";
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-2 pt-2.5 border-t border-white/5 text-[12px]">
      {/* Search Queries */}
      {queries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-zinc-400">
          <Search className="h-3 w-3 shrink-0 text-blue-400" />
          <span className="font-semibold text-zinc-500 uppercase tracking-wider text-[10px]">Searched Google:</span>
          {queries.map((q, idx) => (
            <span key={idx} className="text-zinc-300 italic">
              "{q}"{idx < queries.length - 1 ? ", " : ""}
            </span>
          ))}
        </div>
      )}

      {/* Grounding Sources */}
      {chunks.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-0.5">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Sources</div>
          <div className="flex flex-wrap gap-2">
            {chunks.map((chunk, idx) => {
              const web = chunk.web;
              if (!web || !web.uri) return null;

              const title = web.title || getDomain(web.uri);
              const domain = getDomain(web.uri);

              return (
                <a
                  key={idx}
                  href={web.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/40 hover:bg-zinc-800 border border-white/5 text-zinc-300 hover:text-white transition-all cursor-pointer min-w-0 max-w-[200px]"
                  title={title}
                >
                  <Globe className="h-3 w-3 text-zinc-400 shrink-0" />
                  <span className="truncate text-[11px] font-medium leading-none">{domain}</span>
                  <ExternalLink className="h-2.5 w-2.5 text-zinc-500 shrink-0" />
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
