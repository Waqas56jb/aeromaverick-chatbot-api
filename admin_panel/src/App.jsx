import { useCallback, useEffect, useRef, useState } from "react";
import { downloadAdmin, fetchAdmin, loadBackendConfig } from "./api.js";
import { BRAND_LOGO_URL } from "./brand.js";
import { ADMIN_BOT_KEY, CHATBOTS, DEFAULT_BOT_SLUG, labelForSlug } from "./bots.js";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function intentBadgeClass(intent) {
  const i = (intent || "").toLowerCase();
  if (i.includes("buy")) return "intent-buy";
  if (i.includes("sell")) return "intent-sell";
  if (i.includes("finance")) return "intent-finance";
  if (i.includes("charter")) return "intent-charter";
  if (i.includes("engine")) return "intent-engine";
  return "intent-default";
}

function IconEye({ className }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconTrash({ className }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

const INTENT_PRESETS = [
  { value: "", label: "All intents" },
  { value: "charter", label: "Charter" },
  { value: "buy", label: "Buy / purchase" },
  { value: "sell", label: "Sell" },
  { value: "finance", label: "Finance" },
  { value: "engine", label: "Engine" },
];

function LeadDetailModal({ lead, botLabel, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!lead) return null;

  const rows = [
    ["Date added", formatDate(lead.created_at)],
    ["Brand", botLabel || lead.bot || "—"],
    ["Chat reference", lead.session_id || "—"],
    ["Name", lead.name || "—"],
    ["Email", lead.email || "—"],
    ["Phone", lead.phone || "—"],
    ["Intent", lead.intent || "—"],
    ["Aircraft / type", lead.aircraft_type || "—"],
    ["Budget", lead.budget || "—"],
    ["Notes", lead.notes || "—"],
  ];

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-detail-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-panel">
        <header className="modal-head">
          <div>
            <h2 id="lead-detail-title" className="modal-title">
              {lead.name?.trim() || "Lead"}
            </h2>
            <p className="modal-sub">{lead.email || "No email"}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-badge-row">
          <span className={`badge ${intentBadgeClass(lead.intent)}`}>{lead.intent || "—"}</span>
        </div>
        <dl className="detail-grid">
          {rows.map(([k, v]) => (
            <div key={k} className="detail-row">
              <dt>{k}</dt>
              <dd className={k === "Chat reference" ? "cell-mono wrap" : ""}>{v}</dd>
            </div>
          ))}
        </dl>
        <footer className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  const [botOptions, setBotOptions] = useState(() => CHATBOTS.map(({ slug, label }) => ({ slug, label })));
  const [selectedBot, setSelectedBot] = useState(() => {
    if (typeof sessionStorage === "undefined") return DEFAULT_BOT_SLUG;
    return sessionStorage.getItem(ADMIN_BOT_KEY) || DEFAULT_BOT_SLUG;
  });

  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [limit] = useState(12);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [listError, setListError] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [configReady, setConfigReady] = useState(false);
  const [intentFilter, setIntentFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [detailLead, setDetailLead] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const tableHeaderCheckboxRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await loadBackendConfig();
        if (cancelled) return;
        if (cfg?.chatbots?.length) {
          setBotOptions(cfg.chatbots);
          const def = cfg.defaultBot || cfg.chatbots[0].slug;
          const stored = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(ADMIN_BOT_KEY) : null;
          if (!stored || !cfg.chatbots.some((b) => b.slug === stored)) {
            setSelectedBot(def);
            if (typeof sessionStorage !== "undefined") sessionStorage.setItem(ADMIN_BOT_KEY, def);
          }
        }
      } finally {
        if (!cancelled) setConfigReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onBotChange = (e) => {
    const slug = e.target.value;
    setSelectedBot(slug);
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(ADMIN_BOT_KEY, slug);
    setPage(1);
    setRefreshToken((n) => n + 1);
  };

  const onIntentFilterChange = (e) => {
    setIntentFilter(e.target.value);
    setPage(1);
    setRefreshToken((n) => n + 1);
  };

  const loadStats = useCallback(async () => {
    const params = new URLSearchParams({ bot: selectedBot });
    if (intentFilter.trim()) params.set("intent", intentFilter.trim());
    const res = await fetchAdmin(`/admin/stats?${params}`);
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) {
      setStats(null);
      return;
    }
    if (res.ok) setStats(data);
  }, [refreshToken, selectedBot, intentFilter]);

  const loadLeads = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        q,
        bot: selectedBot,
      });
      if (intentFilter.trim()) params.set("intent", intentFilter.trim());
      const res = await fetchAdmin(`/admin/leads?${params}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) {
        throw new Error(`We couldn’t load your leads. Please refresh the page or try again in a moment.`);
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setItems(data.items || []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch (e) {
      setListError(e.message);
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }, [page, limit, q, refreshToken, selectedBot, intentFilter]);

  const pageIds = items.map((i) => i.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const someOnPageSelected = pageIds.some((id) => selectedIds.includes(id));

  useEffect(() => {
    const el = tableHeaderCheckboxRef.current;
    if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected;
  }, [someOnPageSelected, allOnPageSelected, items]);

  useEffect(() => {
    setSelectedIds([]);
  }, [selectedBot, q, intentFilter]);

  const toggleId = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
    }
  };

  const requestDelete = async (ids) => {
    if (!ids.length) return;
    const qs = new URLSearchParams({ bot: selectedBot });
    const res = await fetchAdmin(`/admin/leads/delete?${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.deleted ?? 0;
  };

  const deleteSelected = async () => {
    if (!selectedIds.length || deleteBusy) return;
    const ids = [...selectedIds];
    const n = ids.length;
    if (!window.confirm(`Delete ${n} lead${n === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setDeleteBusy(true);
    try {
      await requestDelete(ids);
      setSelectedIds([]);
      setRefreshToken((x) => x + 1);
      setExportMsg(`Deleted ${n} record${n === 1 ? "" : "s"}.`);
    } catch (e) {
      setExportMsg(e.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const deleteOne = async (row) => {
    if (deleteBusy) return;
    if (!window.confirm(`Delete this lead (${row.name || row.email || row.id})?`)) return;
    setDeleteBusy(true);
    try {
      await requestDelete([row.id]);
      setDetailLead((d) => (d?.id === row.id ? null : d));
      setSelectedIds((prev) => prev.filter((x) => x !== row.id));
      setRefreshToken((n) => n + 1);
      setExportMsg("Lead deleted.");
    } catch (e) {
      setExportMsg(e.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  useEffect(() => {
    if (!configReady) return;
    loadStats();
  }, [configReady, loadStats]);

  useEffect(() => {
    if (!configReady) return;
    loadLeads();
  }, [configReady, loadLeads]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  const onExportCsv = async () => {
    setExportMsg(null);
    try {
      await downloadAdmin(`/admin/leads/export.csv?bot=${encodeURIComponent(selectedBot)}`, `leads_${selectedBot}.csv`);
      setExportMsg("CSV downloaded.");
    } catch (e) {
      setExportMsg(e.message);
    }
  };

  const onExportXlsx = async () => {
    setExportMsg(null);
    try {
      await downloadAdmin(
        `/admin/leads/export.xlsx?bot=${encodeURIComponent(selectedBot)}`,
        `leads_${selectedBot}.xlsx`
      );
      setExportMsg("Excel downloaded.");
    } catch (e) {
      setExportMsg(e.message);
    }
  };

  const displayLabel = (slug) =>
    botOptions.find((b) => b.slug === slug)?.label || labelForSlug(slug);

  const brand =
    CHATBOTS.find((b) => b.slug === selectedBot) || {
      label: displayLabel(selectedBot),
      short: String(selectedBot || "—")
        .slice(0, 2)
        .toUpperCase(),
    };

  const multiWorkspace = botOptions.length > 1;
  const sidebarLogoOnly = selectedBot === "aeromaverick";

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className={`sidebar-brand${sidebarLogoOnly ? " sidebar-brand--logo-only" : ""}`}>
          {sidebarLogoOnly ? (
            <img
              src={BRAND_LOGO_URL}
              alt="AeroMaverick"
              className="brand-logo-img"
              width={248}
              height={72}
            />
          ) : (
            <>
              <span className="brand-icon sm" aria-hidden>
                {brand.short}
              </span>
              <div className="sidebar-brand-text">
                <strong>{brand.label}</strong>
                <span>Leads</span>
              </div>
            </>
          )}
        </div>

        <div className="sidebar-head">
          <label className="field-label" htmlFor={multiWorkspace ? "bot-select" : undefined}>
            {multiWorkspace ? "Chatbot" : "Workspace"}
          </label>
          {multiWorkspace ? (
            <select id="bot-select" className="bot-select" value={selectedBot} onChange={onBotChange}>
              {botOptions.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="bot-single" id="workspace-bot" aria-live="polite">
              {displayLabel(selectedBot)}
            </div>
          )}
          <p className="bot-hint">
            {multiWorkspace
              ? "You only see people who talked to the chatbot you pick above. Choose another name to view a different brand."
              : "You only see people who talked to this chatbot. Search and export stay on this list."}
          </p>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-active">Captured contacts</span>
          <span className="nav-muted">{total} on this list</span>
        </nav>
      </aside>

      <div className="dashboard-main">
        <header className="topbar">
          <div className="topbar-lead">
            <div className="topbar-titles">
              <h1 className="page-title">Lead inbox</h1>
              <p className="topbar-sub">
                <span className="pill-outline">{displayLabel(selectedBot)}</span>
                &nbsp;· People who reached out through this chatbot. Find them, export a list, or tidy up old entries.
              </p>
            </div>
          </div>
          <div className="stat-pills">
            <div className="stat-pill stat-pill-accent">
              <span className="stat-label">Total leads</span>
              <span className="stat-value">{stats?.leads_total != null ? stats.leads_total : "—"}</span>
            </div>
            <div className="stat-pill subtle">
              <span className="stat-label">Connection</span>
              <span className="stat-value">{stats?.database ? "Connected" : "Unavailable"}</span>
            </div>
          </div>
        </header>

        <section className="toolbar">
          <div className="toolbar-filters">
            <div className="toolbar-search">
              <span className="search-icon" aria-hidden>
                ⌕
              </span>
              <input
                type="search"
                className="field-input flat"
                placeholder="Search by name, email, phone, or notes…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="toolbar-intent">
              <label className="sr-only" htmlFor="filter-intent">
                Intent
              </label>
              <select
                id="filter-intent"
                className="bot-select intent-filter"
                value={intentFilter}
                onChange={onIntentFilterChange}
              >
                {INTENT_PRESETS.map((o) => (
                  <option key={o.label} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="toolbar-actions">
            <button
              type="button"
              className="btn secondary"
              disabled={!items.length || listLoading}
              title="Select every lead on this page"
              onClick={toggleSelectAllOnPage}
            >
              {allOnPageSelected ? "Deselect page" : "Select all on page"}
            </button>
            <button type="button" className="btn secondary" onClick={onExportCsv}>
              Export CSV
            </button>
            <button type="button" className="btn primary" onClick={onExportXlsx}>
              Export Excel
            </button>
          </div>
        </section>

        {selectedIds.length > 0 && (
          <div className="selection-bar">
            <span className="selection-bar-text">
              <strong>{selectedIds.length}</strong> selected
            </span>
            <div className="selection-bar-actions">
              <button type="button" className="btn ghost sm" onClick={() => setSelectedIds([])}>
                Clear
              </button>
              <button
                type="button"
                className="btn danger sm"
                disabled={deleteBusy}
                onClick={deleteSelected}
              >
                <IconTrash className="btn-icon" /> Delete selected
              </button>
            </div>
          </div>
        )}

        {exportMsg && <div className="inline-toast">{exportMsg}</div>}
        {listError && <div className="banner error">{listError}</div>}

        {listLoading && <div className="loading-bar" aria-busy />}

        <div className="leads-grid" role="list">
          {listLoading && items.length === 0 && <div className="empty-state muted">Loading leads…</div>}
          {!listLoading && items.length === 0 && (
            <div className="empty-state">
              <p>
                No leads for <strong>{displayLabel(selectedBot)}</strong> yet.
              </p>
              <p className="empty-sub">
                When someone starts a conversation with this chatbot and shares their details, their entry will appear
                here automatically.
              </p>
            </div>
          )}
          {items.map((row) => (
            <article key={row.id} className="lead-card" role="listitem">
              <div className="lead-card-toolbar">
                <label className="chk-label">
                  <input
                    type="checkbox"
                    className="chk-input"
                    checked={selectedIds.includes(row.id)}
                    onChange={() => toggleId(row.id)}
                    aria-label={`Select ${row.name || row.email || "lead"}`}
                  />
                </label>
                <div className="lead-card-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title="View full details"
                    aria-label="View details"
                    onClick={() => setDetailLead(row)}
                  >
                    <IconEye />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    title="Delete lead"
                    aria-label="Delete lead"
                    disabled={deleteBusy}
                    onClick={() => deleteOne(row)}
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>
              <header className="lead-card-head">
                <div className="lead-who">
                  <strong>{row.name || "—"}</strong>
                  <span className="lead-email">{row.email || "—"}</span>
                </div>
                <span className={`badge ${intentBadgeClass(row.intent)}`}>{row.intent || "—"}</span>
              </header>
              <dl className="lead-meta">
                <div>
                  <dt>When</dt>
                  <dd>{formatDate(row.created_at)}</dd>
                </div>
                <div>
                  <dt>Chat reference</dt>
                  <dd className="cell-mono" title={row.session_id}>
                    {row.session_id?.length > 14 ? `${row.session_id.slice(0, 10)}…` : row.session_id || "—"}
                  </dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{row.phone || "—"}</dd>
                </div>
                <div>
                  <dt>Aircraft / type</dt>
                  <dd>{row.aircraft_type || "—"}</dd>
                </div>
                <div>
                  <dt>Budget</dt>
                  <dd>{row.budget || "—"}</dd>
                </div>
              </dl>
              {row.notes ? (
                <div className="lead-notes">
                  <span className="lead-notes-label">Notes</span>
                  <p>{row.notes}</p>
                </div>
              ) : null}
            </article>
          ))}
        </div>

        <div className="table-wrap desktop-only" aria-hidden={items.length === 0}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="th-check">
                  <input
                    ref={tableHeaderCheckboxRef}
                    type="checkbox"
                    className="chk-input"
                    checked={allOnPageSelected && pageIds.length > 0}
                    onChange={toggleSelectAllOnPage}
                    aria-label="Select all leads on this page"
                  />
                </th>
                <th>When</th>
                <th>Reference</th>
                <th>Contact</th>
                <th>Intent</th>
                <th>Details</th>
                <th>Notes</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listLoading && (
                <tr>
                  <td colSpan={8} className="cell-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!listLoading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="cell-muted">
                    No rows (see cards above on small screens).
                  </td>
                </tr>
              )}
              {!listLoading &&
                items.map((row) => (
                  <tr key={`t-${row.id}`}>
                    <td className="td-check">
                      <input
                        type="checkbox"
                        className="chk-input"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleId(row.id)}
                        aria-label={`Select ${row.name || row.email || "lead"}`}
                      />
                    </td>
                    <td className="cell-nowrap">{formatDate(row.created_at)}</td>
                    <td className="cell-mono" title={row.session_id}>
                      {row.session_id?.length > 12 ? `${row.session_id.slice(0, 8)}…` : row.session_id || "—"}
                    </td>
                    <td>
                      <div className="cell-stack">
                        <strong>{row.name || "—"}</strong>
                        <span className="cell-muted">{row.email || "—"}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${intentBadgeClass(row.intent)}`}>{row.intent || "—"}</span>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <span>{row.phone || "—"}</span>
                        <span className="cell-small">{row.aircraft_type || "—"}</span>
                        <span className="cell-small">{row.budget || ""}</span>
                      </div>
                    </td>
                    <td className="cell-notes" title={row.notes}>
                      {row.notes || "—"}
                    </td>
                    <td className="td-actions">
                      <div className="table-row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="View"
                          aria-label="View details"
                          onClick={() => setDetailLead(row)}
                        >
                          <IconEye />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Delete"
                          aria-label="Delete"
                          disabled={deleteBusy}
                          onClick={() => deleteOne(row)}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <footer className="pager">
          <span className="pager-info">
            {total} lead{total === 1 ? "" : "s"}
            {(q || intentFilter) ? " · search or filters applied" : ""} · {displayLabel(selectedBot)}
          </span>
          <div className="pager-controls">
            <button type="button" className="btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </button>
            <span className="pager-num">
              Page {page} / {pages}
            </span>
            <button type="button" className="btn ghost sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </footer>

        {detailLead && (
          <LeadDetailModal
            lead={detailLead}
            botLabel={displayLabel(detailLead.bot || selectedBot)}
            onClose={() => setDetailLead(null)}
          />
        )}
      </div>
    </div>
  );
}
