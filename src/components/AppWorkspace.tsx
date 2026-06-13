"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  ArrowLeft,
  Code2,
  Crosshair,
  Database,
  Download,
  ExternalLink,
  Eye,
  History,
  Monitor,
  RotateCw,
  Settings2,
  Share2,
  Smartphone,
  Tablet,
} from "lucide-react";
import ShareDialog from "./ShareDialog";
import ConfirmDialog from "./ConfirmDialog";
import PageLoader from "./PageLoader";
import BrandLogo from "./BrandLogo";
import ModelSelect from "./ModelSelect";
import Composer from "./workspace/Composer";
import CodePanel from "./workspace/CodePanel";
import ConsoleDock from "./workspace/ConsoleDock";
import DataPanel from "./workspace/DataPanel";
import HistoryDialog from "./workspace/HistoryDialog";
import PreviewPane from "./workspace/PreviewPane";
import SettingsDialog from "./workspace/SettingsDialog";
import { AssistantMessage, UserMessage } from "./workspace/Messages";
import { useBuildRun } from "./workspace/useBuildRun";
import {
  describeInspectTarget,
  type BuildRunSnapshot,
  type ConsoleEntry,
  type InspectTarget,
  type Message,
  type PreviewDevice,
  type ProjectFile,
  type UploadedAttachment,
  type WorkspaceProject,
} from "./workspace/types";
import { shouldCaptureConsole } from "@/lib/console-filter";
import type { BuildFileStatus } from "@/lib/build-stream-client";

const MAX_ATTACHMENT_BYTES = 512_000;

let consoleId = 0;

function readUploadedFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    if (file.type.startsWith("image/")) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

export default function AppWorkspace() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [chatError, setChatError] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);

  const [tab, setTab] = useState<"preview" | "code" | "data">("preview");
  const [previewKey, setPreviewKey] = useState(0);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [inspectActive, setInspectActive] = useState(false);
  const [inspectTarget, setInspectTarget] = useState<InspectTarget | null>(null);

  const [selectedPath, setSelectedPath] = useState("");
  const [draftPath, setDraftPath] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [saving, setSaving] = useState(false);

  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteFileOpen, setDeleteFileOpen] = useState(false);
  const [deleteFileLoading, setDeleteFileLoading] = useState(false);
  const [deleteFileError, setDeleteFileError] = useState("");

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [chatWidth, setChatWidth] = useState(400);
  const chatWidthRef = useRef(400);
  const resizingRef = useRef(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const didSendStarter = useRef(false);
  const didBootstrap = useRef(false);
  const didLoad = useRef(false);
  const sendMessageRef = useRef<(content?: string, options?: { skipUserInsert?: boolean }) => Promise<void>>(
    async () => {}
  );
  const startFollowingRef = useRef<(runId: string) => Promise<void>>(async () => {});
  const buildFocusPathRef = useRef<string | null>(null);
  /** Set when the user manually picks a file during a build; stops auto-follow. */
  const editorUserPathRef = useRef<string | null>(null);
  const prevEventStatusRef = useRef<Map<string, string>>(new Map());
  const inspectActiveRef = useRef(false);

  const refreshPreview = useCallback(() => {
    setConsoleEntries([]);
    setPreviewKey((key) => key + 1);
  }, []);

  const refreshData = useCallback(async () => {
    const [messagesResponse, filesResponse] = await Promise.all([
      fetch(`/api/messages?projectId=${id}`),
      fetch(`/api/files?projectId=${id}`),
    ]);
    setMessages(await messagesResponse.json());
    setFiles(await filesResponse.json());
  }, [id]);

  const upsertFileContent = useCallback((path: string, content: string) => {
    setFiles((current) => {
      const index = current.findIndex((file) => file.path === path);
      if (index >= 0) {
        const next = [...current];
        next[index] = { ...next[index], content };
        return next;
      }
      return [...current, { id: path, path, content }].sort((a, b) =>
        a.path.localeCompare(b.path)
      );
    });
  }, []);

  const showFileInEditor = useCallback(
    (path: string, content: string) => {
      setTab("code");
      setSelectedPath(path);
      setDraftPath(path);
      setDraftContent(content);
      upsertFileContent(path, content);
    },
    [upsertFileContent]
  );

  const syncRunEventsToEditor = useCallback(
    async (events: BuildFileStatus[]) => {
      const focus = buildFocusPathRef.current;
      const userPath = editorUserPathRef.current;
      let target: BuildFileStatus | undefined;

      if (focus) {
        target = events.find((event) => event.path === focus && event.status !== "deleted");
      }

      if (!target) {
        target =
          [...events]
            .reverse()
            .find((event) => event.status === "start" && event.draft !== undefined) ??
          [...events]
            .reverse()
            .find((event) => {
              const prev = prevEventStatusRef.current.get(event.path);
              return event.status === "done" && prev !== "done";
            }) ??
          [...events].reverse().find((event) => event.status === "start");
      }

      if (!target || target.status === "deleted") return;

      const applyContent = (path: string, content: string, navigate: boolean) => {
        if (navigate) {
          showFileInEditor(path, content);
          return;
        }
        upsertFileContent(path, content);
        if (userPath === path) {
          setDraftContent(content);
        }
      };

      const shouldNavigate = !userPath || !!focus;

      if (target.draft !== undefined) {
        applyContent(target.path, target.draft, shouldNavigate);
        return;
      }

      if (target.status === "done") {
        const response = await fetch(`/api/files?projectId=${id}`);
        if (!response.ok) return;
        const allFiles = (await response.json()) as ProjectFile[];
        setFiles(allFiles);
        const match = allFiles.find((file) => file.path === target.path);
        if (match) applyContent(match.path, match.content, shouldNavigate);
      }
    },
    [id, showFileInEditor, upsertFileContent]
  );

  const {
    loading,
    streamChat,
    buildEvents,
    streamPhase,
    beginSend,
    failSend,
    followRun,
    stopRun,
    isBusy,
  } = useBuildRun({
    onSnapshot: async (run: BuildRunSnapshot) => {
      if (run.phase === "building" && run.events.length > 0) {
        await syncRunEventsToEditor(run.events);
      }
      for (const event of run.events) {
        prevEventStatusRef.current.set(event.path, event.status);
      }
    },
    onFinished: async () => {
      buildFocusPathRef.current = null;
      editorUserPathRef.current = null;
      prevEventStatusRef.current = new Map();
      await refreshData();
      refreshPreview();
      setSelectedPath("");
      setDraftPath("");
      setDraftContent("");
      setTab("preview");
    },
    onErrorChange: setChatError,
  });

  const startFollowing = useCallback(
    async (runId: string) => {
      buildFocusPathRef.current = null;
      editorUserPathRef.current = null;
      prevEventStatusRef.current = new Map();
      await followRun(runId);
    },
    [followRun]
  );

  // ---- persisted chat panel width + drag resizing ----

  useEffect(() => {
    // One-time client hydration of a UI preference; a lazy initializer would
    // mismatch the server-rendered width.
    const stored = localStorage.getItem("aistudio:chat-width");
    if (stored) {
      const parsed = Number(stored);
      if (parsed >= 300 && parsed <= 800) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // ---- initial load ----

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

  // ---- preview messages: console forwarding + inspect selections ----

  /** Single source of truth for inspect mode: state + ref + iframe runtime. */
  const setInspect = useCallback((enabled: boolean) => {
    inspectActiveRef.current = enabled;
    setInspectActive(enabled);
    iframeRef.current?.contentWindow?.postMessage(
      { __aistudio: true, type: "inspect", enabled },
      "*"
    );
  }, []);

  const toggleInspect = useCallback(() => {
    setInspect(!inspectActiveRef.current);
  }, [setInspect]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || data.__aistudio !== true) return;

      if (data.type === "console") {
        const text = String(data.text);
        if (!shouldCaptureConsole(text)) return;
        setConsoleEntries((current) => [
          ...current.slice(-199),
          { id: ++consoleId, level: String(data.level), text },
        ]);
        if (data.level === "error") setConsoleOpen(true);
        return;
      }

      if (data.type === "inspected" && data.target) {
        const target = data.target as InspectTarget;
        setInspectTarget({
          component: target.component ?? null,
          tag: String(target.tag ?? ""),
          id: String(target.id ?? ""),
          classes: String(target.classes ?? ""),
          text: String(target.text ?? ""),
        });
        setInspect(false);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setInspect]);

  // ---- chat ----

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
  }

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
      let content = (forcedContent ?? input).trim();
      if ((!content && attachments.length === 0) || isBusy()) return;

      // Organic sends carry the inspect-mode element selection as context.
      if (!forcedContent && inspectTarget && content) {
        content = `${content}\n\n(Selected element: ${describeInspectTarget(inspectTarget, files)})`;
      }

      const outgoingAttachments = attachments.map(({ name, content: fileContent }) => ({
        name,
        content: fileContent,
      }));

      beginSend();
      setChatError("");
      if (!options?.skipUserInsert) {
        setInput("");
        setAttachments([]);
        setInspectTarget(null);
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
        await startFollowing(runId);
      } catch (error) {
        failSend(error instanceof Error ? error.message : "Request failed");
      }
    },
    [id, input, attachments, files, inspectTarget, beginSend, failSend, isBusy, startFollowing]
  );

  sendMessageRef.current = sendMessage;
  startFollowingRef.current = startFollowing;

  async function editMessage(messageId: string, content: string) {
    if (isBusy()) return;
    await truncateMessages(messageId, true);
    setInput(content);
  }

  async function redoMessage(messageId: string, content: string) {
    if (isBusy()) return;
    await truncateMessages(messageId, false);
    void sendMessage(content, { skipUserInsert: true });
  }

  // Adopt an in-flight run (page reload mid-build) or fire the starter prompt — once per project load.
  useEffect(() => {
    didBootstrap.current = false;
    didSendStarter.current = false;
  }, [id]);

  useEffect(() => {
    if (!loaded || didBootstrap.current) return;
    didBootstrap.current = true;

    const controller = new AbortController();

    void (async () => {
      let resumedRun = false;
      try {
        const activeResponse = await fetch(
          `/api/build-runs?projectId=${encodeURIComponent(id)}`,
          { signal: controller.signal }
        );
        if (activeResponse.ok) {
          const activeRun = (await activeResponse.json()) as BuildRunSnapshot | null;
          if (activeRun?.status === "running" && !isBusy()) {
            didSendStarter.current = true;
            window.history.replaceState(null, "", `/projects/${id}`);
            await startFollowingRef.current(activeRun.id);
            resumedRun = true;
          }
        }
      } catch {
        if (controller.signal.aborted) return;
      }

      if (resumedRun) return;

      const starter = searchParams.get("prompt");
      if (!starter || didSendStarter.current || messages.length > 0) return;
      didSendStarter.current = true;
      window.history.replaceState(null, "", `/projects/${id}`);
      void sendMessageRef.current(starter);
    })();

    return () => controller.abort();
  }, [loaded, id, isBusy, searchParams]);

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

  // ---- project settings ----

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

  async function saveApiKey(key: string | null) {
    const response = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openrouter_api_key: key ?? "" }),
    });
    if (!response.ok) {
      setChatError("Could not save API key");
      return;
    }
    setSettingsOpen(false);
    await load();
  }

  async function commitRename() {
    if (!project) return;
    const name = nameDraft.trim();
    setRenaming(false);
    if (!name || name === project.name) return;
    setProject({ ...project, name });
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.slice(0, 80) }),
    });
  }

  // ---- manual file editing ----

  function pickFile(file: ProjectFile) {
    if (isBusy()) {
      editorUserPathRef.current = file.path;
      buildFocusPathRef.current = null;
    }
    const live = buildEvents.find((event) => event.path === file.path);
    setSelectedPath(file.path);
    setDraftPath(file.path);
    setDraftContent(live?.draft ?? file.content);
  }

  function newFile() {
    setSelectedPath("");
    setDraftPath("");
    setDraftContent("");
  }

  async function saveFile(event?: { preventDefault?: () => void }) {
    event?.preventDefault?.();
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

  function requestDeleteFile() {
    if (!selectedPath) return;
    setDeleteFileError("");
    setDeleteFileOpen(true);
  }

  async function confirmDeleteFile() {
    if (!selectedPath || deleteFileLoading) return;

    setDeleteFileLoading(true);
    setDeleteFileError("");
    try {
      const response = await fetch(
        `/api/files?projectId=${id}&path=${encodeURIComponent(selectedPath)}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(detail || "Could not delete file");
      }
      newFile();
      await refreshData();
      refreshPreview();
      setDeleteFileOpen(false);
    } catch (error) {
      setDeleteFileError(error instanceof Error ? error.message : "Could not delete file");
    } finally {
      setDeleteFileLoading(false);
    }
  }

  async function openFileFromPath(path: string) {
    buildFocusPathRef.current = path;
    editorUserPathRef.current = null;
    const live = buildEvents.find((event) => event.path === path);
    if (live?.draft !== undefined) {
      showFileInEditor(path, live.draft);
      return;
    }
    const local = files.find((file) => file.path === path);
    if (local) {
      showFileInEditor(path, local.content);
      return;
    }
    const response = await fetch(`/api/files?projectId=${id}`);
    if (!response.ok) return;
    const allFiles = (await response.json()) as ProjectFile[];
    setFiles(allFiles);
    const match = allFiles.find((file) => file.path === path);
    if (match) showFileInEditor(path, match.content);
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

  return (
    <div className="ws">
      <header className="ws-topbar">
        <Link className="btn-icon" href="/" title="Your apps">
          <ArrowLeft size={16} />
        </Link>
        <BrandLogo size="sm" showSubtitle={false} href="/" />
        <span className="ws-divider" aria-hidden />
        {renaming ? (
          <input
            autoFocus
            className="input ws-title-input"
            value={nameDraft}
            onBlur={() => void commitRename()}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void commitRename();
              if (event.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <button
            className="ws-title ws-title-btn"
            onClick={() => {
              setNameDraft(project.name);
              setRenaming(true);
            }}
            title="Rename app"
            type="button"
          >
            {project.name}
          </button>
        )}
        <span className="ws-spacer" />
        <ModelSelect
          models={project.ai.models}
          onChange={(model) => void changeModel(model)}
          title="Model"
          value={project.model}
        />
        <button className="btn-icon" onClick={() => setHistoryOpen(true)} title="Version history">
          <History size={15} />
        </button>
        <a
          className="btn-icon"
          href={`/api/projects/${id}/export`}
          title="Download as a single HTML file"
        >
          <Download size={15} />
        </a>
        <button className="btn-icon" onClick={() => setSettingsOpen(true)} title="OpenRouter settings">
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
                <AssistantMessage
                  content={message.content}
                  key={message.id}
                  onFileClick={(path) => void openFileFromPath(path)}
                />
              )
            )}
            {loading && (
              <AssistantMessage
                buildEvents={buildEvents}
                content={streamChat}
                onFileClick={(path) => void openFileFromPath(path)}
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

          <Composer
            attachments={attachments}
            input={input}
            inspectTarget={inspectTarget}
            loading={loading}
            onClearInspectTarget={() => setInspectTarget(null)}
            onInputChange={setInput}
            onPickFiles={(list) => void addUploadedFiles(list)}
            onRemoveAttachment={(attachmentId) =>
              setAttachments((current) => current.filter((item) => item.id !== attachmentId))
            }
            onSend={() => void sendMessage()}
            onStop={() => void stopRun()}
            streamPhase={streamPhase}
          />
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
            {tab === "preview" && (
              <>
                <button
                  className={`btn-icon ${inspectActive ? "on" : ""}`}
                  onClick={toggleInspect}
                  title={inspectActive ? "Cancel element selection" : "Select an element to edit"}
                >
                  <Crosshair size={14} />
                </button>
                <span className="ws-divider" aria-hidden />
                <button
                  className={`btn-icon ${device === "desktop" ? "on" : ""}`}
                  onClick={() => setDevice("desktop")}
                  title="Desktop width"
                >
                  <Monitor size={14} />
                </button>
                <button
                  className={`btn-icon ${device === "tablet" ? "on" : ""}`}
                  onClick={() => setDevice("tablet")}
                  title="Tablet width (768px)"
                >
                  <Tablet size={14} />
                </button>
                <button
                  className={`btn-icon ${device === "phone" ? "on" : ""}`}
                  onClick={() => setDevice("phone")}
                  title="Phone width (390px)"
                >
                  <Smartphone size={14} />
                </button>
              </>
            )}
            <button className="btn-icon" onClick={refreshPreview} title="Reload preview">
              <RotateCw size={14} />
            </button>
          </div>

          <div className="view-main">
            {tab === "preview" ? (
              <PreviewPane
                device={device}
                iframeRef={iframeRef}
                onLoad={() => setInspect(inspectActiveRef.current)}
                previewKey={previewKey}
                projectId={id}
              />
            ) : tab === "code" ? (
              <CodePanel
                draftContent={draftContent}
                draftPath={draftPath}
                files={files}
                onDeleteSelected={requestDeleteFile}
                onDraftContentChange={setDraftContent}
                onDraftPathChange={setDraftPath}
                onNewFile={newFile}
                onPickFile={pickFile}
                onSave={(event) => void saveFile(event)}
                saving={saving}
                selectedPath={selectedPath}
              />
            ) : (
              <DataPanel projectId={id} files={files} onChanged={refreshPreview} />
            )}
          </div>

          <ConsoleDock
            entries={consoleEntries}
            fixDisabled={loading}
            onClear={() => setConsoleEntries([])}
            onFixErrors={fixErrors}
            onToggle={() => setConsoleOpen((open) => !open)}
            open={consoleOpen}
          />
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
        <SettingsDialog
          project={project}
          onClose={() => setSettingsOpen(false)}
          onSaveKey={saveApiKey}
          onUseCustomModel={(model) => void changeModel(model)}
        />
      )}

      {historyOpen && (
        <HistoryDialog
          busy={loading}
          onClose={() => setHistoryOpen(false)}
          onRestored={async () => {
            setHistoryOpen(false);
            await refreshData();
            refreshPreview();
          }}
          projectId={id}
        />
      )}

      {deleteFileOpen && selectedPath && (
        <ConfirmDialog
          cancelLabel="Keep file"
          confirmLabel="Delete file"
          description={
            <>
              <strong>{selectedPath}</strong> will be removed from this app. This cannot be undone.
            </>
          }
          destructive
          error={deleteFileError}
          loading={deleteFileLoading}
          onClose={() => {
            if (deleteFileLoading) return;
            setDeleteFileOpen(false);
            setDeleteFileError("");
          }}
          onConfirm={confirmDeleteFile}
          title="Delete this file?"
        />
      )}
    </div>
  );
}
