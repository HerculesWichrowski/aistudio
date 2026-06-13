"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Show, SignInButton, UserButton, useClerk, useUser } from "@clerk/nextjs";
import { ArrowUp, Copy, Globe, Link2, Sparkles, Trash2 } from "lucide-react";
import { stashPendingPrompt, takePendingModel, takePendingPrompt } from "@/lib/pending-prompt";
import BrandLogo from "@/components/BrandLogo";
import ConfirmDialog from "@/components/ConfirmDialog";
import ModelSelect from "@/components/ModelSelect";

type Project = {
  id: string;
  name: string;
  description: string;
  visibility: string;
  updated_at: number;
};

type ModelOption = { id: string; name: string; free: boolean };

const STARTERS: { label: string; prompt: string }[] = [
  {
    label: "AI flashcards",
    prompt:
      "A flashcard trainer where I type any topic and AI generates a deck of cards. Flip cards to reveal answers, mark them right or wrong, and store decks and progress in a database.",
  },
  {
    label: "Kanban board",
    prompt:
      "A kanban board with columns for todo, doing and done. Drag cards between columns, add labels and due dates, persist everything in a database.",
  },
  {
    label: "Expense tracker",
    prompt:
      "An expense tracker with categories, a monthly summary chart, and a database of expenses. Add an AI button that suggests how to cut spending based on my entries.",
  },
  {
    label: "Recipe box",
    prompt:
      "A recipe manager where AI generates a recipe from ingredients I have at home. Save favorites to a database and let me search and tag them.",
  },
  {
    label: "Quiz game",
    prompt:
      "A trivia quiz game where AI writes the questions for any category I pick. Keep score, show streaks, and store high scores in a database.",
  },
];

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
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
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

    // loadingProjects is reset by the fetch's finally — nothing to do here.
    if (!isSignedIn) return;

    if (pendingHandled.current) return;

    const pending = takePendingPrompt();
    if (pending) {
      pendingHandled.current = true;
      const pendingModel = takePendingModel();
      // Sign-in roundtrip handoff: restore the stashed prompt from
      // localStorage so the user sees what is being created.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  async function confirmDeleteProject() {
    if (!deleteTarget || deleteLoading) return;

    setDeleteLoading(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/projects/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(detail || "Could not delete app");
      }
      setProjects((current) => current.filter((project) => project.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete app");
    } finally {
      setDeleteLoading(false);
    }
  }

  function openDeleteDialog(project: Project) {
    setDeleteError("");
    setDeleteTarget(project);
  }

  async function duplicateProject(id: string) {
    const response = await fetch(`/api/projects/${id}/duplicate`, { method: "POST" });
    if (!response.ok) return;
    const created = (await response.json()) as { id: string };
    router.push(`/projects/${created.id}`);
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
              menuPlacement="up"
              models={
                models.length > 0
                  ? models
                  : [{ id: selectedModel, name: "Auto", free: true }]
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

        <div className="starter-row" aria-label="Starter ideas">
          {STARTERS.map((starter) => (
            <button
              className="starter-chip"
              disabled={creating}
              key={starter.label}
              onClick={() => setPrompt(starter.prompt)}
              type="button"
            >
              <Sparkles size={11} />
              {starter.label}
            </button>
          ))}
        </div>

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
                        className="btn-icon"
                        onClick={() => void duplicateProject(project.id)}
                        title="Duplicate app"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        className="btn-icon btn-danger"
                        onClick={() => openDeleteDialog(project)}
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

      {deleteTarget && (
        <ConfirmDialog
          cancelLabel="Keep app"
          confirmLabel="Delete app"
          description={
            <>
              <strong>{deleteTarget.name}</strong> and everything in it — chat history, files, and
              build history — will be permanently removed.
            </>
          }
          destructive
          error={deleteError}
          loading={deleteLoading}
          onClose={() => {
            if (deleteLoading) return;
            setDeleteTarget(null);
            setDeleteError("");
          }}
          onConfirm={confirmDeleteProject}
          title="Delete this app?"
        />
      )}

      <div className="home-accent-bar" aria-hidden />
    </div>
  );
}
