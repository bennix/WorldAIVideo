import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mediaChoices,
  validateMediaOptions,
  mediaGuidance,
} from "../electron/media-controls.mjs";
import {
  openAIImageRequest,
  geminiImageRequest,
  vertexVideoRequest,
} from "../electron/media-protocols.mjs";
import { interactionRequest } from "../electron/service.mjs";
import { zoomImage } from "../src/image-transform.js";
test("Omni 1.2 duration range is 3–15 seconds and Veo has its documented range", () => {
  const omni = { id: "google/gemini-omni-1.2-flash", kind: "video" };
  assert.deepEqual(mediaChoices(omni).durations, [
    "auto",
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
  ]);
  assert.deepEqual(
    validateMediaOptions(omni, { aspectRatio: "9:16", durationSeconds: 15 }),
    { aspectRatio: "9:16", durationSeconds: 15 },
  );
  assert.throws(() => validateMediaOptions(omni, { durationSeconds: 16 }));
  assert.deepEqual(
    mediaChoices({ id: "google/veo-3.1-generate-001", kind: "video" })
      .durations,
    ["auto", 5, 8],
  );
});
test("image aspect ratio reaches OpenAI size and Gemini imageConfig", () => {
  assert.equal(
    openAIImageRequest("openai/gpt-image-2.6-flare", "test", [], {
      aspectRatio: "16:9",
    }).body.size,
    "1536x864",
  );
  assert.equal(
    geminiImageRequest("google/gemini-nano-banana-2.1", "test", [], {
      aspectRatio: "9:16",
    }).body.generationConfig.imageConfig.aspectRatio,
    "9:16",
  );
  assert.equal(
    geminiImageRequest("openai/gpt-image-2.6-flare", "test", [], {
      aspectRatio: "16:9",
    }).body.parameters.imageSize,
    "1536x864",
  );
});
test("video duration and ratio use native protocol field names", () => {
  const options = { aspectRatio: "9:16", durationSeconds: 5 };
  assert.deepEqual(
    interactionRequest("google/gemini-omni-1.2-flash", "test", [], "", options)
      .response_format,
    { type: "video", aspect_ratio: "9:16", duration: "5s" },
  );
  assert.deepEqual(
    vertexVideoRequest("google/veo-3.1-generate-001", "test", [], options).body
      .parameters,
    { sampleCount: 1, aspectRatio: "9:16", durationSeconds: 5 },
  );
  assert.match(mediaGuidance(options), /total exactly 5 seconds/);
  assert.match(mediaGuidance(options), /take priority/);
});
test("image zoom anchors the image under the cursor and respects bounds", () => {
  assert.deepEqual(zoomImage({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 50 }), {
    scale: 2,
    x: -100,
    y: -50,
  });
  assert.equal(zoomImage({ scale: 1, x: 0, y: 0 }, 100).scale, 8);
  assert.equal(zoomImage({ scale: 1, x: 0, y: 0 }, 0.01).scale, 0.25);
});
