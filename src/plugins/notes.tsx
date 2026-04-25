import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StickyNote, Search } from "lucide-react";
import { GQuickPlugin, SearchResultItem, ToolResult } from "./types";

interface Note {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

function generateTitle(content: string): string {
  const firstLine = content.split("\n")[0].trim();
  if (firstLine.length <= 30) return firstLine;
  return firstLine.substring(0, 30) + "...";
}

function getPreview(content: string, maxLength: number = 60): string {
  const cleaned = content.replace(/\n/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength) + "...";
}

export const notesPlugin: GQuickPlugin = {
  metadata: {
    id: "notes",
    title: "Notes",
    icon: StickyNote,
    keywords: ["note", "memo", "remember", "save"],
    queryPrefixes: ["note:", "notes:", "search notes:"],
  },
  tools: [
    {
      name: "search_notes",
      description: "Search saved notes by title or content.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for note title or content" },
        },
        required: ["query"],
      },
    },
    {
      name: "create_note",
      description: "Save a new note to the user's notes database.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Note title" },
          content: { type: "string", description: "Note body content" },
        },
        required: ["title", "content"],
      },
    },
  ],
  executeTool: async (name: string, args: Record<string, any>): Promise<ToolResult> => {
    if (name === "search_notes") {
      try {
        const notes = await invoke<Note[]>("search_notes", { query: args.query });
        return { content: JSON.stringify(notes), success: true };
      } catch (err: any) {
        return { content: "", success: false, error: err.message || String(err) };
      }
    }
    if (name === "create_note") {
      try {
        await invoke("create_note", { title: args.title, content: args.content });
        return { content: `Note "${args.title}" created successfully.`, success: true };
      } catch (err: any) {
        return { content: "", success: false, error: err.message || String(err) };
      }
    }
    return { content: "", success: false, error: `Unknown tool: ${name}` };
  },
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    const trimmed = query.trim();
    const lower = trimmed.toLowerCase();

    // Quick capture: note: <content>
    if (lower.startsWith("note:")) {
      const content = trimmed.substring(5).trim();
      if (!content) {
        return [{
          id: "note-empty",
          pluginId: "notes",
          title: "Save a quick note",
          subtitle: "Type your note after 'note:'",
          icon: StickyNote,
          score: 100,
          onSelect: () => {},
        }];
      }

      const title = generateTitle(content);
      const preview = getPreview(content);

      return [{
        id: "note-quick-save",
        pluginId: "notes",
        title: `Save note: ${title}`,
        subtitle: preview,
        icon: StickyNote,
        score: 200,
        onSelect: async () => {
          try {
            await invoke("create_note", { title, content });
            window.dispatchEvent(new CustomEvent("gquick-note-saved"));
            await getCurrentWindow().hide();
          } catch (e) {
            console.error("Failed to save note:", e);
          }
        },
      }];
    }

    // Search notes: search notes: <query> or notes: <query>
    const searchPrefixMatch = lower.match(/^(?:search notes:|notes:)\s*/);
    if (searchPrefixMatch) {
      const searchQuery = trimmed.substring(searchPrefixMatch[0].length).trim();
      if (!searchQuery) {
        return [{
          id: "notes-search-empty",
          pluginId: "notes",
          title: "Search notes",
          subtitle: "Type your search query",
          icon: Search,
          score: 200,
          onSelect: () => {},
        }];
      }

      try {
        const notes = await invoke<Note[]>("search_notes", { query: searchQuery });
        if (notes.length === 0) {
          return [{
            id: "notes-no-results",
            pluginId: "notes",
            title: "No notes found",
            subtitle: `No notes match "${searchQuery}"`,
            icon: Search,
            score: 200,
            onSelect: () => {},
          }];
        }

        return notes.map((note) => ({
          id: `note-${note.id}`,
          pluginId: "notes",
          title: note.title,
          subtitle: getPreview(note.content, 80),
          icon: StickyNote,
          score: 200,
          onSelect: () => {
            window.dispatchEvent(new CustomEvent("gquick-open-note", { detail: note.id }));
          },
        }));
      } catch (e) {
        console.error("Note search error:", e);
        return [];
      }
    }

    // If user types "note" or "notes" without prefix, show the dedicated view action
    if (lower === "note" || lower === "notes" || lower === "memo") {
      return [{
        id: "notes-open",
        pluginId: "notes",
        title: "Open Notes",
        subtitle: "Browse and manage your notes",
        icon: StickyNote,
        score: 200,
        onSelect: () => {
          // Trigger notes view via custom event
          window.dispatchEvent(new CustomEvent("gquick-open-notes"));
        },
      }];
    }

    return [];
  },
};
