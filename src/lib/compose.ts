type VirtualFile = { path: string; content: string };

/**
 * Runtime injected into every served app:
 * - forwards console output / errors to the parent workspace via postMessage
 * - provides `window.ai.chat()` backed by this platform's OpenRouter key
 * - shims localStorage/sessionStorage (apps run in a sandboxed, opaque origin)
 */
function runtimeScript(origin: string, projectId: string) {
  return `<script>
(function () {
  var send = function (level, text) {
    var msg = String(text).slice(0, 2000);
    var ignore = /ResizeObserver loop|chrome-extension:|moz-extension:|safari-extension:|^Script error\\.?$/i;
    if (ignore.test(msg.trim())) return;
    try { parent.postMessage({ __aistudio: true, type: "console", level: level, text: msg }, "*"); } catch (e) {}
  };
  var fmt = function (args) {
    return Array.prototype.map.call(args, function (a) {
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch (e) { return String(a); }
    }).join(" ");
  };
  ["log", "info", "warn", "error"].forEach(function (level) {
    var original = console[level];
    console[level] = function () { send(level, fmt(arguments)); original.apply(console, arguments); };
  });
  window.addEventListener("error", function (e) {
    send("error", e.message + (e.filename ? " (" + e.filename + ":" + e.lineno + ")" : ""));
  });
  window.addEventListener("unhandledrejection", function (e) {
    send("error", "Unhandled rejection: " + (e.reason && e.reason.message ? e.reason.message : e.reason));
  });

  function memoryStorage() {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      clear: function () { data = {}; },
      key: function (i) { return Object.keys(data)[i] || null; },
      get length() { return Object.keys(data).length; }
    };
  }
  ["localStorage", "sessionStorage"].forEach(function (name) {
    try { window[name].length; } catch (e) {
      try { Object.defineProperty(window, name, { value: memoryStorage() }); } catch (e2) {}
    }
  });

  window.ai = {
    chat: async function (input, options) {
      options = options || {};
      var messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
      if (options.system) messages = [{ role: "system", content: options.system }].concat(messages);
      var response = await fetch(${JSON.stringify(origin)} + "/api/app-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: ${JSON.stringify(projectId)}, messages: messages, json: !!options.json })
      });
      if (!response.ok) throw new Error("AI request failed: " + (await response.text()));
      var data = await response.json();
      return data.text;
    }
  };

  async function dbCall(action, table, extra) {
    var response = await fetch(${JSON.stringify(origin)} + "/api/app-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ projectId: ${JSON.stringify(projectId)}, action: action, table: table }, extra || {}))
    });
    if (!response.ok) throw new Error("Database request failed: " + (await response.text()));
    var data = await response.json();
    return data.result;
  }

  window.db = {
    list: function (table) { return dbCall("list", table); },
    get: function (table, id) { return dbCall("get", table, { id: id }); },
    insert: function (table, row) { return dbCall("insert", table, { row: row }); },
    update: function (table, id, patch) { return dbCall("update", table, { id: id, patch: patch }); },
    delete: function (table, id) { return dbCall("delete", table, { id: id }); }
  };
})();
</script>`;
}

function inlineLocalAssets(html: string, files: VirtualFile[]) {
  const byPath = new Map(files.map((file) => [file.path.replace(/^\.\//, ""), file.content]));
  const lookup = (href: string) => byPath.get(href.replace(/^\.\//, "").replace(/^\//, ""));

  let out = html.replace(
    /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi,
    (tag) => {
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      if (!href || /^https?:|^\/\//i.test(href)) return tag;
      const css = lookup(href);
      return css !== undefined ? `<style>\n${css}\n</style>` : tag;
    }
  );

  out = out.replace(
    /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (tag, before: string, src: string, after: string) => {
      if (/^https?:|^\/\//i.test(src)) return tag;
      const js = lookup(src);
      if (js === undefined) return tag;
      const attrs = `${before} ${after}`.replace(/\s+/g, " ").trim();
      return `<script${attrs ? ` ${attrs}` : ""}>\n${js}\n</script>`;
    }
  );

  return out;
}

const EMPTY_APP = `<!doctype html>
<html><head><meta charset="utf-8"><title>Nothing here yet</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#0a0a0a;color:#8a8a8a;font:15px ui-sans-serif,system-ui}</style>
</head><body><p>This app has no files yet. Ask the builder to create the first version.</p></body></html>`;

/** Builds a single self-contained HTML document for a project's virtual files. */
export function composeApp(files: VirtualFile[], origin: string, projectId: string) {
  const entry =
    files.find((file) => file.path === "index.html") ??
    files.find((file) => file.path.endsWith(".html"));

  let html = entry ? inlineLocalAssets(entry.content, files) : EMPTY_APP;
  const runtime = runtimeScript(origin, projectId);

  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (match) => `${match}\n${runtime}`);
  } else {
    html = runtime + html;
  }
  return html;
}
