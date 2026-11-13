import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Store,
  chunkPages,
  consumeSSE,
  mediaItems,
  defaults,
} from "../electron/service.mjs";
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wm-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return new Store(root);
}
test("page chunks overlap while retaining page-level sources", () => {
  const chunks = chunkPages(
    ["a".repeat(2500), "physical camera motion"],
    "book",
  );
  assert.equal(chunks[0].text.length, 1300);
  assert.equal(chunks.at(-1).page, 2);
  assert.ok(chunks.every((c) => c.sourceId === "book"));
});
test("batch deletion cascades through attachments, vectors, conversations and generated assets", async (t) => {
  const s = fixture(t);
  s.state.chats = [{ id: "keep" }, { id: "delete" }];
  s.state.docs = [{ id: "book" }];
  const a = s.asset(Buffer.from("clip"), "movie.mp4", "video/mp4", "delete");
  const keep = s.asset(Buffer.from("image"), "image.png", "image/png", "keep");
  s.state.chunks = [
    { sourceId: "delete", text: "secret knowledge" },
    { sourceId: a.id, text: "secret clip", vector: [1, 2] },
    { sourceId: "keep", text: "camera theory" },
    { sourceId: "book", text: "physical camera motion" },
  ];
  s.save();
  s.deleteChats(["delete"]);
  assert.equal(fs.existsSync(a.diskPath), false);
  assert.equal(fs.existsSync(keep.diskPath), true);
  assert.equal(s.state.chunks.length, 2);
  const results = await s.retrieve("secret");
  assert.ok(
    results.every((c) => c.sourceId !== "delete" && c.sourceId !== a.id),
  );
  assert.equal(new Store(s.root).state.chats.length, 1);
});
test("document deletion removes persisted index and bytes", (t) => {
  const s = fixture(t);
  const a = s.asset(Buffer.from("pdf"), "book.pdf", "application/pdf");
  s.state.docs.push({ ...a });
  s.state.chunks = chunkPages(["knowledge"], a.id);
  s.save();
  s.deleteDoc(a.id);
  assert.equal(s.state.chunks.length, 0);
  assert.equal(s.state.assets.length, 0);
  assert.equal(fs.existsSync(a.diskPath), false);
});
test("SSE handles arbitrary UTF8 and CRLF transport boundaries and final unterminated line", async () => {
  const bytes = new TextEncoder().encode(
    'data: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"world"}}]}\ndata: [DONE]',
  );
  const stream = new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += 7)
        c.enqueue(bytes.slice(i, i + 7));
      c.close();
    },
  });
  let result = "";
  await consumeSSE(stream, (d) => (result += d));
  assert.equal(result, "你好world");
});
test("SSE exposes provider errors", async () => {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(
        new TextEncoder().encode('data: {"error":{"message":"unavailable"}}\n'),
      );
      c.close();
    },
  });
  await assert.rejects(
    consumeSSE(stream, () => {}),
    /unavailable/,
  );
});
test("media adapters recognize image, video and base64 response variants", () => {
  assert.equal(
    mediaItems(
      {
        choices: [
          {
            message: {
              images: [{ image_url: { url: "https://example.com/a.png" } }],
            },
          },
        ],
      },
      "image",
    )[0].url,
    "https://example.com/a.png",
  );
  assert.equal(
    mediaItems(
      { choices: [{ message: { video_url: "https://example.com/a.mp4" } }] },
      "video",
    ).length,
    1,
  );
  assert.ok(
    mediaItems({ data: [{ b64_json: "AA==" }] }, "image")[0].url.startsWith(
      "data:image/png",
    ),
  );
});
test("all requested default models are available locally", () => {
  assert.equal(defaults.models.length, 11);
  assert.equal(defaults.models.filter((m) => m.kind === "chat").length, 5);
});
test("deleting a conversation invalidates dependent knowledge and future assistant context", (t) => {
  const s = fixture(t);
  s.state.chats = [
    { id: "a", messages: [] },
    {
      id: "b",
      messages: [
        { role: "assistant", sources: [{ id: "a" }], dependencies: ["a"] },
      ],
    },
  ];
  s.state.chunks = [
    { sourceId: "a", text: "original" },
    { sourceId: "b", text: "derived", dependencies: ["a"] },
  ];
  s.deleteChats(["a"]);
  assert.equal(s.state.chunks.length, 0);
  assert.equal(s.state.chats[0].messages[0].invalidated, true);
});
test("bundled knowledge is searchable while hidden from document listings", async (t) => {
  const s = fixture(t);
  s.state.docs = [{ id: "builtin", builtin: true, pages: 154 }];
  s.state.chunks = [{ sourceId: "builtin", text: "physical consistency" }];
  assert.equal(s.snapshot().docs.length, 0);
  assert.equal(s.snapshot().builtin.length, 1);
  assert.equal((await s.retrieve("physical"))[0].sourceId, "builtin");
});
test("reasoning uses documented ZenMux effort values and omits automatic parameters", async () => {
  const { reasoningParameters } = await import("../electron/service.mjs");
  assert.deepEqual(reasoningParameters("auto"), {});
  for (const effort of ["none", "minimal", "low", "medium", "high", "xhigh"])
    assert.deepEqual(reasoningParameters(effort), { reasoning_effort: effort });
  assert.throws(() => reasoningParameters("ultra"));
  assert.equal("temperature" in reasoningParameters("high"), false);
});
test("native interactions video output is extracted", () => {
  const result = mediaItems(
    {
      steps: [
        {
          type: "model_output",
          content: [{ type: "video", mime_type: "video/mp4", data: "AA==" }],
        },
      ],
    },
    "video",
  );
  assert.equal(result[0].url, "data:video/mp4;base64,AA==");
});
test("native interactions sends step_list input for text and attached media", async () => {
  const { interactionInput } = await import("../electron/service.mjs");
  const steps = interactionInput("Animate this shoe", [
    { mime: "image/png", data: "AA==" },
    { mime: "application/pdf", data: "BB==" },
  ]);
  assert.equal(steps[0].type, "user_input");
  assert.equal("role" in steps[0], false);
  assert.equal(steps[0].content[1].type, "image");
  assert.equal(steps[0].content[2].type, "document");
});
test("Omni native request omits unsupported system and temperature fields", async () => {
  const { interactionRequest } = await import("../electron/service.mjs");
  const body = interactionRequest(
    "google/gemini-omni-1.2-flash",
    "Create a shoe ad",
    [],
    "Keep physical motion consistent",
  );
  assert.equal("system_instruction" in body, false);
  assert.equal("temperature" in body, false);
  assert.equal(body.input[0].type, "user_input");
  assert.equal(body.response_format.type, "video");
  assert.match(
    body.input[0].content[0].text,
    /Keep physical motion consistent/,
  );
});
test("assistant language follows UI language ahead of historical or source language", async () => {
  const { replyLanguageInstruction } = await import("../electron/service.mjs");
  for (const [language, name] of Object.entries({
    zh: "Simplified Chinese",
    en: "English",
    ja: "Japanese",
  })) {
    const instruction = replyLanguageInstruction(language);
    assert.match(
      instruction,
      new RegExp(`Write all user-facing natural language in ${name}`),
    );
    assert.match(
      instruction,
      /takes priority over the language of previous messages/,
    );
    assert.match(instruction, /generated creative prompts/);
  }
  assert.match(replyLanguageInstruction(undefined), /Simplified Chinese/);
});
test("using a generated image as reference creates an independent removable attachment", (t) => {
  const s = fixture(t);
  s.state.chats = [
    { id: "original", messages: [] },
    { id: "target", messages: [] },
  ];
  const original = s.asset(
    Buffer.from("png"),
    "generated.png",
    "image/png",
    "original",
  );
  original.generated = true;
  const id = s.referenceAsset(original.id, "target");
  const reference = s.state.assets.find((a) => a.id === id);
  assert.notEqual(reference.diskPath, original.diskPath);
  assert.equal(reference.owner, "target");
  assert.equal(reference.referenceOf, original.id);
  assert.equal(reference.generated, undefined);
  s.deleteDoc(id);
  assert.equal(fs.existsSync(original.diskPath), true);
  assert.ok(s.state.assets.some((a) => a.id === original.id));
});
