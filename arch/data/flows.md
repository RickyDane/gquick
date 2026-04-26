# Data Flows

## Search and actions

```mermaid
sequenceDiagram
  participant User
  participant App
  participant Registry
  participant Plugin
  participant Backend

  User->>App: Type query
  App->>Registry: getPluginsForQuery(query)
  Registry-->>App: matching plugins
  App->>Plugin: getItems(query) with debounce/request guard
  Plugin->>Backend: invoke(...) if needed
  Backend-->>Plugin: data/result
  Plugin-->>App: SearchResultItem[]
  App->>App: sort by score
  User->>App: Select item/action
  App->>Plugin: onSelect/onRun
```

## AI chat with tool calling

```mermaid
flowchart TD
  Message[User message/images] --> Tools[getAllTools]
  Tools --> Convert[Provider schema conversion]
  Convert --> Stream[Provider SSE stream]
  Stream --> Text[Render content deltas]
  Stream --> Calls{Tool calls?}
  Calls -->|no| Done[Finish response]
  Calls -->|yes| Execute[executeTool]
  Execute --> Plugin[Plugin executeTool]
  Plugin --> Result[ToolResult]
  Result --> History[Append tool messages]
  History --> Followup[Follow-up provider request]
  Followup --> Final[Final assistant answer]
```

## File search and safe read

```mermaid
flowchart TD
  Query[File query] --> Mode{Smart keywords?}
  Mode -->|no| Launcher[launcher_search_files]
  Mode -->|yes| Smart[smart_search_files]
  Launcher --> Runtime[jwalk runtime search roots]
  Smart --> Runtime
  Runtime --> Policy[Skip hidden/system/build/cache; no symlink following]
  Policy --> Results[FileInfo/SmartFileInfo]
  Smart --> Preview[Safe text previews/full content where allowed]
  Preview --> AIRank[Frontend AI ranking]
  AIRank --> Items[Ranked results]
  Results --> Items
  ToolRead[AI read_file tool] --> ReadPolicy[absolute path + under roots + not hidden/secret/symlink + text + size cap]
  ReadPolicy --> Content[Text content]
```

## Notes persistence

```mermaid
flowchart LR
  Quick[note: text] --> Create[create_note]
  Manager[NotesView CRUD] --> Commands[create/get/update/delete/search/get_by_id]
  Chat[AI notes tools/context] --> Commands
  Commands --> DB[(SQLite gquick.db notes table)]
  DB --> Results[Notes returned to UI/chat]
```

## Docker management

```mermaid
flowchart TD
  DockerQuery[docker: query] --> Plugin[dockerPlugin]
  Plugin --> Local[list_containers/list_images]
  Plugin --> Hub[Docker Hub search via frontend util]
  Plugin --> Open[Open DockerView]
  DockerView --> Status[docker_status]
  DockerView --> Ops[run/pull/manage/logs/exec/inspect/prune]
  DockerView --> Compose[compose_read/write/action]
  Ops --> CLI[Docker CLI/daemon]
  Compose --> CLI
```

## Screenshot/OCR

See `arch/backend-tauri.md` for detailed sequence. Key data outputs: saved Desktop PNG, clipboard image/text, or `ocr-image-ready` base64 event for frontend AI vision OCR.

## Quick translate

```mermaid
flowchart LR
  Prefix[t: or tr:] --> App[App.tsx detects quick translate]
  App --> AI[performQuickTranslate via selected provider]
  AI --> Result[Single translation result]
  Result --> Clipboard[Enter copies + hides window]
```
