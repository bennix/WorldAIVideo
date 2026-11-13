export * from "./media-protocols.mjs";
export * from "./media-controls.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const defaults = {
  baseUrl: "https://zenmux.ai/api/v1",
  language: "zh",
  defaultModels: { chat: "openai/gpt-6.1-sol" },
  reasoningEffort: "auto",
  networkMode: "auto",
  proxyUrl: "",
  mediaPreferences: {
    image: { aspectRatio: "auto" },
    video: { aspectRatio: "16:9", durationSeconds: 10 },
  },
  embeddingModel: "openai/text-embedding-3-large",
  models: [
    ...[
      "google/gemini-4-carbon",
      "openai/gpt-6.1-terra",
      "anthropic/claude-haiku-5.5",
      "openai/gpt-6.1-sol",
      "anthropic/claude-sonnet-5.5",
    ].map((id) => ({ id, name: id.split("/")[1], kind: "chat" })),
    {
      id: "google/gemini-omni-1.2-flash",
      name: "Gemini Omni 1.2 Flash",
      kind: "video",
      protocol: "interactions",
    },
    ...[
      "openai/gpt-image-2.6-flare",
      "openai/gpt-image-2.6-sunburst",
      "google/gemini-nano-banana-2.1",
    ].map((id) => ({
      id,
      name: id.split("/")[1],
      kind: "image",
      protocol: id.startsWith("openai/") ? "images" : "gemini",
    })),
    ...["google/gemini-embedding-2", "openai/text-embedding-3-large"].map(
      (id) => ({ id, name: id.split("/")[1], kind: "embedding" }),
    ),
  ],
};
export const uid = () => crypto.randomUUID();
export function chunkPages(pages, sourceId) {
  return pages.flatMap((text, index) => {
    const result = [];
    for (let start = 0; start < text.length; start += 1050) {
      const body = text.slice(start, start + 1300).trim();
      if (body)
        result.push({ id: uid(), sourceId, page: index + 1, text: body });
    }
    return result;
  });
}
export function lexical(query, text) {
  const words =
    query.toLowerCase().match(/[a-z0-9]{2,}|[\p{Script=Han}]/gu) || [];
  const lower = text.toLowerCase();
  return (
    [...new Set(words)].reduce(
      (sum, w) => sum + (lower.includes(w) ? 1 : 0),
      0,
    ) / Math.max(1, new Set(words).size)
  );
}
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return dot / (Math.sqrt(aa * bb) || 1);
}
export class Store {
  constructor(root) {
    this.root = root;
    fs.mkdirSync(path.join(root, "assets"), { recursive: true });
    const file = path.join(root, "state.json");
    this.state = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : {
          settings: structuredClone(defaults),
          docs: [],
          chats: [],
          assets: [],
          chunks: [],
        };
    this.state.settings = { ...defaults, ...this.state.settings };
  }
  save() {
    const file = path.join(this.root, "state.json");
    fs.writeFileSync(file + ".tmp", JSON.stringify(this.state));
    fs.renameSync(file + ".tmp", file);
  }
  snapshot() {
    const { secret, ...settings } = this.state.settings;
    return {
      settings: { ...settings, hasKey: !!secret },
      docs: this.state.docs.filter((d) => !d.builtin),
      builtin: this.state.docs
        .filter((d) => d.builtin)
        .map((d) => ({ id: d.id, pages: d.pages })),
      chats: this.state.chats,
      assets: this.state.assets.map(({ diskPath, ...a }) => a),
      chunkCount: this.state.chunks.length,
    };
  }
  asset(bytes, name, mime, owner = null) {
    const id = uid(),
      diskPath = path.join(
        this.root,
        "assets",
        id + path.extname(name).replace(/[^.a-zA-Z0-9]/g, ""),
      );
    fs.writeFileSync(diskPath, bytes);
    const asset = {
      id,
      name,
      mime,
      owner,
      diskPath,
      size: bytes.length,
      createdAt: Date.now(),
    };
    this.state.assets.push(asset);
    return asset;
  }
  referenceAsset(id, owner) {
    const source = this.state.assets.find((a) => a.id === id);
    if (!source?.mime.startsWith("image/"))
      throw new Error("Select an image to use as a reference");
    if (!this.state.chats.some((c) => c.id === owner))
      throw new Error("Conversation no longer exists");
    const copy = this.asset(
      fs.readFileSync(source.diskPath),
      "Reference-" + source.name,
      source.mime,
      owner,
    );
    copy.referenceOf = id;
    this.save();
    return copy.id;
  }
  deleteChats(ids) {
    const removed = new Set(ids);
    const assets = this.state.assets.filter((a) => removed.has(a.owner));
    const sources = new Set([...ids, ...assets.map((a) => a.id)]);
    this.state.chats = this.state.chats.filter((c) => !removed.has(c.id));
    this.invalidateSources(sources);
    this.state.assets = this.state.assets.filter((a) => !removed.has(a.owner));
    this.save();
    assets.forEach((a) => {
      fs.rmSync(a.diskPath, { force: true });
      if (a.thumbnailPath) fs.rmSync(a.thumbnailPath, { force: true });
    });
  }
  invalidateSources(sources) {
    this.state.chunks = this.state.chunks.filter(
      (c) =>
        !sources.has(c.sourceId) &&
        !c.dependencies?.some((id) => sources.has(id)),
    );
    for (const chat of this.state.chats)
      for (const message of chat.messages || []) {
        if (
          message.sources?.some((s) => sources.has(s.id)) ||
          message.dependencies?.some((id) => sources.has(id))
        )
          message.invalidated = true;
      }
  }
  deleteDoc(id) {
    const doc = this.state.docs.find((d) => d.id === id);
    this.state.docs = this.state.docs.filter((d) => d.id !== id);
    this.invalidateSources(new Set([id]));
    this.state.assets = this.state.assets.filter((a) => a.id !== id);
    this.save();
    if (doc) {
      fs.rmSync(doc.diskPath, { force: true });
      if (doc.thumbnailPath) fs.rmSync(doc.thumbnailPath, { force: true });
    }
  }
  async retrieve(query, { key, model, signal, notify = () => {} } = {}) {
    const activeSources = new Set([
      ...this.state.docs.map((d) => d.id),
      ...this.state.chats.map((c) => c.id),
      ...this.state.assets
        .filter(
          (a) => !a.owner || this.state.chats.some((c) => c.id === a.owner),
        )
        .map((a) => a.id),
    ]);
    const chunks = this.state.chunks.filter(
      (c) =>
        activeSources.has(c.sourceId) &&
        (!c.dependencies ||
          c.dependencies.every((id) => activeSources.has(id))),
    );
    let vector;
    if (key && model && chunks.length) {
      try {
        const missing = chunks.filter((c) => c.embeddingModel !== model);
        for (let i = 0; i < missing.length; i += 8) {
          notify({ stage: "embedding", done: i, total: missing.length });
          const batch = missing.slice(i, i + 8);
          const vectors = await this.embed(
            batch.map((c) => c.text),
            model,
            key,
            signal,
          );
          batch.forEach((c, j) => {
            c.vector = vectors[j];
            c.embeddingModel = model;
          });
        }
        // A concurrent deletion must never resurrect indexed records.
        this.save();
        [vector] = await this.embed([query], model, key, signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        notify({ stage: "warning", message: "Embedding: " + error.message });
      }
    }
    return chunks
      .filter((c) => this.state.chunks.includes(c))
      .map((c) => ({
        ...c,
        score: lexical(query, c.text) * 0.4 + cosine(vector, c.vector) * 0.6,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ vector, embeddingModel, ...c }) => c);
  }
  async embed(input, model, key, signal) {
    const body = {
      model,
      input,
      ...(model.startsWith("openai/") ? { dimensions: 1024 } : {}),
    };
    let data;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        data = await api(this.state.settings, key, "/embeddings", body, signal);
        break;
      } catch (error) {
        if (
          signal?.aborted ||
          attempt === 2 ||
          !/(net::|fetch failed|429|502|503|504)/.test(error.message)
        )
          throw error;
      }
    }
    const rows = data.data?.slice().sort((a, b) => a.index - b.index);
    if (
      rows?.length !== input.length ||
      rows.some((x) => !Array.isArray(x.embedding))
    )
      throw new Error("Invalid embedding response");
    return rows.map((x) => x.embedding);
  }
}
export function interactionInput(text, attachments = []) {
  return [
    {
      type: "user_input",
      content: [
        { type: "text", text },
        ...attachments.map((a) => ({
          type: a.mime.startsWith("image/")
            ? "image"
            : a.mime.startsWith("video/")
              ? "video"
              : "document",
          data: a.data,
          mime_type: a.mime,
        })),
      ],
    },
  ];
}
export function interactionRequest(
  model,
  text,
  attachments = [],
  reference = "",
  options = {},
) {
  const brief = reference
    ? `${text}\n\nCreative reference context (supporting visual guidance):\n${reference}`
    : text;
  return {
    model,
    stream: false,
    response_format: {
      type: "video",
      ...(options.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
      ...(options.durationSeconds
        ? { duration: options.durationSeconds + "s" }
        : {}),
    },
    input: interactionInput(brief, attachments),
  };
}
export function replyLanguageInstruction(language) {
  const name =
    { zh: "Simplified Chinese", en: "English", ja: "Japanese" }[language] ||
    "Simplified Chinese";
  return `The current interface language is ${name}. Write all user-facing natural language in ${name}, including answers, explanations, headings, prompt suggestions and generated creative prompts. This language setting takes priority over the language of previous messages, source documents and attachments. Preserve proper names, model IDs, source citation tags and code where appropriate.`;
}
export function reasoningParameters(effort = "auto") {
  if (effort === "auto") return {};
  if (!["none", "minimal", "low", "medium", "high", "xhigh"].includes(effort))
    throw new Error("Unsupported reasoning effort");
  return { reasoning_effort: effort };
}
export async function api(
  settings,
  key,
  endpoint,
  body,
  signal,
  method = "POST",
) {
  if (!key)
    throw new Error("Please configure your ZenMux API key in Settings.");
  const response = await fetch(settings.baseUrl.replace(/\/$/, "") + endpoint, {
    method,
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
    wmNetwork: {
      mode: settings.networkMode || "auto",
      proxyUrl: settings.proxyUrl,
    },
  });
  if (!response.ok) {
    const detail = (await response.text())
      .slice(0, 1200)
      .replaceAll(key, "[redacted]");
    throw new Error(`ZenMux ${response.status}: ${detail}`);
  }
  return response.json();
}
export async function consumeSSE(body, onDelta) {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  function consume(line) {
    if (!line.startsWith("data:")) return;
    const value = line.slice(5).trim();
    if (!value || value === "[DONE]") return;
    const data = JSON.parse(value);
    if (data.error)
      throw new Error(data.error.message || JSON.stringify(data.error));
    const content = data.choices?.[0]?.delta?.content;
    if (typeof content === "string") onDelta(content);
    if (Array.isArray(content))
      content.forEach((p) => {
        if (p.text) onDelta(p.text);
      });
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      lines.forEach(consume);
      if (done) {
        if (buffer) consume(buffer);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
export async function streamChat(settings, key, body, signal, onDelta) {
  if (!key)
    throw new Error("Please configure your ZenMux API key in Settings.");
  const response = await fetch(
    settings.baseUrl.replace(/\/$/, "") + "/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    },
  );
  if (!response.ok)
    throw new Error(
      `ZenMux ${response.status}: ${(await response.text()).slice(0, 1200).replaceAll(key, "[redacted]")}`,
    );
  await consumeSSE(response.body, onDelta);
}
export function mediaItems(data, kind) {
  const message = data.choices?.[0]?.message;
  const items = [
    ...(data.data || []),
    ...(message?.images || []),
    ...(message?.videos || []),
    ...(Array.isArray(message?.content) ? message.content : []),
    ...(data.steps || [])
      .filter((s) => s.type === "model_output")
      .flatMap((s) => s.content || []),
    ...(data.outputs || []),
    ...(data.predictions || []),
    ...(data.response?.videos || []),
    ...(data.candidates || []).flatMap((c) => c.content?.parts || []),
  ];
  if (data.url) items.push(data);
  if (message?.video) items.push(message.video);
  if (message?.video_url)
    items.push({ url: message.video_url.url || message.video_url });
  return items.flatMap((item) => {
    const url =
      item.gcsUri ||
      item.uri ||
      item.url ||
      item.image_url?.url ||
      item.video_url?.url ||
      item.image_url ||
      item.video_url;
    if (typeof url === "string") return [{ url }];
    if (item.type === kind && item.data && item.mime_type)
      return [{ url: `data:${item.mime_type};base64,${item.data}` }];
    if (item.bytesBase64Encoded)
      return [
        {
          url: `data:${item.mimeType || (kind === "image" ? "image/png" : "video/mp4")};base64,${item.bytesBase64Encoded}`,
        },
      ];
    if (item.inlineData?.data)
      return [
        {
          url: `data:${item.inlineData.mimeType};base64,${item.inlineData.data}`,
        },
      ];
    if (item.b64_json)
      return [
        {
          url: `data:${kind === "image" ? "image/png" : "video/mp4"};base64,${item.b64_json}`,
        },
      ];
    if (item.inline_data?.data)
      return [
        {
          url: `data:${item.inline_data.mime_type};base64,${item.inline_data.data}`,
        },
      ];
    return [];
  });
}
