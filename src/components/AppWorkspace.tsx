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
  ExternalLink,
  FileCode,
  FilePlus2,
  Eye,
  RotateCw,
  Save,
  Share2,
  Trash2,
  Wrench,
} from "lucide-react";
import ShareDialog from "./ShareDialog";

type Message = { id: string; role: string; content: string };
type ProjectFile = { id: string; path: string; content: string };
type Project = {
  id: string;
  name: string;
  description: string;
  model: string;
  visibility: string;
  shared_emails: string;
};
type ConsoleEntry = { id: number; level: string; text: string };

const MODELS = [
  "openrouter/owl-alpha",
  "anthropic/claude-sonnet-4.5",
  "openai/gpt-5.1",
  "google/gemini-2.5-flash",
  "x-ai/grok-code-fast-1",
];

const FILE_OP_REGEX = /```file_operation\s*([\s\S]*?)```/g;

/** Splits an assistant message into prose + the file paths it changed. */
function parseAssistantMessage(content: string) {
  const paths: string[] = [];
  let text = content.replace(FILE_OP_REGEX, (_match, body: string) => {
    try {
      const ops = JSON.parse(body.trim());
      for (const op of Array.isArray(ops) ? ops : [ops]) {
        if (op?.path) paths.push(`${op.action === "delete" ? "deleted " : ""}${op.path}`);
      }
    } catch {}
    return "";
  });

  // An unterminated block means files are still being written (streaming).
  let working = false;
  const open = text.indexOf("```file_operation");
  if (open !== -1) {
    text = text.slice(0, open);
    working = true;
  }

  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), paths, working };
}

function AssistantMessage({ content, streaming }: { content: string; streaming?: boolean }) {
  const { text, paths, working } = useMemo(() => parseAssistantMessage(content), [content]);
  return (
    <div className="msg">
      <span className="msg-role">Builder</span>
      {text && <div className="msg-body">{text}</div>}
      {(paths.length > 0 || working) && (
        <div className="chips">
          {paths.map((path) => (
            <span className="chip" key={path}>
              <FileCode size={11} />
              {path}
            </span>
          ))}
          {working && <span className="chip working">writing files…</span>}
        </div>
      )}
      {streaming && !text && !working && paths.length === 0 && (
        <span className="thinking">
          <i /> <i /> <i />
        </span>
      )}
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
  const [streamText, setStreamText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [previewKey, setPreviewKey] = useState(0);
  const [selectedPath, setSelectedPath] = useState("");
  const [draftPath, setDraftPath] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [saving, setSaving] = useState(false);

  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const didSendStarter = useRef(false);
  const didLoad = useRef(false);
  const loadingRef = useRef(false);

  const errorCount = useMemo(
    () => consoleEntries.filter((entry) => entry.level === "error").length,
    [consoleEntries]
  );

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
    // Guard against StrictMode double-invocation clobbering optimistic chat state.
    if (didLoad.current) return;
    didLoad.current = true;
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamText]);

  // Capture console output forwarded by the preview iframe runtime.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || data.__aistudio !== true || data.type !== "console") return;
      setConsoleEntries((current) => [
        ...current.slice(-199),
        { id: ++consoleId, level: String(data.level), text: String(data.text) },
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

  const sendMessage = useCallback(
    async (forcedContent?: string) => {
      const content = (forcedContent ?? input).trim();
      if (!content || loadingRef.current) return;

      loadingRef.current = true;
      setInput("");
      setLoading(true);
      setStreamText("");
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", content },
      ]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: id, content }),
        });

        if (!response.ok || !response.body) {
          throw new Error(await response.text());
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
          setStreamText(fullText);
        }

        setStreamText("");
        await refreshData();
        refreshPreview();
        setTab("preview");
      } catch (error) {
        setStreamText("");
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Something went wrong: ${error instanceof Error ? error.message : "request failed"}`,
          },
        ]);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [id, input, refreshPreview]
  );

  // Kick off the starter prompt from the home page exactly once.
  useEffect(() => {
    const starter = searchParams.get("prompt");
    if (!starter || !loaded || didSendStarter.current || messages.length > 0) return;
    didSendStarter.current = true;
    window.history.replaceState(null, "", `/projects/${id}`);
    void sendMessage(starter);
  }, [loaded, messages.length, searchParams, id, sendMessage]);

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
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
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
      <div className="ws" style={{ placeItems: "center", display: "grid" }}>
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
    return (
      <div className="ws" style={{ placeItems: "center", display: "grid" }}>
        <span className="thinking">
          <i /> <i /> <i />
        </span>
      </div>
    );
  }

  return (
    <div className="ws">
      <header className="ws-topbar">
        <Link className="btn-icon" href="/" title="Your apps">
          <ArrowLeft size={16} />
        </Link>
        <span className="ws-title">{project.name}</span>
        <span className="ws-spacer" />
        <select
          className="select"
          value={project.model || MODELS[0]}
          onChange={(event) => changeModel(event.target.value)}
          title="Model"
        >
          {MODELS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
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

      <div className="ws-body">
        <section className="chat-col">
          <div className="messages">
            {messages.length === 0 && !streamText && !loading && (
              <div className="empty" style={{ border: 0, minHeight: 120 }}>
                Describe what to build, or what to change.
              </div>
            )}
            {messages.map((message) =>
              message.role === "user" ? (
                <div className="msg user" key={message.id}>
                  <span className="msg-role">You</span>
                  <div className="msg-body">{message.content}</div>
                </div>
              ) : (
                <AssistantMessage content={message.content} key={message.id} />
              )
            )}
            {loading && <AssistantMessage content={streamText} streaming />}
            <div ref={bottomRef} />
          </div>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <div className="composer-box">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Add a dark mode toggle, fix the layout on mobile..."
              />
              <div className="composer-foot">
                <span className="muted" style={{ fontSize: 12 }}>
                  {files.length} {files.length === 1 ? "file" : "files"}
                </span>
                <button className="btn" type="submit" disabled={loading || !input.trim()}>
                  {loading ? "Working…" : "Send"}
                  <ArrowUp size={14} />
                </button>
              </div>
            </div>
          </form>
        </section>

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
            ) : (
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
    </div>
  );
}
