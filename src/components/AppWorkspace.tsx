"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Code2, Expand, FilePlus2, Home, Play, Save, Send, Trash2 } from "lucide-react";

type Message = { id: string; role: string; content: string };
type ProjectFile = { id: string; path: string; content: string };
type Project = { id: string; name: string; description: string; model: string };

type Props = {
  fullscreen?: boolean;
};

const newFileTemplate = `export default function Page() {
  return <main>Hello from aistudio</main>;
}
`;

export default function AppWorkspace({ fullscreen = false }: Props) {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [draftPath, setDraftPath] = useState("src/app/page.tsx");
  const [draftContent, setDraftContent] = useState(newFileTemplate);
  const [input, setInput] = useState("");
  const [streamText, setStreamText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const didSendStarter = useRef(false);

  const selectedFile = useMemo(
    () => files.find((file) => file.path === selectedPath) ?? null,
    [files, selectedPath]
  );

  const htmlFile = useMemo(
    () => files.find((file) => file.path.endsWith(".html")) ?? null,
    [files]
  );

  const load = useCallback(async () => {
    const [projectResponse, messagesResponse, filesResponse] = await Promise.all([
      fetch(`/api/projects/${id}`),
      fetch(`/api/messages?projectId=${id}`),
      fetch(`/api/files?projectId=${id}`),
    ]);

    if (!projectResponse.ok) return;

    const nextProject = await projectResponse.json();
    const nextMessages = await messagesResponse.json();
    const nextFiles = await filesResponse.json();

    setProject(nextProject);
    setMessages(nextMessages);
    setFiles(nextFiles);
    if (!selectedPath && nextFiles[0]) {
      setSelectedPath(nextFiles[0].path);
      setDraftPath(nextFiles[0].path);
      setDraftContent(nextFiles[0].content);
    }
  }, [id, selectedPath]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamText]);

  useEffect(() => {
    const starter = searchParams.get("prompt");
    if (!starter || didSendStarter.current || messages.length > 0) return;
    didSendStarter.current = true;
    void sendMessage(starter);
  }, [messages.length, searchParams]);

  useEffect(() => {
    if (!selectedFile) return;
    setDraftPath(selectedFile.path);
    setDraftContent(selectedFile.content);
  }, [selectedFile]);

  async function refreshFilesAndMessages() {
    const [messagesResponse, filesResponse] = await Promise.all([
      fetch(`/api/messages?projectId=${id}`),
      fetch(`/api/files?projectId=${id}`),
    ]);
    const nextMessages = await messagesResponse.json();
    const nextFiles = await filesResponse.json();
    setMessages(nextMessages);
    setFiles(nextFiles);
    if (!selectedPath && nextFiles[0]) setSelectedPath(nextFiles[0].path);
  }

  async function sendMessage(forcedContent?: string) {
    const content = (forcedContent ?? input).trim();
    if (!content || loading) return;

    setInput("");
    setLoading(true);
    setStreamText("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, content, model: project?.model }),
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
      await refreshFilesAndMessages();
    } catch (error) {
      setStreamText(`Error: ${error instanceof Error ? error.message : "Request failed"}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveFile(event?: FormEvent) {
    event?.preventDefault();
    if (!draftPath.trim() || saving) return;

    setSaving(true);
    await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id, path: draftPath.trim(), content: draftContent }),
    });
    await refreshFilesAndMessages();
    setSelectedPath(draftPath.trim());
    setSaving(false);
  }

  async function deleteSelectedFile() {
    if (!selectedPath || !confirm(`Delete ${selectedPath}?`)) return;

    await fetch(`/api/files?projectId=${id}&path=${encodeURIComponent(selectedPath)}`, {
      method: "DELETE",
    });
    setSelectedPath("");
    setDraftPath("src/app/page.tsx");
    setDraftContent(newFileTemplate);
    await refreshFilesAndMessages();
  }

  function pickFile(file: ProjectFile) {
    setSelectedPath(file.path);
    setDraftPath(file.path);
    setDraftContent(file.content);
  }

  const previewHtml = htmlFile?.content;

  if (!project) {
    return (
      <div className="workspace">
        <div className="empty-state">Loading workspace...</div>
      </div>
    );
  }

  return (
    <main className="workspace">
      <header className="workspace-topbar">
        <div className="brand">
          <Link className="icon-button" href="/" title="Projects">
            <Home size={17} />
          </Link>
          {!fullscreen && (
            <Link className="icon-button" href={`/projects/${id}/fullscreen`} title="Fullscreen">
              <Expand size={17} />
            </Link>
          )}
          {fullscreen && (
            <Link className="icon-button" href={`/projects/${id}`} title="IDE">
              <ArrowLeft size={17} />
            </Link>
          )}
          <div>
            <strong>{project.name}</strong>
            <span className="eyebrow" style={{ display: "block" }}>
              {project.description || "Chat, edit files, preview, repeat."}
            </span>
          </div>
        </div>
        <div className="split-actions">
          <span className="ghost-button" aria-label="Model">
            <Play size={15} />
            {project.model || "openrouter/owl-alpha"}
          </span>
        </div>
      </header>

      <section className="workspace-body">
        <aside className="pane">
          <div className="pane-head">
            <span className="pane-title">Files</span>
            <button
              className="icon-button"
              title="New file"
              onClick={() => {
                setSelectedPath("");
                setDraftPath("src/app/page.tsx");
                setDraftContent(newFileTemplate);
              }}
            >
              <FilePlus2 size={17} />
            </button>
          </div>
          <div className="file-list">
            {files.length === 0 ? (
              <p className="eyebrow">No files yet. Ask the builder to create the first version.</p>
            ) : (
              files.map((file) => (
                <button
                  className={`file-row ${selectedPath === file.path ? "active" : ""}`}
                  key={file.id}
                  onClick={() => pickFile(file)}
                >
                  <Code2 size={15} />
                  <span className="file-path">{file.path}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="chat-pane">
          <div className="pane-head">
            <span className="pane-title">Chat IDE</span>
            <span className="eyebrow">{files.length} files</span>
          </div>
          <div className="messages">
            {messages.length === 0 && !streamText && (
              <div className="empty-state">
                <div>
                  <strong>Tell it what to build.</strong>
                  <p style={{ marginTop: 8 }}>
                    Ask for full apps, focused edits, new files, or CRUD flows. File changes are saved automatically.
                  </p>
                </div>
              </div>
            )}
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <span className="message-label">{message.role === "user" ? "You" : "Builder"}</span>
                <div className="bubble">{message.content}</div>
              </article>
            ))}
            {streamText && (
              <article className="message">
                <span className="message-label">Builder</span>
                <div className="bubble">{streamText}</div>
              </article>
            )}
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
                placeholder="Build a clean habit tracker with add/edit/delete habits, streaks, filters, and responsive styling..."
              />
              <button className="button" type="submit" disabled={loading || !input.trim()}>
                <Send size={16} />
                {loading ? "Working" : "Send"}
              </button>
            </div>
          </form>
        </section>

        <aside className="preview-pane">
          <div className="pane-head">
            <span className="pane-title">View</span>
            <div className="split-actions">
              <button className="ghost-button" onClick={saveFile} disabled={saving || !draftPath.trim()}>
                <Save size={15} />
                {saving ? "Saving" : "Save"}
              </button>
              <button className="icon-button" onClick={deleteSelectedFile} disabled={!selectedPath} title="Delete file">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          <form onSubmit={saveFile} style={{ display: "grid", gridTemplateRows: "auto 1fr", minHeight: 0 }}>
            <input
              className="input"
              value={draftPath}
              onChange={(event) => setDraftPath(event.target.value)}
              placeholder="src/app/page.tsx"
              style={{ borderRadius: 0, borderLeft: 0, borderRight: 0, borderTop: 0 }}
            />
            {previewHtml ? (
              <div className="preview">
                <iframe title="Generated HTML preview" sandbox="allow-scripts" srcDoc={previewHtml} />
              </div>
            ) : (
              <textarea
                className="code-view"
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                spellCheck={false}
              />
            )}
          </form>
        </aside>
      </section>
    </main>
  );
}
