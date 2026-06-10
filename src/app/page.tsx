"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Expand, Plus, Trash2 } from "lucide-react";

type Project = {
  id: string;
  name: string;
  description: string;
  model: string;
  updated_at: number;
};

const starterPrompt =
  "Build a polished small app with clear navigation, useful empty states, responsive layout, and complete CRUD for the core data. Use simple local state unless I ask for a backend.";

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState(starterPrompt);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function fetchProjects() {
    setLoading(true);
    const response = await fetch("/api/projects");
    setProjects(await response.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updated_at - a.updated_at),
    [projects]
  );

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || creating) return;

    setCreating(true);
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: prompt.trim().slice(0, 180),
      }),
    });
    const project = await response.json();
    router.push(`/projects/${project.id}?prompt=${encodeURIComponent(prompt.trim())}`);
  }

  async function deleteProject(id: string) {
    if (!confirm("Delete this app, including chat and files?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((current) => current.filter((project) => project.id !== id));
  }

  return (
    <main className="shell">
      <div className="container">
        <header className="topbar">
          <Link className="brand" href="/">
            <span className="mark">ai</span>
            <span>
              <strong>aistudio</strong>
              <span className="eyebrow" style={{ display: "block" }}>
                one open workspace for small apps
              </span>
            </span>
          </Link>
          <button className="button" onClick={() => setShowModal(true)}>
            <Plus size={17} />
            New app
          </button>
        </header>

        <section className="hero">
          <h1 className="title">Chat an app into files. Keep every project in one place.</h1>
          <p className="lead">
            A minimal Lovable/v0-style builder for small apps: project overview, chat IDE,
            generated files, manual CRUD, and fullscreen focus mode powered by OpenRouter.
          </p>
          <div className="hero-actions">
            <button className="button" onClick={() => setShowModal(true)}>
              <Plus size={17} />
              Start from prompt
            </button>
            {sortedProjects[0] && (
              <Link className="ghost-button" href={`/projects/${sortedProjects[0].id}`}>
                Continue latest
                <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </section>

        {loading ? (
          <div className="empty-state">Loading projects...</div>
        ) : sortedProjects.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No apps yet</strong>
              <p style={{ marginTop: 8 }}>Create one from a prompt and the workspace will save files as you chat.</p>
            </div>
          </div>
        ) : (
          <section className="project-grid" aria-label="Projects">
            {sortedProjects.map((project) => (
              <article className="project-card" key={project.id}>
                <div>
                  <h3>{project.name}</h3>
                  <p style={{ marginTop: 8 }}>
                    {project.description || "No description yet."}
                  </p>
                </div>
                <p>
                  Updated{" "}
                  {project.updated_at
                    ? new Date(project.updated_at * 1000).toLocaleDateString()
                    : "recently"}
                </p>
                <div className="card-actions">
                  <Link className="button" href={`/projects/${project.id}`} style={{ flex: 1 }}>
                    Open
                    <ArrowRight size={16} />
                  </Link>
                  <Link className="icon-button" href={`/projects/${project.id}/fullscreen`} title="Open fullscreen">
                    <Expand size={17} />
                  </Link>
                  <button className="icon-button" onClick={() => deleteProject(project.id)} title="Delete app">
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <form className="modal-panel" onSubmit={createProject} onClick={(event) => event.stopPropagation()}>
            <div>
              <h2>Create app</h2>
              <p className="eyebrow" style={{ marginTop: 6 }}>
                This first prompt becomes the starting point for the app builder.
              </p>
            </div>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                className="input"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Inventory tracker"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="prompt">Entry prompt</label>
              <textarea
                id="prompt"
                className="textarea"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>
            <div className="split-actions">
              <button className="ghost-button" type="button" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button className="button" type="submit" disabled={creating || !name.trim()}>
                {creating ? "Creating..." : "Create and open"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
