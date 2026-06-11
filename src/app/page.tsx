"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Show, SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { ArrowUp, Globe, Link2, Trash2 } from "lucide-react";

type Project = {
  id: string;
  name: string;
  description: string;
  visibility: string;
  updated_at: number;
};

function nameFromPrompt(prompt: string) {
  const words = prompt.replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
  return (words.length > 48 ? `${words.slice(0, 48)}…` : words) || "Untitled app";
}

function timeAgo(unix: number) {
  const seconds = Math.max(1, Math.floor(Date.now() / 1000 - unix));
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function Home() {
  const router = useRouter();
  const { isSignedIn } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : []))
      .then(setProjects)
      .finally(() => setLoading(false));
  }, [isSignedIn]);

  async function createProject(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || creating) return;

    setCreating(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameFromPrompt(trimmed), description: trimmed.slice(0, 180) }),
      });
      if (!response.ok) throw new Error(await response.text());
      const project = await response.json();
      router.push(`/projects/${project.id}?prompt=${encodeURIComponent(trimmed)}`);
    } catch {
      setCreating(false);
    }
  }

  async function deleteProject(id: string) {
    if (!confirm("Delete this app, including its chat and files?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((current) => current.filter((project) => project.id !== id));
  }

  return (
    <div className="home">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">ai</span>
          aistudio
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="btn">Sign in</button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>

      <Show when="signed-out">
        <main className="home-main">
          <div className="hero-signin">
            <div>
              <h1 className="home-title">Chat apps into existence.</h1>
              <p className="home-sub">
                Describe an app, watch it build itself, then share it with a link.
                AI included — apps you make can use AI too, no keys needed.
              </p>
            </div>
            <SignInButton mode="modal">
              <button className="btn" style={{ minHeight: 38, padding: "0 18px" }}>
                Get started
              </button>
            </SignInButton>
          </div>
        </main>
      </Show>

      <Show when="signed-in">
        <main className="home-main">
          <h1 className="home-title">What should we build?</h1>
          <p className="home-sub">Describe the app. You can refine it in chat afterwards.</p>

          <form className="prompt-card" onSubmit={createProject}>
            <textarea
              value={prompt}
              autoFocus
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void createProject();
                }
              }}
              placeholder="A flashcard trainer that uses AI to generate cards from any topic I type in..."
            />
            <div className="prompt-card-foot">
              <span className="muted" style={{ fontSize: 12 }}>
                Enter to create · Shift+Enter for newline
              </span>
              <button className="btn" type="submit" disabled={creating || !prompt.trim()}>
                {creating ? "Creating…" : "Build"}
                <ArrowUp size={14} />
              </button>
            </div>
          </form>

          <div className="section-head">
            <h2>Your apps</h2>
            {projects.length > 0 && <span className="muted">{projects.length}</span>}
          </div>

          {loading ? (
            <div className="empty">Loading…</div>
          ) : projects.length === 0 ? (
            <div className="empty">No apps yet. Describe one above to get started.</div>
          ) : (
            <div className="project-grid">
              {projects.map((project) => (
                <div
                  className="project-card"
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/projects/${project.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") router.push(`/projects/${project.id}`);
                  }}
                >
                  <h3>{project.name}</h3>
                  <p className="desc">{project.description || "No description."}</p>
                  <div className="card-foot">
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {timeAgo(project.updated_at)}
                      {project.visibility === "public" && (
                        <span className="badge public">
                          <Globe size={10} /> public
                        </span>
                      )}
                    </span>
                    <span className="actions" onClick={(event) => event.stopPropagation()}>
                      <a
                        className="btn-icon"
                        href={`/p/${project.id}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Open app"
                      >
                        <Link2 size={14} />
                      </a>
                      <button
                        className="btn-icon btn-danger"
                        onClick={() => deleteProject(project.id)}
                        title="Delete app"
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </Show>
    </div>
  );
}
