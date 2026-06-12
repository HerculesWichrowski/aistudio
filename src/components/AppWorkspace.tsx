"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Code2,
  Database,
  ExternalLink,
  FileCode,
  FilePlus2,
  Eye,
  KeyRound,
  Loader2,
  Paperclip,
  Pencil,
  RotateCw,
  Save,
  Settings2,
  Share2,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import ShareDialog from "./ShareDialog";
import PageLoader from "./PageLoader";
import BrandLogo from "./BrandLogo";
import ModelSelect from "./ModelSelect";
import { loadProjectRules, type FieldRule } from "@/lib/database";
import { shouldCaptureConsole } from "@/lib/console-filter";
import {
  parseStoredFileOps,
  type BuildFileStatus,
  type StoredFileOp,
} from "@/lib/build-stream-client";

type BuildRunSnapshot = {
  id: string;
  projectId: string;
  status: "running" | "done" | "error";
  phase: "planning" | "building" | "idle";
  streamChat: string;
  events: BuildFileStatus[];
  error: string;
  updatedAt: number;
};

type Message = { id: string; role: string; content: string };
type ProjectFile = { id: string; path: string; content: string };
type ModelOption = { id: string; name: string; free: boolean };
type Project = {
  id: string;
  name: string;
  description: string;
  model: string;
  visibility: string;
  shared_emails: string;
  openrouter_api_key: string;
  ai: {
    canUseAi: boolean;
    hasProjectKey: boolean;
    defaultModel: string;
    models: ModelOption[];
  };
};
type ConsoleEntry = { id: number; level: string; text: string };
type AppData = Record<string, Record<string, unknown>[]>;
type UploadedAttachment = { id: string; name: string; content: string };

const MAX_ATTACHMENT_BYTES = 512_000;

function chipClassForStatus(status: BuildFileStatus["status"] | StoredFileOp["status"]) {
  if (status === "start") return "chip chip-working";
  if (status === "error") return "chip chip-error";
  if (status === "done" || status === "deleted") return "chip chip-done";
  return "chip";
}

function FileChip({
  path,
  status,
  error,
  deleted,
}: {
  path: string;
  status: BuildFileStatus["status"] | StoredFileOp["status"];
  error?: string;
  deleted?: boolean;
}) {
  return (
    <span className={chipClassForStatus(status)} title={error}>
      {status === "start" ? (
        <Loader2 size={11} className="chip-spinner" />
      ) : (
        <FileCode size={11} />
      )}
      {deleted ? "removed " : ""}
      {path}
      {status === "error" ? ` (${error ?? "failed"})` : ""}
    </span>
  );
}

function AssistantMessage({
  content,
  streaming,
  buildEvents = [],
  phase = "idle",
}: {
  content: string;
  streaming?: boolean;
  buildEvents?: BuildFileStatus[];
  phase?: "idle" | "planning" | "building";
}) {
  const parsed = useMemo(() => parseStoredFileOps(content), [content]);
  const text = parsed.text;
  const storedOps = parsed.ops;
  const showLiveEvents = buildEvents.length > 0;
  const fileItems = showLiveEvents
    ? buildEvents.map((event) => ({
        key: event.path,
        path: event.path,
        status: event.status,
        error: event.error,
        deleted: event.status === "deleted",
      }))
    : storedOps.map((op) => ({
        key: op.path,
        path: op.path,
        status: op.status ?? "done",
        error: op.error,
        deleted: op.action === "delete" || op.status === "deleted",
      }));

  const planning = phase === "planning";
  const building = phase === "building";

  return (
    <div className="msg assistant">
      {text ? <div className="msg-body">{text}</div> : null}
      {fileItems.length > 0 && (
        <div className="chips">
          {fileItems.map((item) => (
            <FileChip
              deleted={item.deleted}
              error={item.error}
              key={item.key}
              path={item.path}
              status={item.status}
            />
          ))}
        </div>
      )}
      {planning && !text && (
        <div className="msg-status">
          <Loader2 size={13} className="chip-spinner" />
          <span>Thinking…</span>
        </div>
      )}
      {building && fileItems.length === 0 && (
        <div className="msg-status">
          <Loader2 size={13} className="chip-spinner" />
          <span>Working on your app…</span>
        </div>
      )}
      {streaming && planning && text && (
        <span className="stream-cursor" aria-hidden />
      )}
    </div>
  );
}

function UserMessage({
  content,
  disabled,
  onEdit,
  onRedo,
}: {
  content: string;
  disabled?: boolean;
  onEdit: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="msg user">
      <div className="msg-body">{content}</div>
      <div className="msg-actions">
        <button
          className="msg-action"
          disabled={disabled}
          onClick={onEdit}
          title="Edit message"
          type="button"
        >
          <Pencil size={11} />
          Edit
        </button>
        <button
          className="msg-action"
          disabled={disabled}
          onClick={onRedo}
          title="Redo from here"
          type="button"
        >
          <RotateCw size={11} />
          Redo
        </button>
      </div>
    </div>
  );
}

function DataRowEditor({
  row,
  fields,
  onSave,
  onCancel,
}: {
  row: Record<string, unknown>;
  fields: Record<string, FieldRule>;
  onSave: (next: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...row });
  const [error, setError] = useState("");

  function setField(name: string, value: unknown) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function submit() {
    try {
      onSave({ ...draft, id: row.id });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid row");
    }
  }

  const fieldNames = Object.keys(fields);
  const extras = Object.keys(row).filter((key) => key !== "id" && !fieldNames.includes(key));

  return (
    <div className="data-row-editor">
      <div className="data-fields">
        <label className="data-field">
          <span className="label">id</span>
          <input className="input mono" value={String(row.id)} disabled />
        </label>
        {fieldNames.map((name) => {
          const rule = fields[name];
          const value = draft[name];
          if (rule.type === "boolean") {
            return (
              <label className="data-field" key={name}>
                <span className="label">{name}</span>
                <select
                  className="select"
                  value={value === true ? "true" : value === false ? "false" : ""}
                  onChange={(event) => setField(name, event.target.value === "true")}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </label>
            );
          }
          return (
            <label className="data-field" key={name}>
              <span className="label">
                {name}
                {rule.required ? " *" : ""}
              </span>
              <input
                className="input"
                type={rule.type === "number" ? "number" : "text"}
                value={value == null ? "" : String(value)}
                onChange={(event) =>
                  setField(
                    name,
                    rule.type === "number"
                      ? event.target.value === ""
                        ? undefined
                        : Number(event.target.value)
                      : event.target.value
                  )
                }
              />
            </label>
          );
        })}
        {extras.map((name) => (
          <label className="data-field" key={name}>
            <span className="label">{name}</span>
            <input
              className="input mono"
              value={draft[name] == null ? "" : JSON.stringify(draft[name])}
              onChange={(event) => {
                try {
                  setField(name, JSON.parse(event.target.value));
                } catch {
                  setField(name, event.target.value);
                }
              }}
            />
          </label>
        ))}
      </div>
      {error && <p className="chat-error" style={{ margin: 0 }}>{error}</p>}
      <div className="data-row-actions">
        <button className="btn-ghost" type="button" style={{ minHeight: 26, fontSize: 12 }} onClick={onCancel}>
          Cancel
        </button>
        <button className="btn" type="button" style={{ minHeight: 26, fontSize: 12 }} onClick={submit}>
          Save
        </button>
      </div>
    </div>
  );
}

function DataAdminPanel({
  projectId,
  files,
  onChanged,
}: {
  projectId: string;
  files: ProjectFile[];
  onChanged: () => void;
}) {
  const [data, setData] = useState<AppData>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingRow, setEditingRow] = useState<{ table: string; id: string } | null>(null);

  const rules = useMemo(() => loadProjectRules(files).rules, [files]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/projects/${projectId}/data`);
    if (response.ok) {
      const payload = await response.json();
      setData(payload.data ?? {});
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function saveRow(table: string, row: Record<string, unknown>) {
    await fetch(`/api/projects/${projectId}/data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, id: row.id, row }),
    });
    await loadData();
    onChanged();
  }

  async function deleteRow(table: string, rowId: string) {
    await fetch(`/api/projects/${projectId}/data?table=${encodeURIComponent(table)}&id=${encodeURIComponent(rowId)}`, {
      method: "DELETE",
    });
    await loadData();
    onChanged();
  }

  if (!rules?.tables || Object.keys(rules.tables).length === 0) {
    return (
      <div className="data-empty">
        <Database size={28} strokeWidth={1.5} />
        <p>No database yet.</p>
        <p className="muted">Ask the builder to &ldquo;add a database&rdquo; — it will create <code>database.rules.json</code> and wire <code>window.db</code> in your app.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="data-empty">
        <span className="thinking">
          <i /> <i /> <i />
        </span>
      </div>
    );
  }

  return (
    <div className="data-panel">
      {Object.keys(rules.tables).map((table) => {
        const rows = data[table] ?? [];
        const open = expanded[table] ?? true;
        return (
          <div className="data-table" key={table}>
            <button
              className="data-table-head"
              type="button"
              onClick={() => setExpanded((current) => ({ ...current, [table]: !open }))}
            >
              {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              <span className="mono">{table}</span>
              <span className="muted">[{rows.length}]</span>
            </button>
            {open && (
              <div className="data-rows">
                {rows.length === 0 ? (
                  <div className="data-row-empty muted">No rows</div>
                ) : (
                  rows.map((row) => {
                    const isEditing =
                      editingRow?.table === table && editingRow.id === String(row.id);
                    const tableFields = rules.tables?.[table]?.fields ?? {};

                    return (
                      <div className="data-row" key={String(row.id)}>
                        {isEditing ? (
                          <DataRowEditor
                            fields={tableFields}
                            onCancel={() => setEditingRow(null)}
                            onSave={(next) => {
                              void saveRow(table, next).then(() => setEditingRow(null));
                            }}
                            row={row}
                          />
                        ) : (
                          <>
                            <pre className="data-row-json">{JSON.stringify(row, null, 2)}</pre>
                            <div className="data-row-actions">
                              <button
                                className="btn-ghost"
                                type="button"
                                style={{ minHeight: 26, fontSize: 12 }}
                                onClick={() => setEditingRow({ table, id: String(row.id) })}
                              >
                                Edit
                              </button>
                              <button
                                className="btn-icon btn-danger"
                                type="button"
                                style={{ width: 26, minHeight: 26 }}
                                onClick={() => void deleteRow(table, String(row.id))}
                                title="Delete row"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

let consoleId = 0;

export default function AppWorkspace() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const [project, setProject] = useState<Project | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [input, setInput] = useState("");
  const [streamChat, setStreamChat] = useState("");
  const [buildEvents, setBuildEvents] = useState<BuildFileStatus[]>([]);
  const [streamPhase, setStreamPhase] = useState<"idle" | "planning" | "building">("idle");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [tab, setTab] = useState<"preview" | "code" | "data">("preview");
  const [previewKey, setPreviewKey] = useState(0);
  const [selectedPath, setSelectedPath] = useState("");
  const [draftPath, setDraftPath] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [saving, setSaving] = useState(false);

  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [chatError, setChatError] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [chatWidth, setChatWidth] = useState(400);
  const chatWidthRef = useRef(400);
  const resizingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const didSendStarter = useRef(false);
  const didLoad = useRef(false);
  const loadingRef = useRef(false);
  const pollRunRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRunRef = useRef<string | null>(null);

  const errorCount = useMemo(
    () => consoleEntries.filter((entry) => entry.level === "error").length,
    [consoleEntries]
  );

  useEffect(() => {
    const stored = localStorage.getItem("aistudio:chat-width");
    if (stored) {
      const parsed = Number(stored);
      if (parsed >= 300 && parsed <= 800) {
        setChatWidth(parsed);
        chatWidthRef.current = parsed;
      }
    }
  }, []);

  useEffect(() => {
    function onMove(event: MouseEvent) {
      if (!resizingRef.current) return;
      const next = Math.min(720, Math.max(280, event.clientX));
      chatWidthRef.current = next;
      setChatWidth(next);
    }
    function onUp() {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("aistudio:chat-width", String(chatWidthRef.current));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  async function addUploadedFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    const next: UploadedAttachment[] = [];
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setChatError(`${file.name} is too large (max 512KB)`);
        continue;
      }
      try {
        const content = await readUploadedFile(file);
        next.push({ id: crypto.randomUUID(), name: file.name, content });
      } catch {
        setChatError(`Could not read ${file.name}`);
      }
    }

    if (next.length) {
      setAttachments((current) => [...current, ...next]);
      setChatError("");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function readUploadedFile(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      if (file.type.startsWith("image/")) reader.readAsDataURL(file);
      else reader.readAsText(file);
    });
  }

  const load = useCallback(async () => {
    const [projectResponse, messagesResponse, filesResponse] = await Promise.all([
      fetch(`/api/projects/${id}`),
      fetch(`/api/messages?projectId=${id}`),
      fetch(`/api/files?projectId=${id}`),
    ]);

    if (!projectResponse.ok) {
      setNotFound(true);
      return;
    }

    setProject(await projectResponse.json());
    setMessages(await messagesResponse.json());
    setFiles(await filesResponse.json());
    setLoaded(true);
  }, [id]);

  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamChat, buildEvents]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || data.__aistudio !== true || data.type !== "console") return;
      const text = String(data.text);
      if (!shouldCaptureConsole(text)) return;
      setConsoleEntries((current) => [
        ...current.slice(-199),
        { id: ++consoleId, level: String(data.level), text },
      ]);
      if (data.level === "error") setConsoleOpen(true);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const refreshPreview = useCallback(() => {
    setConsoleEntries([]);
    setPreviewKey((key) => key + 1);
  }, []);

  async function refreshData() {
    const [messagesResponse, filesResponse] = await Promise.all([
      fetch(`/api/messages?projectId=${id}`),
      fetch(`/api/files?projectId=${id}`),
    ]);
    setMessages(await messagesResponse.json());
    setFiles(await filesResponse.json());
  }

  const stopFollowingRun = useCallback(() => {
    if (pollRunRef.current) {
      clearInterval(pollRunRef.current);
      pollRunRef.current = null;
    }
    activeRunRef.current = null;
  }, []);

  const applyRunSnapshot = useCallback((run: BuildRunSnapshot) => {
    setStreamChat(run.streamChat);
    setBuildEvents(run.events);
    if (run.status === "running") {
      setStreamPhase(run.phase === "building" ? "building" : "planning");
    } else {
      setStreamPhase("idle");
    }
    if (run.error) setChatError(run.error);
  }, []);

  const followBuildRun = useCallback(
    async (runId: string) => {
      stopFollowingRun();
      activeRunRef.current = runId;
      loadingRef.current = true;
      setLoading(true);
      setChatError("");

      const poll = async () => {
        if (activeRunRef.current !== runId) return;
        try {
          const response = await fetch(`/api/build-runs/${runId}`);
          if (!response.ok) return;
          const run = (await response.json()) as BuildRunSnapshot;
          applyRunSnapshot(run);

          if (run.status !== "running") {
            stopFollowingRun();
            loadingRef.current = false;
            setLoading(false);
            setStreamChat("");
            setBuildEvents([]);
            setStreamPhase("idle");
            await refreshData();
            refreshPreview();
            setTab("preview");
          }
        } catch {}
      };

      await poll();
      pollRunRef.current = setInterval(() => void poll(), 800);
    },
    [applyRunSnapshot, refreshPreview, stopFollowingRun]
  );

  useEffect(() => () => stopFollowingRun(), [stopFollowingRun]);

  async function truncateMessages(fromMessageId: string, includeMessage: boolean) {
    await fetch(
      `/api/messages?projectId=${encodeURIComponent(id)}&fromMessageId=${encodeURIComponent(fromMessageId)}&include=${includeMessage}`,
      { method: "DELETE" }
    );
    const messagesResponse = await fetch(`/api/messages?projectId=${id}`);
    setMessages(await messagesResponse.json());
  }

  const sendMessage = useCallback(
    async (forcedContent?: string, options?: { skipUserInsert?: boolean }) => {
      const content = (forcedContent ?? input).trim();
      if ((!content && attachments.length === 0) || loadingRef.current) return;

      loadingRef.current = true;
      if (!options?.skipUserInsert) setInput("");
      const outgoingAttachments = attachments.map(({ name, content: fileContent }) => ({
        name,
        content: fileContent,
      }));
      if (!options?.skipUserInsert) setAttachments([]);
      setLoading(true);
      setStreamChat("");
      setBuildEvents([]);
      setStreamPhase("planning");
      setChatError("");

      if (!options?.skipUserInsert) {
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "user",
            content: content || `[${outgoingAttachments.map((file) => file.name).join(", ")}]`,
          },
        ]);
      }

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: id,
            content,
            skipUserInsert: options?.skipUserInsert === true,
            attachments: outgoingAttachments,
          }),
        });

        if (!response.ok) {
          const detail = (await response.text()).trim();
          throw new Error(detail || response.statusText);
        }

        const { runId } = (await response.json()) as { runId: string };
        await followBuildRun(runId);
      } catch (error) {
        stopFollowingRun();
        setStreamChat("");
        setBuildEvents([]);
        setStreamPhase("idle");
        setChatError(error instanceof Error ? error.message : "Request failed");
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [id, input, attachments, followBuildRun, stopFollowingRun]
  );

  async function editMessage(messageId: string, content: string) {
    if (loadingRef.current) return;
    await truncateMessages(messageId, true);
    setInput(content);
  }

  async function redoMessage(messageId: string, content: string) {
    if (loadingRef.current) return;
    await truncateMessages(messageId, false);
    void sendMessage(content, { skipUserInsert: true });
  }

  useEffect(() => {
    if (!loaded) return;

    void (async () => {
      const activeResponse = await fetch(`/api/build-runs?projectId=${encodeURIComponent(id)}`);
      const activeRun = activeResponse.ok
        ? ((await activeResponse.json()) as BuildRunSnapshot | null)
        : null;

      if (activeRun?.status === "running") {
        didSendStarter.current = true;
        window.history.replaceState(null, "", `/projects/${id}`);
        await followBuildRun(activeRun.id);
        return;
      }

      const starter = searchParams.get("prompt");
      if (!starter || didSendStarter.current || messages.length > 0) return;
      didSendStarter.current = true;
      window.history.replaceState(null, "", `/projects/${id}`);
      void sendMessage(starter);
    })();
  }, [loaded, id, messages.length, searchParams, followBuildRun, sendMessage]);

  function fixErrors() {
    const errors = consoleEntries
      .filter((entry) => entry.level === "error")
      .slice(-10)
      .map((entry) => `- ${entry.text}`)
      .join("\n");
    void sendMessage(
      `The running app produced these console errors:\n\n${errors}\n\nFind the root cause and fix the files.`
    );
  }

  async function changeModel(model: string) {
    if (!project) return;
    setProject({ ...project, model });
    const response = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (!response.ok) {
      const raw = (await response.text()).trim();
      try {
        const parsed = JSON.parse(raw) as { error?: string };
        setChatError(parsed.error ?? raw);
      } catch {
        setChatError(raw || response.statusText);
      }
      void load();
    }
  }

  async function saveApiKey(clear = false) {
    const response = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openrouter_api_key: clear ? "" : apiKeyDraft.trim() }),
    });
    if (!response.ok) {
      setChatError("Could not save API key");
      return;
    }
    setSettingsOpen(false);
    setApiKeyDraft("");
    await load();
  }

  function pickFile(file: ProjectFile) {
    setSelectedPath(file.path);
    setDraftPath(file.path);
    setDraftContent(file.content);
  }

  function newFile() {
    setSelectedPath("");
    setDraftPath("");
    setDraftContent("");
  }

  async function saveFile(event?: FormEvent) {
    event?.preventDefault();
    const path = draftPath.trim();
    if (!path || saving) return;

    setSaving(true);
    await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id, path, content: draftContent }),
    });
    setSelectedPath(path);
    await refreshData();
    refreshPreview();
    setSaving(false);
  }

  async function deleteSelectedFile() {
    if (!selectedPath || !confirm(`Delete ${selectedPath}?`)) return;
    await fetch(`/api/files?projectId=${id}&path=${encodeURIComponent(selectedPath)}`, {
      method: "DELETE",
    });
    newFile();
    await refreshData();
    refreshPreview();
  }

  if (notFound) {
    return (
      <div className="page-loader">
        <div className="empty" style={{ border: 0 }}>
          <div>
            <p>This project doesn&apos;t exist or isn&apos;t yours.</p>
            <Link className="btn" href="/" style={{ marginTop: 12 }}>
              Back to your apps
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return <PageLoader />;
  }

  const modelLabel = (modelId: string) =>
    project.ai.models.find((model) => model.id === modelId)?.name ?? modelId;

  return (
    <div className="ws">
      <header className="ws-topbar">
        <Link className="btn-icon" href="/" title="Your apps">
          <ArrowLeft size={16} />
        </Link>
        <BrandLogo size="sm" showSubtitle={false} href="/" />
        <span className="ws-divider" aria-hidden />
        <span className="ws-title">{project.name}</span>
        <span className="ws-spacer" />
        <ModelSelect
          models={project.ai.models}
          onChange={(model) => void changeModel(model)}
          title="Model"
          value={project.model}
        />
        <button
          className="btn-icon"
          onClick={() => {
            setApiKeyDraft("");
            setSettingsOpen(true);
          }}
          title="OpenRouter settings"
        >
          <Settings2 size={15} />
        </button>
        <button className="btn-ghost" onClick={() => setShareOpen(true)}>
          <Share2 size={14} />
          Share
        </button>
        <a className="btn-ghost" href={`/p/${id}`} target="_blank" rel="noreferrer" title="Open the app fullscreen">
          <ExternalLink size={14} />
          Open
        </a>
        <UserButton />
      </header>

      <div className="ws-body" style={{ gridTemplateColumns: `${chatWidth}px 4px minmax(0, 1fr)` }}>
        <section className="chat-col">
          <div className="messages">
            {messages.length === 0 && !streamChat && !loading && (
              <div className="empty" style={{ border: 0, minHeight: 120 }}>
                Describe what to build, or what to change.
              </div>
            )}
            {messages.map((message) =>
              message.role === "user" ? (
                <UserMessage
                  content={message.content}
                  disabled={loading}
                  key={message.id}
                  onEdit={() => void editMessage(message.id, message.content)}
                  onRedo={() => void redoMessage(message.id, message.content)}
                />
              ) : (
                <AssistantMessage content={message.content} key={message.id} />
              )
            )}
            {loading && (
              <AssistantMessage
                buildEvents={buildEvents}
                content={streamChat}
                phase={streamPhase}
                streaming={streamPhase === "planning"}
              />
            )}
            <div ref={bottomRef} />
          </div>

          {chatError && (
            <div className="chat-error" role="alert">
              {chatError}
            </div>
          )}

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <div className="composer-box">
              {attachments.length > 0 && (
                <div className="composer-attachments">
                  {attachments.map((file) => (
                    <span className="upload-attachment" key={file.id}>
                      <Paperclip size={11} />
                      {file.name}
                      <button
                        className="upload-attachment-remove"
                        onClick={() =>
                          setAttachments((current) => current.filter((item) => item.id !== file.id))
                        }
                        title="Remove attachment"
                        type="button"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Add a dark mode toggle, add a database for todos..."
              />
              <div className="composer-foot">
                <div className="composer-tools">
                  <input
                    ref={fileInputRef}
                    className="composer-file-input"
                    type="file"
                    multiple
                    onChange={(event) => void addUploadedFiles(event.target.files)}
                  />
                  <button
                    className="btn-icon"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload files"
                    type="button"
                  >
                    <Paperclip size={14} />
                  </button>
                </div>
                <button
                  className="btn"
                  type="submit"
                  disabled={loading || (!input.trim() && attachments.length === 0)}
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="chip-spinner" />
                      {streamPhase === "building" ? "Building…" : "Thinking…"}
                    </>
                  ) : (
                    <>
                      Send
                      <ArrowUp size={14} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </section>

        <div
          className="ws-resizer"
          onMouseDown={() => {
            resizingRef.current = true;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat panel"
        />

        <section className="view-col">
          <div className="tabbar">
            <button className={`tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>
              <Eye size={13} />
              Preview
            </button>
            <button className={`tab ${tab === "code" ? "active" : ""}`} onClick={() => setTab("code")}>
              <Code2 size={13} />
              Code
            </button>
            <button className={`tab ${tab === "data" ? "active" : ""}`} onClick={() => setTab("data")}>
              <Database size={13} />
              Data
            </button>
            <span className="ws-spacer" />
            <button className="btn-icon" onClick={refreshPreview} title="Reload preview">
              <RotateCw size={14} />
            </button>
          </div>

          <div className="view-main">
            {tab === "preview" ? (
              <iframe
                key={previewKey}
                className="preview-frame"
                title="App preview"
                src={`/p/${id}?v=${previewKey}`}
                sandbox="allow-scripts allow-forms allow-popups allow-modals"
              />
            ) : tab === "code" ? (
              <div className="code-layout">
                <div className="file-list">
                  <button className="file-row" onClick={newFile} title="New file">
                    <FilePlus2 size={13} />
                    <span>new file</span>
                  </button>
                  {files.map((file) => (
                    <button
                      className={`file-row ${selectedPath === file.path ? "active" : ""}`}
                      key={file.id}
                      onClick={() => pickFile(file)}
                    >
                      <FileCode size={13} />
                      <span>{file.path}</span>
                    </button>
                  ))}
                </div>
                <form className="editor" onSubmit={saveFile}>
                  <div className="editor-head">
                    <input
                      className="input"
                      value={draftPath}
                      onChange={(event) => setDraftPath(event.target.value)}
                      placeholder="index.html"
                    />
                    <button className="btn-ghost" type="submit" disabled={saving || !draftPath.trim()}>
                      <Save size={13} />
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="btn-icon btn-danger"
                      type="button"
                      onClick={deleteSelectedFile}
                      disabled={!selectedPath}
                      title="Delete file"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <textarea
                    className="code-view"
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    spellCheck={false}
                    placeholder="File contents…"
                  />
                </form>
              </div>
            ) : (
              <DataAdminPanel projectId={id} files={files} onChanged={refreshPreview} />
            )}
          </div>

          <div className="console">
            <div className="console-head">
              <button
                className="btn-icon"
                style={{ width: 22, minHeight: 22 }}
                onClick={() => setConsoleOpen((open) => !open)}
                title={consoleOpen ? "Collapse console" : "Expand console"}
              >
                {consoleOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
              <span>Console</span>
              <span className={`count ${errorCount > 0 ? "has-errors" : ""}`}>
                {errorCount > 0 ? errorCount : consoleEntries.length}
              </span>
              <span className="ws-spacer" />
              {errorCount > 0 && (
                <button className="btn-ghost" style={{ minHeight: 24, fontSize: 12 }} onClick={fixErrors} disabled={loading}>
                  <Wrench size={12} />
                  Fix {errorCount} {errorCount === 1 ? "error" : "errors"} with AI
                </button>
              )}
              {consoleEntries.length > 0 && (
                <button
                  className="btn-icon"
                  style={{ width: 24, minHeight: 24 }}
                  onClick={() => setConsoleEntries([])}
                  title="Clear console"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            {consoleOpen && (
              <div className="console-body">
                {consoleEntries.length === 0 ? (
                  <div className="console-empty">Console output from the preview shows up here.</div>
                ) : (
                  consoleEntries.map((entry) => (
                    <div className={`console-line ${entry.level}`} key={entry.id}>
                      {entry.text}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {shareOpen && (
        <ShareDialog
          projectId={id}
          visibility={project.visibility}
          sharedEmails={project.shared_emails}
          onClose={() => setShareOpen(false)}
          onSaved={(visibility, sharedEmails) => {
            setProject({ ...project, visibility, shared_emails: sharedEmails });
            setShareOpen(false);
          }}
        />
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>OpenRouter settings</h2>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Without your own key, you can use the free auto router or pick any free model from OpenRouter.
              Add a project API key to unlock paid models, Auto (smart routing), and custom model IDs.
            </p>
            <div>
              <label className="label" htmlFor="api-key">
                <KeyRound size={12} style={{ display: "inline", marginRight: 6 }} />
                Project API key
              </label>
              <input
                id="api-key"
                className="input mono"
                type="password"
                placeholder={project.ai.hasProjectKey ? "Key saved — paste new to replace" : "sk-or-..."}
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
              />
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Current model: {modelLabel(project.model)}
            </p>
            {project.ai.hasProjectKey && (
              <div>
                <label className="label" htmlFor="custom-model">
                  Custom model ID (optional)
                </label>
                <div className="share-link-row">
                  <input
                    id="custom-model"
                    className="input mono"
                    placeholder="provider/model-name"
                    value={customModel}
                    onChange={(event) => setCustomModel(event.target.value)}
                  />
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={() => customModel.trim() && changeModel(customModel.trim())}
                  >
                    Use
                  </button>
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {project.ai.hasProjectKey && (
                <button className="btn-ghost btn-danger" type="button" onClick={() => void saveApiKey(true)}>
                  Remove key
                </button>
              )}
              <button className="btn-ghost" type="button" onClick={() => setSettingsOpen(false)}>
                Cancel
              </button>
              <button className="btn" type="button" onClick={() => void saveApiKey()} disabled={!apiKeyDraft.trim()}>
                Save key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
