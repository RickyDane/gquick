import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  StickyNote,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Save,
  X,
  Clock,
  Search,
  Check,
} from "lucide-react";
import { MarkdownMessage } from "./MarkdownMessage";

export interface Note {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface NotesViewProps {
  onClose?: () => void;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function NotesView({ onClose }: NotesViewProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke<Note[]>("get_notes");
      setNotes(data);
    } catch (e) {
      console.error("Failed to fetch notes:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Listen for quick save events to refresh
  useEffect(() => {
    const handleNoteSaved = () => {
      fetchNotes();
    };
    window.addEventListener("gquick-note-saved", handleNoteSaved);
    return () => window.removeEventListener("gquick-note-saved", handleNoteSaved);
  }, [fetchNotes]);

  const handleSave = async () => {
    if (!editTitle.trim() && !editContent.trim()) return;

    const title = editTitle.trim() || editContent.trim().split("\n")[0].substring(0, 50);
    try {
      if (editingNote) {
        await invoke<Note>("update_note", {
          id: editingNote.id,
          title,
          content: editContent,
        });
      } else {
        await invoke<Note>("create_note", { title, content: editContent });
      }
      setEditingNote(null);
      setIsCreating(false);
      setEditTitle("");
      setEditContent("");
      fetchNotes();
    } catch (e) {
      console.error("Failed to save note:", e);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this note?")) return;
    try {
      await invoke("delete_note", { id });
      fetchNotes();
    } catch (e) {
      console.error("Failed to delete note:", e);
    }
  };

  const handleCopy = async (note: Note) => {
    try {
      await navigator.clipboard.writeText(note.content);
      setCopiedId(note.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const startEdit = (note: Note) => {
    setEditingNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
    setIsCreating(false);
  };

  const startCreate = () => {
    setIsCreating(true);
    setEditingNote(null);
    setEditTitle("");
    setEditContent("");
  };

  const cancelEdit = () => {
    setEditingNote(null);
    setIsCreating(false);
    setEditTitle("");
    setEditContent("");
  };

  const filteredNotes = searchQuery.trim()
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : notes;

  const isEditing = isCreating || editingNote !== null;

  return (
    <div className="flex flex-col h-[300px] min-w-[500px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">Notes</span>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notes..."
                  className="bg-zinc-800 border border-white/10 rounded-lg pl-7 pr-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500/50 transition-all w-40"
                />
              </div>
              <button
                onClick={startCreate}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                New
              </button>
            </>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isEditing ? (
          <div className="p-4 space-y-3">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Note title (optional)"
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500/50 transition-all"
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Write your note in Markdown..."
              rows={6}
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500/50 transition-all resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors border border-white/10 cursor-pointer"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!editTitle.trim() && !editContent.trim()}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                <Save className="h-3 w-3" />
                {editingNote ? "Update" : "Save"}
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-sm text-zinc-400">
            Loading notes...
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <StickyNote className="h-8 w-8 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400 font-medium">
              {searchQuery ? "No notes match your search." : "No notes yet."}
            </p>
            {!searchQuery && (
              <p className="text-xs text-zinc-500 mt-1">
                Type{" "}
                <code className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-white/10">
                  note: your text
                </code>{" "}
                in search to create one.
              </p>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className="group flex flex-col gap-1.5 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-zinc-200 truncate">
                      {note.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handleCopy(note)}
                      className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                      title="Copy content"
                    >
                      {copiedId === note.id ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => startEdit(note)}
                      className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                      title="Edit note"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(note.id)}
                      className="p-1.5 hover:bg-red-500/10 rounded-lg text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                      title="Delete note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {note.content && (
                  <div className="text-xs text-zinc-400 line-clamp-3">
                    <MarkdownMessage content={note.content.length > 200 ? note.content.substring(0, 200) + "..." : note.content} />
                  </div>
                )}

                <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <Clock className="h-3 w-3" />
                  <span>{formatDate(note.updated_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
