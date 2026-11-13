import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Plus,
  MessageSquare,
  Library,
  Clapperboard,
  History,
  Settings,
  ArrowUp,
  ArrowUpRight,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Video,
  Copy,
  Download,
  Trash2,
  Check,
  Search,
  Sparkles,
  BookOpen,
  ChevronDown,
  Globe,
  KeyRound,
  Eye,
  EyeOff,
  Square,
  LoaderCircle,
  PanelLeftClose,
  ExternalLink,
  ArrowRight,
  ImagePlus,
  Pin,
  PinOff,
  Wifi,
} from "lucide-react";
import { strings } from "./i18n";
import {
  protocolOptions,
  normalizeMediaModel,
} from "../electron/media-protocols.mjs";
import "./styles.css";
import ImageViewer from "./ImageViewer";
import { mediaChoices } from "../electron/media-controls.mjs";
const api = window.worldmodel;
const url = (id, thumb = false) => `wm://${id}/${thumb ? "thumbnail" : ""}`;
function App() {
  const [data, setData] = useState(null),
    [view, setView] = useState("chat"),
    [chatId, setChatId] = useState(() => localStorage.getItem("activeChatId")),
    [draft, setDraft] = useState(""),
    [pending, setPending] = useState([]),
    [mode, setMode] = useState("ask"),
    [modelId, setModelId] = useState(""),
    [settings, setSettings] = useState(false),
    [busy, setBusy] = useState(null),
    [status, setStatus] = useState(null),
    [toast, setToast] = useState(""),
    [selected, setSelected] = useState([]),
    [reference, setReference] = useState(null),
    [viewingImage, setViewingImage] = useState(null),
    [drag, setDrag] = useState(false),
    [importing, setImporting] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [networkStatus, setNetworkStatus] = useState("auto");
  const busyRef = useRef(null),
    bottom = useRef(),
    composerInput = useRef();
  const lang = data?.settings.language || "zh",
    t = strings[lang] || strings.zh;
  const refresh = async () => {
    const d = await api.snapshot();
    setData(d);
    return d;
  };
  const flash = (s) => {
    setToast(s);
  };
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (!api) return;
    refresh();
    return api.subscribe((e) => {
      if (e.stage === "refresh") refresh();
      if (e.stage === "import") {
        setStatus(e);
        setImporting(true);
      }
      if (e.stage === "ready") {
        setImporting(false);
        setStatus(null);
        refresh();
      }
      if (e.stage === "warning") flash(e.message);
      if (e.stage === "network") setNetworkStatus(e.route);
      if (!e.requestId || e.requestId !== busyRef.current?.requestId) return;
      setStatus(e);
      const activeId = busyRef.current.chatId;
      if (e.stage === "message") {
        setData((d) => ({
          ...d,
          chats: d.chats.map((c) =>
            c.id === activeId
              ? { ...c, title: e.title, messages: e.messages }
              : c,
          ),
        }));
      }
      if (
        e.stage === "delta" ||
        e.stage === "sources" ||
        e.stage === "text" ||
        e.stage === "artifact"
      )
        setData((d) => {
          if (!d) return d;
          const next = {
            ...d,
            chats: d.chats.map((c) => {
              if (c.id !== activeId) return c;
              const messages = [...c.messages],
                last = { ...messages.at(-1) };
              if (last.role !== "assistant") return c;
              if (e.stage === "delta") last.text += e.delta;
              if (e.stage === "sources") last.sources = e.sources;
              if (e.stage === "text") last.text = e.text;
              if (e.stage === "artifact")
                last.artifacts = [...(last.artifacts || []), e.asset.id];
              messages[messages.length - 1] = last;
              return { ...c, messages };
            }),
          };
          if (e.stage === "artifact") next.assets = [...d.assets, e.asset];
          return next;
        });
      if (e.stage === "done" || e.stage === "error") {
        if (e.stage === "error") flash(e.message);
        busyRef.current = null;
        setBusy(null);
        setStatus(null);
        refresh();
      }
    });
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.chats, busy, status]);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  }, [lang]);
  useEffect(() => {
    if (chatId) localStorage.setItem("activeChatId", chatId);
    else localStorage.removeItem("activeChatId");
  }, [chatId]);
  const kind = ["image", "video"].includes(mode) ? mode : "chat";
  const models = data?.settings.models.filter((m) => m.kind === kind) || [];
  useEffect(() => {
    if (!models.some((m) => m.id === modelId))
      setModelId(
        models.find((m) => m.id === data?.settings.defaultModels?.[kind])?.id ||
          models[0]?.id ||
          "",
      );
  }, [kind, data?.settings.models]);
  if (!api)
    return (
      <div className="desktop-only">
        WorldModel Studio
        <br />
        请通过 Electron 桌面应用启动 · Run <code>npm run dev</code>
      </div>
    );
  if (!data)
    return (
      <div className="loading">
        <LoaderCircle className="spin" /> WorldModel Studio
      </div>
    );
  const controlKind = mode === "image" ? "image" : "video";
  const targetModel =
    mode === "image" || mode === "video"
      ? models.find((m) => m.id === modelId)
      : data.settings.models.find(
          (m) =>
            m.kind === "video" && m.id === data.settings.defaultModels?.video,
        ) || data.settings.models.find((m) => m.kind === "video");
  const choices = mediaChoices(targetModel);
  const preferred = data.settings.mediaPreferences?.[controlKind] || {};
  const mediaOptions = {
    aspectRatio: choices.ratios.includes(preferred.aspectRatio)
      ? preferred.aspectRatio
      : "auto",
    ...(controlKind === "video"
      ? {
          durationSeconds: choices.durations.includes(preferred.durationSeconds)
            ? preferred.durationSeconds
            : "auto",
        }
      : {}),
  };
  const changeMediaOption = async (key, value) => {
    try {
      setData(
        await api.settings({
          mediaPreferences: {
            ...data.settings.mediaPreferences,
            [controlKind]: { ...mediaOptions, [key]: value },
          },
        }),
      );
    } catch (error) {
      flash(error.message);
    }
  };
  const chat = data.chats.find((c) => c.id === chatId);
  const guard =
    (fn) =>
    async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        flash(e.message);
      }
    };
  const createChat = async () => {
    const c = await api.newChat();
    await refresh();
    setChatId(c.id);
    setView("chat");
    setDraft("");
    setPending([]);
    return c.id;
  };
  const switchChat = (id) => {
    setChatId(id);
    setView("chat");
    setDraft("");
    const savedChat = data.chats.find((c) => c.id === id);
    const sentIds = new Set(
      savedChat?.messages.flatMap((m) => m.attachments || []) || [],
    );
    setPending(
      data.assets
        .filter((a) => a.owner === id && !a.generated && !sentIds.has(a.id))
        .map((a) => a.id),
    );
  };
  const ensureChat = async () =>
    chatId && data.chats.some((c) => c.id === chatId)
      ? chatId
      : await createChat();
  const attach = guard(async (files, imagesOnly = false) => {
    if (importing) return;
    setImporting(true);
    try {
      const owner = await ensureChat();
      const before = new Set((await api.snapshot()).assets.map((a) => a.id));
      const next = files
        ? await api.importFiles(
            await Promise.all(
              [...files].map(async (f) => ({
                name: f.name,
                mime: f.type,
                bytes: Array.from(new Uint8Array(await f.arrayBuffer())),
                owner,
              })),
            ),
          )
        : await api.pick(owner, imagesOnly ? "images" : undefined);
      setData(next);
      setPending((p) => [
        ...p,
        ...next.assets
          .filter((a) => a.owner === owner && !before.has(a.id))
          .map((a) => a.id),
      ]);
    } finally {
      setImporting(false);
      setStatus(null);
    }
  });
  const importDocs = guard(async () => {
    setImporting(true);
    try {
      setData(await api.pick(null));
    } finally {
      setImporting(false);
    }
  });
  const submit = guard(async (value = draft) => {
    if (!value.trim() || busy || importing) return;
    if (!data.settings.hasKey) {
      setSettings(true);
      flash(t.noKey);
      return;
    }
    if (!modelId) {
      flash(t.missingModel);
      return;
    }
    const text = value.trim(),
      attachments = [...pending];
    const id = await ensureChat();
    const requestId = crypto.randomUUID();
    const job = { requestId, chatId: id, mode };
    busyRef.current = job;
    setBusy(job);
    setStatus({ stage: "retrieving" });
    setDraft("");
    setPending([]);
    try {
      await api.run({
        requestId,
        chatId: id,
        text,
        attachments,
        mode,
        modelId,
        mediaOptions,
        targetVideoModelId: targetModel?.id,
      });
    } catch (e) {
      busyRef.current = null;
      setBusy(null);
      throw e;
    }
  });
  const paste = (e) => {
    const files = [...e.clipboardData.items]
      .filter((i) => i.kind === "file")
      .map((i) => i.getAsFile())
      .filter(Boolean);
    if (files.length) {
      e.preventDefault();
      attach(files);
    }
  };
  const drop = (e) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files.length) attach(e.dataTransfer.files);
  };
  const copy = guard(async (text, id) => {
    await api.copy({ text, id });
    flash(
      id && data.assets.find((a) => a.id === id)?.mime.startsWith("video/")
        ? navigator.platform.includes("Mac")
          ? t.fileCopy
          : t.copyPath
        : t.copied,
    );
  });
  const deleteChats = guard(async () => {
    if (!selected.length || !confirm(t.deleteConfirm)) return;
    const next = await api.deleteChats(selected);
    setData(next);
    if (selected.includes(chatId)) {
      setChatId(null);
      setPending([]);
    }
    setSelected([]);
  });
  const usePrompt = (text) => {
    setMode("video");
    setDraft(text);
    setView("chat");
    composerInput.current?.focus();
  };
  const useReference = guard(async (id, targetMode) => {
    const owner = await ensureChat();
    const result = await api.referenceAsset(id, owner);
    setData(result.snapshot);
    setPending((p) => [...p, result.assetId]);
    setMode(targetMode);
    setView("chat");
    setViewingImage(null);
    composerInput.current?.focus();
  });
  const assetCard = (id, compact = false) => {
    const a = data.assets.find((a) => a.id === id);
    if (!a) return null;
    return (
      <div className={compact ? "attachment" : "artifact-card"} key={id}>
        {a.mime.startsWith("image/") ? (
          <button
            className="image-preview"
            title={t.viewImage}
            onClick={() => setViewingImage(a)}
          >
            <img src={url(id)} alt={a.name} />
          </button>
        ) : a.mime.startsWith("video/") ? (
          <video
            src={url(id)}
            controls={!compact}
            muted={compact}
            preload="metadata"
          />
        ) : a.thumbnail ? (
          <img src={url(id, true)} alt={a.name} />
        ) : (
          <div className="file-icon">
            <FileText size={compact ? 24 : 40} />
          </div>
        )}
        <div className="asset-caption">
          <span title={a.name}>{a.name}</span>
          {!compact && (
            <small>
              {a.prompt?.slice(0, 120) || `${Math.round(a.size / 1024)} KB`}
            </small>
          )}
        </div>
        {compact ? (
          <button
            className="remove-chip"
            title={t.remove}
            aria-label={t.remove}
            onClick={guard(async () => {
              await api.removeAttachment(id);
              setPending((p) => p.filter((x) => x !== id));
              await refresh();
            })}
          >
            <X size={12} />
          </button>
        ) : (
          <div className="asset-actions">
            {a.mime.startsWith("image/") && (
              <>
                <button onClick={() => useReference(id, "image")}>
                  <ImagePlus size={14} />
                  {t.referenceImage}
                </button>
                <button onClick={() => useReference(id, "video")}>
                  <Video size={14} />
                  {t.referenceVideo}
                </button>
              </>
            )}
            <button onClick={() => copy(undefined, id)}>
              <Copy size={14} />
              {t.copy}
            </button>
            <button onClick={guard(() => api.download(id))}>
              <Download size={14} />
              {t.download}
            </button>
          </div>
        )}
      </div>
    );
  };
  return (
    <div
      className={`app ${collapsed ? "collapsed" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes("Files")) setDrag(true);
      }}
      onDrop={drop}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false);
      }}
    >
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            w<span>m</span>
            <i />
          </div>
          <div>
            WorldModel<small>STUDIO</small>
          </div>
          <button
            className="icon collapse"
            title={t.close}
            onClick={() => setCollapsed(!collapsed)}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <button className="new-chat" onClick={guard(createChat)}>
          <Plus size={18} />
          {t.newChat}
        </button>
        <nav>
          {[
            ["chat", MessageSquare],
            ["library", Library],
            ["artifacts", Clapperboard],
            ["history", History],
          ].map(([v, Icon]) => (
            <button
              key={v}
              className={view === v ? "active" : ""}
              onClick={() => setView(v)}
            >
              <Icon size={18} />
              <span>{t[v]}</span>
              {v === "library" && (
                <small>{data.docs.length + (data.builtin?.length || 0)}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="recent-label">{t.recent}</div>
        <div className="recent-list">
          {data.chats.length ? (
            data.chats
              .slice()
              .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))
              .slice(0, 18)
              .map((c) => (
                <div
                  className={`recent-row ${chatId === c.id && view === "chat" ? "current" : ""}`}
                  key={c.id}
                >
                  <button
                    className="recent-title"
                    onClick={() => switchChat(c.id)}
                  >
                    {c.pinned ? <Pin size={13} /> : <MessageSquare size={14} />}
                    <span>{c.title || t.untitled}</span>
                  </button>
                  <div className="recent-actions">
                    <button
                      title={c.pinned ? t.unpin : t.pin}
                      aria-label={c.pinned ? t.unpin : t.pin}
                      onClick={guard(async () =>
                        setData(await api.pinChat(c.id, !c.pinned)),
                      )}
                    >
                      {c.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                    </button>
                    <button
                      title={t.delete}
                      aria-label={`${t.delete} ${c.title || t.untitled}`}
                      onClick={guard(async () => {
                        if (!confirm(t.deleteChatConfirm)) return;
                        setData(await api.deleteChats([c.id]));
                        if (chatId === c.id) {
                          setChatId(null);
                          setPending([]);
                          setDraft("");
                        }
                      })}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
          ) : (
            <p>{t.emptyChats}</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className="status-dot" />
            <span>{t.local}</span>
            <small>{data.chunkCount}</small>
          </div>
          <button className="settings-button" onClick={() => setSettings(true)}>
            <Settings size={17} />
            {t.settings}
            <Globe size={15} />
          </button>
          <div className="profile">
            <span>W</span>
            <div>
              WorldModel Studio<small>{t.savedLocal}</small>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            {collapsed && (
              <button className="icon" onClick={() => setCollapsed(false)}>
                <PanelLeftClose size={17} />
              </button>
            )}
            <span>{t.workspace}</span>
            <span className="slash">/</span>
            <strong>{view === "chat" ? chat?.title || t.chat : t[view]}</strong>
          </div>
          <div className="topbar-right">
            <span className="network-indicator">
              <Wifi size={12} />
              {t["network_" + networkStatus]}
            </span>
            <span className="quiet-pill">
              <span className="status-dot" />
              {t.grounded}
            </span>
            <button
              className="icon"
              title={t.settings}
              onClick={() => setSettings(true)}
            >
              <Settings size={17} />
            </button>
          </div>
        </header>
        <div className={`workspace ${view === "chat" ? "with-sources" : ""}`}>
          <section className="content">
            {view === "chat" ? (
              <>
                <div className="conversation">
                  {!chat?.messages.length ? (
                    <div className="welcome">
                      <div className="eyebrow">
                        <span />
                        {t.local}
                      </div>
                      <h1>{t.hero}</h1>
                      <p>{t.intro}</p>
                      <div className="starter-grid">
                        {[
                          ["ask", Search, "seedAsk"],
                          ["suggest", Sparkles, "seedSuggest"],
                          ["prompt", Clapperboard, "seedPrompt"],
                        ].map(([m, Icon, seed]) => (
                          <button
                            key={m}
                            onClick={() => {
                              setMode(m);
                              setDraft(t[seed]);
                            }}
                          >
                            <Icon size={22} />
                            <strong>{t[m]}</strong>
                            <span>{t[m + "Desc"]}</span>
                            <ArrowUpRight size={16} />
                          </button>
                        ))}
                      </div>
                      <div className="reading-label">
                        <BookOpen size={15} />
                        {t.knowledge}
                        <span>
                          {data.docs.length + (data.builtin?.length || 0)}
                        </span>
                      </div>
                      {data.builtin?.length > 0 && (
                        <div className="builtin-welcome">
                          <div className="builtin-symbol">
                            <Sparkles size={26} />
                          </div>
                          <div>
                            <strong>{t.builtin}</strong>
                            <span>{t.builtinDesc}</span>
                          </div>
                          <Check size={17} />
                        </div>
                      )}
                      {data.docs.slice(0, 2).map((d) => (
                        <button
                          className="featured-book"
                          key={d.id}
                          onClick={guard(() => api.openSource(d.id))}
                        >
                          {d.thumbnail ? (
                            <img src={url(d.id, true)} alt="PDF cover" />
                          ) : (
                            <FileText size={32} />
                          )}
                          <div>
                            <small>
                              PDF · {d.pages || "—"} {t.pages}
                            </small>
                            <strong>{d.name.replace(/\.pdf$/i, "")}</strong>
                            <span>{d.warning || t.ready}</span>
                          </div>
                          <ArrowUpRight size={18} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="messages">
                      {chat.messages.map((m) => (
                        <article className={`message ${m.role}`} key={m.id}>
                          <div className="avatar">
                            {m.role === "user" ? "U" : <span>w</span>}
                          </div>
                          <div className="message-body">
                            <div className="message-meta">
                              <strong>
                                {m.role === "user" ? t.you : t.assistant}
                              </strong>
                              <time>
                                {new Date(m.createdAt).toLocaleTimeString(
                                  lang,
                                  { hour: "2-digit", minute: "2-digit" },
                                )}
                              </time>
                              {m.mode && <small>{t[m.mode]}</small>}
                              {m.role === "assistant" && m.text && (
                                <button
                                  className="message-copy"
                                  title={t.copy}
                                  onClick={() => copy(m.text)}
                                >
                                  <Copy size={13} />
                                  {t.copy}
                                </button>
                              )}
                            </div>
                            <div className="markdown">
                              <Markdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  pre: ({ node, children }) => {
                                    const text =
                                      node.children[0]?.children
                                        ?.map((child) => child.value || "")
                                        .join("") || "";
                                    return (
                                      <div className="prompt-code">
                                        <div className="prompt-code-actions">
                                          <button onClick={() => copy(text)}>
                                            <Copy size={13} />
                                            {t.copy}
                                          </button>
                                          <button
                                            onClick={() => usePrompt(text)}
                                          >
                                            <ArrowRight size={13} />
                                            {t.fillComposer}
                                          </button>
                                        </div>
                                        <pre>{children}</pre>
                                      </div>
                                    );
                                  },
                                  a: ({ children, href }) => (
                                    <a
                                      className="markdown-link"
                                      href={href}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        api
                                          .external(href)
                                          .catch((error) =>
                                            flash(error.message),
                                          );
                                      }}
                                    >
                                      {children}
                                    </a>
                                  ),
                                }}
                              >
                                {m.text}
                              </Markdown>
                            </div>
                            {m.attachments?.length > 0 && (
                              <div className="sent-attachments">
                                {m.attachments.map((id) => {
                                  const a = data.assets.find(
                                    (a) => a.id === id,
                                  );
                                  return a ? (
                                    <button
                                      key={id}
                                      onClick={guard(() => api.openSource(id))}
                                    >
                                      {a.mime.startsWith("image/") ? (
                                        <button
                                          className="image-preview"
                                          title={t.viewImage}
                                          onClick={() => setViewingImage(a)}
                                        >
                                          <img src={url(id)} alt={a.name} />
                                        </button>
                                      ) : (
                                        <FileText size={16} />
                                      )}
                                      <span>{a.name}</span>
                                    </button>
                                  ) : null;
                                })}
                              </div>
                            )}
                            {m.artifacts?.length > 0 && (
                              <div className="artifact-grid">
                                {m.artifacts.map((id) => assetCard(id))}
                              </div>
                            )}
                            {m.error && <p className="error-text">{m.error}</p>}
                            {m.sources?.length > 0 && (
                              <div className="citations">
                                {m.sources.map((s) => (
                                  <button
                                    key={s.tag}
                                    onClick={() => setReference(s)}
                                  >
                                    <BookOpen size={12} />
                                    <b>{s.tag}</b>
                                    <span>{s.label}</span>
                                    <small>p. {s.page}</small>
                                  </button>
                                ))}
                              </div>
                            )}
                            {m.role === "assistant" && m.text && (
                              <div className="message-actions">
                                <button onClick={() => usePrompt(m.text)}>
                                  <Video size={14} />
                                  {t.usePrompt}
                                </button>
                              </div>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  {busy?.chatId === chatId && (
                    <div className="working">
                      <LoaderCircle size={16} className="spin" />
                      {status?.stage === "embedding"
                        ? `${t.embeddingProgress} ${status.done}/${status.total}`
                        : status?.stage === "media-job"
                          ? `${t.video} · ${status.status}`
                          : status?.stage === "generating" &&
                              busy.mode === "video"
                            ? t.generatingVideo
                            : status?.stage === "generating" &&
                                busy.mode === "image"
                              ? t.generatingImage
                              : t.working}
                    </div>
                  )}
                  <div ref={bottom} />
                </div>
                <div className="composer-area">
                  {!data.settings.hasKey && (
                    <div className="key-banner">
                      <KeyRound size={16} />
                      <span>{t.keyMissing}</span>
                      <button onClick={() => setSettings(true)}>
                        {t.settings}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                  <div className="composer">
                    <div className="mode-tabs">
                      {[
                        ["ask", MessageSquare],
                        ["suggest", Sparkles],
                        ["prompt", Clapperboard],
                        ["image", ImageIcon],
                        ["video", Video],
                      ].map(([m, Icon]) => (
                        <button
                          key={m}
                          className={mode === m ? "active" : ""}
                          onClick={() => setMode(m)}
                        >
                          <Icon size={14} />
                          {t[m]}
                        </button>
                      ))}
                    </div>
                    {["image", "video", "prompt", "suggest"].includes(mode) && (
                      <div className="media-controls">
                        <label>
                          {t.aspectRatio}
                          <select
                            aria-label={t.aspectRatio}
                            value={mediaOptions.aspectRatio}
                            onChange={(e) =>
                              changeMediaOption("aspectRatio", e.target.value)
                            }
                          >
                            {choices.ratios.map((r) => (
                              <option key={r} value={r}>
                                {r === "auto" ? t.automatic : r}
                              </option>
                            ))}
                          </select>
                        </label>
                        {controlKind === "video" && (
                          <label>
                            {t.duration}
                            <select
                              aria-label={t.duration}
                              value={mediaOptions.durationSeconds}
                              onChange={(e) =>
                                changeMediaOption(
                                  "durationSeconds",
                                  e.target.value === "auto"
                                    ? "auto"
                                    : Number(e.target.value),
                                )
                              }
                            >
                              {choices.durations.map((d) => (
                                <option key={d} value={d}>
                                  {d === "auto"
                                    ? t.automatic
                                    : `${d} ${t.seconds}`}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <button
                          disabled={importing}
                          onClick={() => attach(undefined, true)}
                        >
                          <ImagePlus size={14} />
                          {t.addReference}
                        </button>
                      </div>
                    )}
                    {pending.length > 0 && (
                      <div className="pending">
                        {pending.map((id) => assetCard(id, true))}
                      </div>
                    )}
                    <textarea
                      ref={composerInput}
                      aria-label={t.placeholder}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onPaste={paste}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          submit();
                        }
                      }}
                      placeholder={t.placeholder}
                    />
                    <div className="composer-tools">
                      <button
                        className="icon attach"
                        title={t.attach}
                        disabled={importing}
                        onClick={() => attach()}
                      >
                        <Paperclip size={19} />
                      </button>
                      <label className="model-select">
                        <select
                          aria-label={t.model}
                          value={modelId}
                          onChange={(e) => {
                            setModelId(e.target.value);
                            api
                              .settings({
                                defaultModels: {
                                  ...data.settings.defaultModels,
                                  [kind]: e.target.value,
                                },
                              })
                              .then(setData)
                              .catch((error) => flash(error.message));
                          }}
                        >
                          {!models.length && (
                            <option value="">{t.noModel}</option>
                          )}
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={12} />
                      </label>
                      {kind === "chat" && (
                        <label
                          className="reasoning-select"
                          title={t.reasoningNote}
                        >
                          <Sparkles size={12} />
                          <select
                            aria-label={t.reasoning}
                            value={data.settings.reasoningEffort || "auto"}
                            onChange={(e) => {
                              api
                                .settings({ reasoningEffort: e.target.value })
                                .then(setData)
                                .catch((error) => flash(error.message));
                            }}
                          >
                            {[
                              "auto",
                              "none",
                              "minimal",
                              "low",
                              "medium",
                              "high",
                              "xhigh",
                            ].map((e) => (
                              <option key={e} value={e}>
                                {t.reasoning} · {t["effort_" + e]}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <span className="composer-spacer" />
                      {importing && (
                        <span className="import-status">
                          <LoaderCircle size={13} className="spin" />
                          {t.importing}
                          {status?.page
                            ? ` ${status.page}/${status.total}`
                            : ""}
                        </span>
                      )}
                      {busy ? (
                        <button
                          className="send stop"
                          title={t.stop}
                          onClick={guard(() => api.stop(busy.requestId))}
                        >
                          <Square size={17} />
                        </button>
                      ) : (
                        <button
                          className="send"
                          title={t.send}
                          disabled={!draft.trim() || importing || !modelId}
                          onClick={() => submit()}
                        >
                          <ArrowUp size={20} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="composer-hint">{t.hint}</p>
                </div>
              </>
            ) : view === "library" ? (
              <div className="page">
                <div className="page-heading">
                  <div>
                    <small>WORLD / KNOWLEDGE</small>
                    <h1>{t.library}</h1>
                    <p>{t.knowledgeDesc}</p>
                  </div>
                  <button
                    className="primary"
                    disabled={importing}
                    onClick={importDocs}
                  >
                    <Plus size={16} />
                    {t.addDocs}
                  </button>
                </div>
                {data.builtin?.length > 0 && (
                  <div className="builtin-library">
                    <Sparkles size={22} />
                    <div>
                      <strong>{t.builtin}</strong>
                      <p>{t.builtinDesc}</p>
                    </div>
                    <span className="status-dot" />
                  </div>
                )}
                <div className="library-grid">
                  {data.docs.map((d) => (
                    <div className="document-card" key={d.id}>
                      <button
                        className="document-cover"
                        onClick={guard(() => api.openSource(d.id))}
                      >
                        {d.thumbnail ? (
                          <img src={url(d.id, true)} alt={d.name} />
                        ) : (
                          <FileText size={48} />
                        )}
                      </button>
                      <div className="document-info">
                        <strong>{d.name}</strong>
                        <small>
                          {d.pages || 1} {t.pages} ·{" "}
                          {(d.size / 1024 / 1024).toFixed(1)} MB
                        </small>
                        <span>{d.warning || t.ready}</span>
                        <button
                          className="icon danger"
                          title={t.deleteSource}
                          onClick={guard(async () => {
                            if (confirm(t.deleteDocConfirm)) {
                              await api.deleteDoc(d.id);
                              await refresh();
                            }
                          })}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {!data.docs.length && !data.builtin?.length && (
                  <div className="empty">
                    <Library size={36} />
                    {t.emptyDocs}
                  </div>
                )}
                <p className="footnote">{t.textOnly}</p>
              </div>
            ) : view === "artifacts" ? (
              <div className="page">
                <div className="page-heading">
                  <div>
                    <small>WORLD / CREATIONS</small>
                    <h1>{t.artifacts}</h1>
                    <p>{t.savedLocal}</p>
                  </div>
                </div>
                <div className="artifact-grid">
                  {data.assets
                    .filter((a) => a.generated)
                    .map((a) => assetCard(a.id))}
                </div>
                {!data.assets.some((a) => a.generated) && (
                  <div className="empty">
                    <Clapperboard size={36} />
                    {t.emptyArtifacts}
                  </div>
                )}
              </div>
            ) : (
              <div className="page">
                <div className="page-heading">
                  <div>
                    <small>WORLD / HISTORY</small>
                    <h1>{t.history}</h1>
                    <p>{t.knowledgeDesc}</p>
                  </div>
                </div>
                <div className="history-toolbar">
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        !!data.chats.length &&
                        selected.length === data.chats.length
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? data.chats.map((c) => c.id) : [],
                        )
                      }
                    />
                    {t.selectAll}
                  </label>
                  <span>
                    {selected.length} {t.selected}
                  </span>
                  <button
                    disabled={!selected.length}
                    onClick={guard(async () => {
                      if (await api.export(selected)) flash(t.exported);
                    })}
                  >
                    <Download size={15} />
                    {t.export}
                  </button>
                  <button
                    className="danger"
                    disabled={!selected.length}
                    onClick={deleteChats}
                  >
                    <Trash2 size={15} />
                    {t.delete}
                  </button>
                </div>
                {data.chats.map((c) => (
                  <div className="history-row" key={c.id}>
                    <input
                      type="checkbox"
                      aria-label={c.title || t.untitled}
                      checked={selected.includes(c.id)}
                      onChange={(e) =>
                        setSelected((p) =>
                          e.target.checked
                            ? [...p, c.id]
                            : p.filter((id) => id !== c.id),
                        )
                      }
                    />
                    <button onClick={() => switchChat(c.id)}>
                      <MessageSquare size={19} />
                      <div>
                        <strong>{c.title || t.untitled}</strong>
                        <span>
                          {
                            c.messages.filter((m) => m.role === "user").at(-1)
                              ?.text
                          }
                        </span>
                      </div>
                      <time>
                        {new Date(c.createdAt).toLocaleDateString(lang)}
                      </time>
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                ))}
                {!data.chats.length && (
                  <div className="empty">
                    <History size={36} />
                    {t.emptyHistory}
                  </div>
                )}
              </div>
            )}
          </section>
          {view === "chat" && (
            <aside className="sources-panel">
              <div className="source-heading">
                <BookOpen size={17} />
                <strong>{t.knowledge}</strong>
                <span>{data.docs.length + (data.builtin?.length || 0)}</span>
              </div>
              <p>{t.knowledgeDesc}</p>
              <button
                className="add-source"
                disabled={importing}
                onClick={importDocs}
              >
                <Plus size={16} />
                {t.addDocs}
              </button>
              <div className="source-list">
                {data.builtin?.length > 0 && (
                  <div className="builtin-source">
                    <Sparkles size={22} />
                    <div>
                      <strong>{t.builtin}</strong>
                      <small>{t.builtinDesc}</small>
                    </div>
                    <Check size={14} />
                  </div>
                )}
                {data.docs.map((d) => (
                  <button
                    className="source-item"
                    key={d.id}
                    onClick={guard(() => api.openSource(d.id))}
                  >
                    {d.thumbnail ? (
                      <img src={url(d.id, true)} alt="" />
                    ) : (
                      <FileText size={25} />
                    )}
                    <div>
                      <strong>{d.name}</strong>
                      <small>
                        PDF · {d.pages || 1} {t.pages}
                      </small>
                    </div>
                    <span className="status-dot" />
                  </button>
                ))}
              </div>
              <div className="knowledge-summary">
                <span className="status-dot" />
                {importing ? t.importing : t.ready}
                <small>
                  {data.chunkCount} {t.chunks}
                </small>
              </div>
              <div className="source-footer">
                <div className="orbit">
                  <span />
                  <i />
                  <b />
                </div>
                <strong>{t.followup}</strong>
                <p>{t.savedLocal}</p>
              </div>
            </aside>
          )}
        </div>
      </main>
      {viewingImage && (
        <ImageViewer
          asset={viewingImage}
          t={t}
          onClose={() => setViewingImage(null)}
          onDownload={guard(() => api.download(viewingImage.id))}
          onReference={(mode) => useReference(viewingImage.id, mode)}
        />
      )}
      {settings && (
        <SettingsDialog
          data={data}
          t={t}
          onClose={() => setSettings(false)}
          onSave={async (d) => {
            await api.settings(d);
            await refresh();
            flash(t.saved);
            setSettings(false);
          }}
          flash={flash}
        />
      )}
      {reference && (
        <div className="modal-backdrop" onClick={() => setReference(null)}>
          <div className="reference-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <div>
                <small>
                  {reference.tag} · p. {reference.page}
                </small>
                <h2>{t.reference}</h2>
              </div>
              <button
                className="icon"
                aria-label={t.close}
                onClick={() => setReference(null)}
              >
                <X size={20} />
              </button>
            </div>
            <strong>{reference.label}</strong>
            <p>{reference.excerpt}</p>
            {data.assets.some((a) => a.id === reference.id) ? (
              <button
                className="primary"
                onClick={guard(() => api.openSource(reference.id))}
              >
                <ExternalLink size={15} />
                {t.source}
              </button>
            ) : (
              <small>
                {reference.id === "builtin-theory"
                  ? t.builtin
                  : data.chats.some((c) => c.id === reference.id)
                    ? t.history
                    : t.sourceGone}
              </small>
            )}
          </div>
        </div>
      )}
      {drag && (
        <div className="drop-overlay">
          <div>
            <Paperclip size={44} />
            <h2>{t.drop}</h2>
            <p>PDF · TXT · Markdown · PNG · JPG · MP4</p>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon"
            aria-label={t.close}
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
function SettingsDialog({ data, t, onClose, onSave, flash }) {
  const [form, setForm] = useState({ ...data.settings, apiKey: "" }),
    [show, setShow] = useState(false),
    [testing, setTesting] = useState(false),
    [saving, setSaving] = useState(false),
    [testResult, setTestResult] = useState("");
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const updateModel = (index, key, value) =>
    setForm((f) => ({
      ...f,
      models: f.models.map((m, i) =>
        i === index ? normalizeMediaModel({ ...m, [key]: value }) : m,
      ),
    }));
  const save = async () => {
    const ids = form.models.map((model) => model.id.trim());
    if (
      form.models.some((model) => !model.id.trim() || !model.name.trim()) ||
      new Set(ids).size !== ids.length
    ) {
      flash(t.invalidModels);
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } catch (e) {
      flash(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t.settings}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-title">
          <div>
            <small>WORLD / PREFERENCES</small>
            <h2>{t.settings}</h2>
          </div>
          <button className="icon" aria-label={t.close} onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="settings-body">
          <div className="setting-line">
            <label>
              <Globe size={17} />
              {t.language}
            </label>
            <select
              aria-label={t.language}
              value={form.language}
              onChange={(e) => update("language", e.target.value)}
            >
              <option value="zh">简体中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </div>
          <div className="settings-section">
            <h3>
              <KeyRound size={17} />
              ZenMux
            </h3>
            <label className="field">
              {t.apiKey}
              <div className="key-input">
                <input
                  aria-label={t.apiKey}
                  type={show ? "text" : "password"}
                  value={form.apiKey}
                  autoComplete="off"
                  spellCheck="false"
                  placeholder={data.settings.hasKey ? t.keyStored : t.keyNew}
                  onChange={(e) => update("apiKey", e.target.value)}
                />
                <button
                  className="icon"
                  aria-label={show ? t.hide : t.show}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            <p className="field-hint">{t.security}</p>
            {data.settings.hasKey && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={!!form.clearKey}
                  onChange={(e) => update("clearKey", e.target.checked)}
                />
                {t.removeKey}
              </label>
            )}
            <label className="field">
              {t.baseUrl}
              <input
                aria-label={t.baseUrl}
                value={form.baseUrl}
                onChange={(e) => update("baseUrl", e.target.value)}
              />
            </label>
            <div className="connect-row">
              <button
                disabled={testing}
                onClick={async () => {
                  setTesting(true);
                  setTestResult("");
                  try {
                    const r = await api.connection({
                      baseUrl: form.baseUrl,
                      apiKey: form.apiKey,
                      networkMode: form.networkMode || "auto",
                      proxyUrl: form.proxyUrl || "",
                    });
                    setTestResult(`${t.connected} ${r.count}`);
                    if (form.models.some((m) => !r.ids.includes(m.id)))
                      flash(t.apiUnlisted);
                  } catch (e) {
                    setTestResult(e.message);
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                {testing ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Check size={15} />
                )}{" "}
                {testing ? t.testing : t.test}
              </button>
              <span>{testResult}</span>
            </div>
            <div className="invite">
              {t.keyHint}
              <button
                onClick={() => api.external("https://zenmux.ai/invite/GBQMC5")}
              >
                {t.invite}
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
          <div className="settings-section">
            <h3>
              <Wifi size={17} />
              {t.networkSettings}
            </h3>
            <label className="field">
              {t.networkMode}
              <select
                aria-label={t.networkMode}
                value={form.networkMode || "auto"}
                onChange={(e) => update("networkMode", e.target.value)}
              >
                <option value="auto">{t.network_auto}</option>
                <option value="direct">{t.network_direct}</option>
                <option value="system">{t.networkSystem}</option>
                <option value="proxy">{t.networkCustom}</option>
              </select>
            </label>
            {form.networkMode === "proxy" && (
              <label className="field">
                {t.proxyUrl}
                <input
                  aria-label={t.proxyUrl}
                  value={form.proxyUrl || ""}
                  placeholder="http://127.0.0.1:7890"
                  spellCheck={false}
                  onChange={(e) => update("proxyUrl", e.target.value)}
                />
              </label>
            )}
            <p className="field-hint">{t.networkHint}</p>
          </div>
          <div className="settings-section">
            <div className="section-title">
              <h3>{t.models}</h3>
              <button
                onClick={() =>
                  update("models", [
                    ...form.models,
                    { id: "", name: "", kind: "chat", protocol: "chat" },
                  ])
                }
              >
                <Plus size={15} />
                {t.addModel}
              </button>
            </div>
            <p className="field-hint">{t.modelNote}</p>
            <div className="model-head">
              <span>{t.kind}</span>
              <span>{t.modelName}</span>
              <span>{t.modelId}</span>
              <span>{t.protocol}</span>
              <span />
            </div>
            {form.models.map((m, i) => (
              <div className="model-row" key={i}>
                <select
                  aria-label={`${t.kind} ${i + 1}`}
                  value={m.kind}
                  onChange={(e) => updateModel(i, "kind", e.target.value)}
                >
                  {["chat", "image", "video", "embedding"].map((k) => (
                    <option key={k} value={k}>
                      {k === "chat" ? t.chatMode : t[k]}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`${t.modelName} ${i + 1}`}
                  value={m.name}
                  onChange={(e) => updateModel(i, "name", e.target.value)}
                />
                <input
                  aria-label={`${t.modelId} ${i + 1}`}
                  value={m.id}
                  onChange={(e) => updateModel(i, "id", e.target.value)}
                />
                {["image", "video"].includes(m.kind) ? (
                  <select
                    aria-label={`${t.protocol} ${i + 1}`}
                    value={normalizeMediaModel(m).protocol}
                    onChange={(e) => updateModel(i, "protocol", e.target.value)}
                  >
                    {protocolOptions(m).map((protocol) => (
                      <option key={protocol.id} value={protocol.id}>
                        {protocol.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="muted">—</span>
                )}
                <button
                  className="icon danger"
                  aria-label={`${t.delete} ${m.name}`}
                  onClick={() =>
                    update(
                      "models",
                      form.models.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <label className="field">
              {t.embeddingModel}
              <select
                value={
                  form.embeddingModel ||
                  form.models.find((m) => m.kind === "embedding")?.id ||
                  ""
                }
                onChange={(e) => update("embeddingModel", e.target.value)}
              >
                {form.models
                  .filter((m) => m.kind === "embedding")
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                {!form.models.some((m) => m.kind === "embedding") && (
                  <option value="">—</option>
                )}
              </select>
            </label>
          </div>
        </div>
        <footer className="modal-footer">
          <button onClick={onClose}>{t.cancel}</button>
          <button className="primary" disabled={saving} onClick={save}>
            {saving ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Check size={15} />
            )}{" "}
            {t.save}
          </button>
        </footer>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
