"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Show, SignInButton, UserButton, useClerk, useUser } from "@clerk/nextjs";
import { ArrowUp, Globe, Link2, Trash2 } from "lucide-react";
import { stashPendingPrompt, takePendingModel, takePendingPrompt } from "@/lib/pending-prompt";
import BrandLogo from "@/components/BrandLogo";
import ModelSelect from "@/components/ModelSelect";

type Project = {
  id: string;
  name: string;
  description: string;
  visibility: string;
  updated_at: number;
};

type ModelOption = { id: string; name: string; free: boolean };

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
  const { openSignIn } = useClerk();
  const { isSignedIn, isLoaded } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [creating, setCreating] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("openrouter/free");
  const pendingHandled = useRef(false);

  useEffect(() => {
    fetch("/api/models")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload?.models?.length) return;
        setModels(payload.models);
        setSelectedModel(payload.defaultModel ?? payload.models[0].id);
      })
      .catch(() => {});
  }, []);

  const createProject = useCallback(
    async (rawPrompt: string, model = selectedModel) => {
      const trimmed = rawPrompt.trim();
      if (!trimmed) return false;

      setCreating(true);
      try {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: nameFromPrompt(trimmed),
            description: trimmed.slice(0, 180),
            model,
          }),
        });
        if (!response.ok) throw new Error(await response.text());
        const project = await response.json();
        router.push(`/projects/${project.id}?prompt=${encodeURIComponent(trimmed)}`);
        return true;
      } catch {
        setCreating(false);
        return false;
      }
    },
    [router, selectedModel]
  );

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setLoadingProjects(false);
      return;
    }

    if (pendingHandled.current) return;

    const pending = takePendingPrompt();
    if (pending) {
      pendingHandled.current = true;
      const pendingModel = takePendingModel();
      setPrompt(pending);
      if (pendingModel) setSelectedModel(pendingModel);
      void createProject(pending, pendingModel || selectedModel);
      return;
    }

    setLoadingProjects(true);
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : []))
      .then(setProjects)
      .finally(() => setLoadingProjects(false));
  }, [isLoaded, isSignedIn, createProject, selectedModel]);

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || creating) return;

    if (!isSignedIn) {
      stashPendingPrompt(trimmed, selectedModel);
      openSignIn({});
      return;
    }

    await createProject(trimmed, selectedModel);
  }

  async function deleteProject(id: string) {
    if (!confirm("Delete this app, including its chat and files?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((current) => current.filter((project) => project.id !== id));
  }

  return (
    <div className="home">
      <header className="topbar">
        <BrandLogo size="sm" href="/" />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="btn-ghost">Sign in</button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>

      <main className="home-main">
        <h1 className="home-title">Chat apps into existence.</h1>
        <p className="home-sub">
          Describe an app, watch it build itself, then share it with a link.
          AI included — apps you make can use AI too.
        </p>

        <form className="prompt-card" onSubmit={onSubmit}>
          <textarea
            value={prompt}
            autoFocus
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void onSubmit();
              }
            }}
            placeholder="A flashcard trainer that uses AI to generate cards from any topic I type in..."
          />
          <div className="prompt-card-foot">
            <ModelSelect
              disabled={creating || models.length === 0}
              models={
                models.length > 0
                  ? models
                  : [{ id: selectedModel, name: "Free (auto free models)", free: true }]
              }
              onChange={setSelectedModel}
              title="Builder model"
              value={selectedModel}
            />
            <button className="btn" type="submit" disabled={creating || !prompt.trim()}>
              {creating ? "Creating…" : "Build"}
              <ArrowUp size={14} />
            </button>
          </div>
        </form>

        {isSignedIn && !loadingProjects && projects.length > 0 && (
          <section className="apps-section" aria-label="Your apps">
            <div className="section-head">
              <h2>Your apps</h2>
              <span className="muted">{projects.length}</span>
            </div>

            <div className="project-grid">
              {projects.map((project, index) => (
                <div
                  className="project-card"
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "pointer", animationDelay: `${(index + 1) * 50}ms` }}
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
          </section>
        )}
      </main>

      <div className="home-accent-bar" aria-hidden />
    </div>
  );
}
