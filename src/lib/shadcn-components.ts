/** Pinned version for generated app import maps (esm.sh). */
export const SHADCN_VERSION = "1.3.2";

export type ShadcnFamily = {
  /** Root id used in npm package names, e.g. "button" → shadcn-button */
  id: string;
  /** All custom-element parts in this family (import each package once in app.js). */
  parts: string[];
  category: "layout" | "form" | "feedback" | "overlay" | "navigation" | "data" | "display";
  /** One-line guidance for the planner / file generator. */
  useWhen: string;
  /** Lowercase keywords for request matching. */
  keywords: string[];
  /** When NOT to reach for this family. */
  avoidWhen?: string;
};

/** Curated shadcn-web-components families — https://github.com/shcnwc/shadcn-web-components */
export const SHADCN_FAMILIES: ShadcnFamily[] = [
  {
    id: "button",
    parts: ["button"],
    category: "form",
    useWhen: "Primary actions, form submit, links styled as buttons, icon actions (size=\"icon\").",
    keywords: ["button", "submit", "click", "cta", "action", "save", "add", "create", "delete", "confirm"],
  },
  {
    id: "input",
    parts: ["input", "label", "textarea"],
    category: "form",
    useWhen: "Text fields, search boxes, form labels, multi-line text.",
    keywords: ["input", "field", "text", "search", "form", "email", "password", "label", "textarea"],
  },
  {
    id: "select",
    parts: ["select", "select-trigger", "select-content", "select-item", "select-value", "select-group", "select-label"],
    category: "form",
    useWhen: "Dropdown pickers with a fixed list of options.",
    keywords: ["select", "dropdown", "picker", "option", "choose", "category"],
    avoidWhen: "Typeahead with search — prefer combobox or command.",
  },
  {
    id: "checkbox",
    parts: ["checkbox", "label"],
    category: "form",
    useWhen: "Boolean toggles in forms, multi-select lists, settings checkboxes.",
    keywords: ["checkbox", "check", "toggle option", "multi-select", "agree"],
  },
  {
    id: "switch",
    parts: ["switch", "label"],
    category: "form",
    useWhen: "On/off settings (dark mode, notifications, feature flags).",
    keywords: ["switch", "toggle", "on off", "dark mode", "enable", "disable"],
  },
  {
    id: "radio-group",
    parts: ["radio-group", "radio-group-item", "label"],
    category: "form",
    useWhen: "Exactly-one choice among a small set of options.",
    keywords: ["radio", "single choice", "option group", "plan", "tier"],
  },
  {
    id: "slider",
    parts: ["slider", "label"],
    category: "form",
    useWhen: "Numeric range input (volume, price range, rating).",
    keywords: ["slider", "range", "volume", "min max", "scrub"],
  },
  {
    id: "combobox",
    parts: [
      "combobox",
      "combobox-trigger",
      "combobox-input",
      "combobox-content",
      "combobox-item",
      "combobox-empty",
      "combobox-group",
    ],
    category: "form",
    useWhen: "Searchable autocomplete from a list.",
    keywords: ["combobox", "autocomplete", "typeahead", "search select", "filter list"],
  },
  {
    id: "card",
    parts: ["card", "card-header", "card-title", "card-description", "card-content", "card-footer"],
    category: "layout",
    useWhen: "Grouped content panels, dashboard tiles, list items, settings sections.",
    keywords: ["card", "panel", "tile", "section", "widget", "dashboard", "box"],
  },
  {
    id: "tabs",
    parts: ["tabs", "tabs-list", "tabs-trigger", "tabs-content"],
    category: "layout",
    useWhen: "Switching between related views without navigation.",
    keywords: ["tabs", "tabbed", "sections", "views", "switch view"],
  },
  {
    id: "separator",
    parts: ["separator"],
    category: "layout",
    useWhen: "Visual dividers between sections.",
    keywords: ["separator", "divider", "hr", "split"],
  },
  {
    id: "scroll-area",
    parts: ["scroll-area"],
    category: "layout",
    useWhen: "Scrollable panels with styled overflow (chat, sidebar lists).",
    keywords: ["scroll", "overflow", "chat", "feed", "long list"],
  },
  {
    id: "sidebar",
    parts: [
      "sidebar",
      "sidebar-content",
      "sidebar-footer",
      "sidebar-group",
      "sidebar-group-content",
      "sidebar-header",
      "sidebar-menu",
      "sidebar-menu-button",
      "sidebar-menu-item",
      "sidebar-provider",
      "sidebar-trigger",
    ],
    category: "layout",
    useWhen: "App shell with collapsible side navigation.",
    keywords: ["sidebar", "navigation", "dashboard layout", "admin", "shell", "menu"],
  },
  {
    id: "dialog",
    parts: [
      "dialog",
      "dialog-trigger",
      "dialog-content",
      "dialog-header",
      "dialog-title",
      "dialog-description",
      "dialog-footer",
      "dialog-close",
    ],
    category: "overlay",
    useWhen: "Modal forms, confirmations, detail views over the page.",
    keywords: ["dialog", "modal", "popup", "overlay", "open form"],
    avoidWhen: "Mobile bottom sheet — prefer drawer or sheet.",
  },
  {
    id: "alert-dialog",
    parts: [
      "alert-dialog",
      "alert-dialog-trigger",
      "alert-dialog-content",
      "alert-dialog-header",
      "alert-dialog-title",
      "alert-dialog-description",
      "alert-dialog-footer",
      "alert-dialog-action",
      "alert-dialog-cancel",
    ],
    category: "overlay",
    useWhen: "Destructive or irreversible confirmations (delete, reset).",
    keywords: ["confirm", "are you sure", "delete", "destructive", "warning modal"],
  },
  {
    id: "sheet",
    parts: [
      "sheet",
      "sheet-trigger",
      "sheet-content",
      "sheet-header",
      "sheet-title",
      "sheet-description",
      "sheet-footer",
      "sheet-close",
    ],
    category: "overlay",
    useWhen: "Slide-over panel from the edge (filters, mobile nav).",
    keywords: ["sheet", "drawer", "slide", "panel", "filters", "mobile menu"],
  },
  {
    id: "drawer",
    parts: ["drawer", "drawer-trigger", "drawer-content", "drawer-header", "drawer-title", "drawer-footer"],
    category: "overlay",
    useWhen: "Bottom or side drawer on mobile-first flows.",
    keywords: ["drawer", "bottom sheet", "mobile"],
  },
  {
    id: "popover",
    parts: ["popover", "popover-trigger", "popover-content"],
    category: "overlay",
    useWhen: "Floating content anchored to a button (pickers, mini forms).",
    keywords: ["popover", "floating", "anchored", "picker"],
  },
  {
    id: "tooltip",
    parts: ["tooltip", "tooltip-trigger", "tooltip-content", "tooltip-provider"],
    category: "overlay",
    useWhen: "Short hints on hover/focus for icons and controls.",
    keywords: ["tooltip", "hint", "hover help"],
  },
  {
    id: "dropdown-menu",
    parts: [
      "dropdown-menu",
      "dropdown-menu-trigger",
      "dropdown-menu-content",
      "dropdown-menu-item",
      "dropdown-menu-separator",
      "dropdown-menu-label",
    ],
    category: "navigation",
    useWhen: "Action menus from a button (⋯ menu, account menu).",
    keywords: ["dropdown", "menu", "actions", "context menu", "kebab"],
  },
  {
    id: "navigation-menu",
    parts: ["navigation-menu", "navigation-menu-list", "navigation-menu-item", "navigation-menu-trigger", "navigation-menu-content"],
    category: "navigation",
    useWhen: "Top site navigation with mega-menu style sections.",
    keywords: ["navbar", "navigation", "header links", "top nav"],
  },
  {
    id: "breadcrumb",
    parts: ["breadcrumb", "breadcrumb-list", "breadcrumb-item", "breadcrumb-link", "breadcrumb-page", "breadcrumb-separator"],
    category: "navigation",
    useWhen: "Hierarchy path (Settings / Profile / Security).",
    keywords: ["breadcrumb", "path", "hierarchy", "trail"],
  },
  {
    id: "pagination",
    parts: ["pagination", "pagination-content", "pagination-item", "pagination-link", "pagination-next", "pagination-previous"],
    category: "navigation",
    useWhen: "Paged lists and tables.",
    keywords: ["pagination", "pages", "next prev", "paged"],
  },
  {
    id: "table",
    parts: ["table", "table-header", "table-body", "table-row", "table-head", "table-cell"],
    category: "data",
    useWhen: "Simple data tables without heavy sorting/filtering logic.",
    keywords: ["table", "grid", "rows", "columns", "spreadsheet"],
    avoidWhen: "Sortable/filterable datagrid — prefer data-table.",
  },
  {
    id: "data-table",
    parts: ["data-table"],
    category: "data",
    useWhen: "Rich tables with sorting, filtering, column visibility.",
    keywords: ["data table", "datagrid", "sortable", "filterable table", "crm", "records"],
  },
  {
    id: "badge",
    parts: ["badge"],
    category: "display",
    useWhen: "Status labels, counts, tags (active, draft, 3 new).",
    keywords: ["badge", "tag", "label", "status", "chip", "count"],
  },
  {
    id: "avatar",
    parts: ["avatar", "avatar-image", "avatar-fallback"],
    category: "display",
    useWhen: "User profile images with initials fallback.",
    keywords: ["avatar", "profile", "user image", "initials"],
  },
  {
    id: "alert",
    parts: ["alert", "alert-title", "alert-description"],
    category: "feedback",
    useWhen: "Inline page alerts (success, error, info banners).",
    keywords: ["alert", "banner", "notice", "warning", "success message", "error message"],
  },
  {
    id: "progress",
    parts: ["progress"],
    category: "feedback",
    useWhen: "Determinate progress (upload, onboarding steps).",
    keywords: ["progress", "loading bar", "percent", "upload"],
  },
  {
    id: "skeleton",
    parts: ["skeleton"],
    category: "feedback",
    useWhen: "Loading placeholders while async data fetches.",
    keywords: ["skeleton", "loading", "placeholder", "shimmer"],
  },
  {
    id: "calendar",
    parts: ["calendar"],
    category: "form",
    useWhen: "Date picking UI (single date).",
    keywords: ["calendar", "date pick", "schedule", "day picker"],
  },
  {
    id: "date-picker",
    parts: ["date-picker"],
    category: "form",
    useWhen: "Input-style date picker with popover calendar.",
    keywords: ["date picker", "datepicker", "due date", "birthday"],
  },
  {
    id: "accordion",
    parts: ["accordion", "accordion-item", "accordion-trigger", "accordion-content"],
    category: "layout",
    useWhen: "FAQ sections, collapsible settings groups.",
    keywords: ["accordion", "faq", "collapse", "expand", "fold"],
  },
  {
    id: "command",
    parts: ["command", "command-input", "command-list", "command-item", "command-empty", "command-group"],
    category: "navigation",
    useWhen: "Command palette (⌘K search across actions).",
    keywords: ["command palette", "cmd k", "spotlight", "quick search", "palette"],
  },
  {
    id: "chart",
    parts: ["chart", "chart-container", "chart-tooltip", "chart-legend"],
    category: "data",
    useWhen: "Charts and analytics visualizations.",
    keywords: ["chart", "graph", "analytics", "stats", "visualization", "plot"],
  },
];

const BASELINE_FAMILY_IDS = ["button", "input", "card", "badge", "alert"];

export function shadcnPackageName(partId: string) {
  return `@shcnwc/shadcn-${partId}-web-component`;
}

export function shadcnImportUrl(partId: string) {
  const pkg = shadcnPackageName(partId);
  return `https://esm.sh/${pkg}@${SHADCN_VERSION}`;
}

export function shadcnTag(partId: string) {
  return `shadcn-${partId}`;
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function scoreFamily(family: ShadcnFamily, haystack: string) {
  let score = 0;
  for (const keyword of family.keywords) {
    const normalized = normalize(keyword);
    if (normalized.length < 3) continue;
    if (haystack.includes(normalized)) score += normalized.split(" ").length >= 2 ? 4 : 2;
  }
  if (family.id.replace(/-/g, " ") && haystack.includes(family.id.replace(/-/g, " "))) {
    score += 3;
  }
  return score;
}

export type ShadcnSelection = {
  families: ShadcnFamily[];
  partIds: string[];
};

/** Picks the most relevant shadcn families for a user request / plan summary. */
export function selectShadcnComponents(request: string, limit = 10): ShadcnSelection {
  const haystack = normalize(request);
  const isNewApp = /\b(build|create|make|scaffold|new app|from scratch)\b/.test(haystack);

  const scored = SHADCN_FAMILIES.map((family) => ({
    family,
    score: scoreFamily(family, haystack),
  })).sort((a, b) => b.score - a.score);

  const chosen = new Map<string, ShadcnFamily>();

  for (const id of BASELINE_FAMILY_IDS) {
    if (isNewApp || haystack.length < 8) {
      const family = SHADCN_FAMILIES.find((item) => item.id === id);
      if (family) chosen.set(family.id, family);
    }
  }

  for (const { family, score } of scored) {
    if (score <= 0) continue;
    chosen.set(family.id, family);
    if (chosen.size >= limit) break;
  }

  if (chosen.size === 0) {
    for (const id of BASELINE_FAMILY_IDS) {
      const family = SHADCN_FAMILIES.find((item) => item.id === id);
      if (family) chosen.set(family.id, family);
    }
  }

  const families = [...chosen.values()];
  const partIds = [...new Set(families.flatMap((family) => family.parts))].sort();
  return { families, partIds };
}

export function formatShadcnImportMapEntries(partIds: string[]) {
  const entries = partIds.map((part) => {
    const pkg = shadcnPackageName(part);
    return `    "${pkg}": "${shadcnImportUrl(part)}"`;
  });
  return entries.join(",\n");
}

/** Prompt section injected into plan + file generation when building UI. */
export function formatShadcnGuide(request: string) {
  const { families, partIds } = selectShadcnComponents(request);

  const familyLines = families
    .map((family) => {
      const tags = family.parts.map(shadcnTag).join(", ");
      const avoid = family.avoidWhen ? ` Avoid when: ${family.avoidWhen}.` : "";
      return `- **${family.id}** (${family.category}): ${family.useWhen} Tags: ${tags}.${avoid}`;
    })
    .join("\n");

  const importLines = partIds
    .map((part) => `import '${shadcnPackageName(part)}'; // registers <${shadcnTag(part)}>`)
    .join("\n");

  return `## UI kit — shadcn-web-components (required for all UI)
Use **shadcn-web-components** (https://github.com/shcnwc/shadcn-web-components) for every interactive UI surface. Do NOT hand-roll buttons, inputs, dialogs, cards, or tables with raw HTML/CSS when a shadcn component fits.

**Architecture:**
- \`index.html\` — include Tailwind v4 browser: \`<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>\`, import map (lit + shadcn packages below), \`styles.css\` with shadcn CSS variables, custom element tags, \`app.js\`.
- \`styles.css\` — shadcn theme tokens (\`:root { --background: 0 0% 100%; --foreground: 240 10% 3.9%; ... }\`), page layout only. Component look comes from shadcn + Tailwind.
- \`components/*.js\` — Lit components whose \`render()\` composes \`<shadcn-*>\` tags for UI. App logic, state, window.db/window.ai calls live here.
- \`app.js\` — import lit + every shadcn package used anywhere in the app (side-effect imports register custom elements).

**Import map entries** (add only packages you actually import — copy from this list):
\`\`\`json
{
  "imports": {
    "lit": "https://esm.sh/lit@3.3.1",
    "lit/decorators.js": "https://esm.sh/lit@3.3.1/decorators.js",
${formatShadcnImportMapEntries(partIds)}
  }
}
\`\`\`

**Register in app.js** (every part used in the app):
\`\`\`javascript
${importLines}
\`\`\`

**Lit + shadcn example:**
\`\`\`javascript
import { LitElement, html } from 'lit';
import '@shcnwc/shadcn-button-web-component';
import '@shcnwc/shadcn-card-web-component';
import '@shcnwc/shadcn-card-header-web-component';
import '@shcnwc/shadcn-card-title-web-component';
import '@shcnwc/shadcn-card-content-web-component';

export class TodoApp extends LitElement {
  render() {
    return html\`
      <shadcn-card>
        <shadcn-card-header><shadcn-card-title>Todos</shadcn-card-title></shadcn-card-header>
        <shadcn-card-content>
          <shadcn-button variant="default">Add todo</shadcn-button>
        </shadcn-card-content>
      </shadcn-card>
    \`;
  }
}
customElements.define('todo-app', TodoApp);
\`\`\`

**Selected for this request** (prefer these; add others only when clearly needed):
${familyLines}

**Selection rules:**
- Forms → input, label, textarea, select or combobox, checkbox, switch, button
- Lists / CRUD → card rows + table or data-table + dialog for edit + alert-dialog for delete
- Settings / profile → tabs + switch + separator + card sections
- Dashboard → card grid + chart + badge for KPIs
- Search / ⌘K → command + dialog
- Destructive actions → alert-dialog, never bare confirm()
- Loading → skeleton or progress; errors → alert
- Only import shadcn packages that appear in the app; keep app.js imports in sync with components used.`;
}
