import { test } from "node:test";
import assert from "node:assert/strict";
import {
  protocolOptions,
  normalizeMediaModel,
  openAIImageRequest,
  geminiImageRequest,
  vertexSettings,
  vertexPath,
  vertexVideoRequest,
} from "../electron/media-protocols.mjs";
import { mediaItems, defaults } from "../electron/service.mjs";
test("media presets and displayed protocol names match documented ZenMux APIs", () => {
  assert.deepEqual(
    protocolOptions({ kind: "image", id: "openai/gpt-image-2.6-flare" }).map(
      (p) => p.name,
    ),
    ["OpenAI Images", "Google Gemini"],
  );
  assert.deepEqual(
    protocolOptions({ kind: "image", id: "google/gemini-nano-banana-2.1" }).map(
      (p) => p.name,
    ),
    ["Google Gemini"],
  );
  assert.deepEqual(
    protocolOptions({ kind: "video", id: "google/gemini-omni-1.2-flash" }).map(
      (p) => p.name,
    ),
    ["Google Interactions"],
  );
  for (const m of defaults.models.filter((m) =>
    ["image", "video"].includes(m.kind),
  ))
    assert.equal(normalizeMediaModel(m).protocol, m.protocol);
});
test("legacy media settings migrate to supported protocols", () => {
  assert.equal(
    normalizeMediaModel({
      id: "openai/gpt-image-2.6-flare",
      kind: "image",
      protocol: "chat",
    }).protocol,
    "images",
  );
  assert.equal(
    normalizeMediaModel({
      id: "google/gemini-nano-banana-2.1",
      kind: "image",
      protocol: "chat",
    }).protocol,
    "gemini",
  );
  assert.equal(
    normalizeMediaModel({
      id: "google/veo-3.1-generate-001",
      kind: "video",
      protocol: "videos",
    }).protocol,
    "vertex-video",
  );
});
test("OpenAI Images uses generation or JSON edits with images references", () => {
  assert.equal(
    openAIImageRequest("openai/test", "test").endpoint,
    "/images/generations",
  );
  const r = openAIImageRequest("openai/test", "edit", [
    { mime: "image/png", data: "AA==" },
  ]);
  assert.equal(r.endpoint, "/images/edits");
  assert.deepEqual(r.body.images, [
    { image_url: "data:image/png;base64,AA==" },
  ]);
  assert.equal("image" in r.body, false);
});
test("Google Gemini image uses Vertex generateContent, response modalities and inlineData", () => {
  const r = geminiImageRequest("google/gemini-nano-banana-2.1", "test", [
    { mime: "image/png", data: "AA==" },
  ]);
  assert.equal(
    r.endpoint,
    "/publishers/google/models/gemini-nano-banana-2.1:generateContent",
  );
  assert.deepEqual(r.body.generationConfig, {
    responseModalities: ["TEXT", "IMAGE"],
  });
  assert.equal(r.body.contents[0].parts[1].inlineData.data, "AA==");
  assert.equal("temperature" in r.body.generationConfig, false);
  assert.equal(
    vertexSettings({ baseUrl: "https://zenmux.ai/api/v1" }).baseUrl,
    "https://zenmux.ai/api/vertex-ai/v1",
  );
});
test("Vertex image predict and async video use documented REST shapes", () => {
  const image = geminiImageRequest("openai/gpt-image-2.6-flare", "test");
  assert.ok(image.endpoint.endsWith(":predict"));
  assert.equal(image.body.instances[0].prompt, "test");
  const video = vertexVideoRequest("google/veo-3.1-generate-001", "test", [
    { mime: "image/png", data: "AA==" },
  ]);
  assert.ok(video.endpoint.endsWith(":predictLongRunning"));
  assert.equal(video.body.instances[0].image.bytesBase64Encoded, "AA==");
  assert.equal(
    vertexPath("google/veo-3.1-generate-001", "fetchPredictOperation"),
    "/publishers/google/models/veo-3.1-generate-001:fetchPredictOperation",
  );
});
test("native Vertex REST image and video responses yield downloadable media", () => {
  assert.equal(
    mediaItems(
      {
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: "AA==" } }],
            },
          },
        ],
      },
      "image",
    )[0].url,
    "data:image/png;base64,AA==",
  );
  assert.equal(
    mediaItems(
      { predictions: [{ mimeType: "image/jpeg", bytesBase64Encoded: "BB==" }] },
      "image",
    )[0].url,
    "data:image/jpeg;base64,BB==",
  );
  assert.equal(
    mediaItems(
      {
        response: {
          videos: [{ mimeType: "video/mp4", bytesBase64Encoded: "CC==" }],
        },
      },
      "video",
    )[0].url,
    "data:video/mp4;base64,CC==",
  );
});
