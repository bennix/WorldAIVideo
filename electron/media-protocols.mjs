import { imageSizes } from "./media-controls.mjs";
export function protocolOptions(model) {
  if (model.kind === "image")
    return model.id.startsWith("openai/")
      ? [
          { id: "images", name: "OpenAI Images" },
          { id: "gemini", name: "Google Gemini" },
        ]
      : [{ id: "gemini", name: "Google Gemini" }];
  if (model.kind === "video")
    return model.id.includes("gemini-omni")
      ? [{ id: "interactions", name: "Google Interactions" }]
      : [
          { id: "vertex-video", name: "Google Vertex AI" },
          { id: "interactions", name: "Google Interactions" },
        ];
  return [];
}
export function normalizeMediaModel(model) {
  const options = protocolOptions(model);
  if (!options.length) return model;
  return {
    ...model,
    protocol: options.some((p) => p.id === model.protocol)
      ? model.protocol
      : options[0].id,
  };
}
export function vertexSettings(settings) {
  return {
    ...settings,
    baseUrl: settings.baseUrl.replace(/\/v1\/?$/, "/vertex-ai/v1"),
  };
}
export function vertexPath(model, method) {
  const slash = model.indexOf("/");
  if (slash < 1 || slash === model.length - 1)
    throw new Error("Expected provider/model ID");
  return `/publishers/${encodeURIComponent(model.slice(0, slash))}/models/${encodeURIComponent(model.slice(slash + 1))}:${method}`;
}
export function openAIImageRequest(
  model,
  prompt,
  attachments = [],
  options = {},
) {
  if (attachments.some((a) => !a.mime.startsWith("image/")))
    throw new Error(
      "OpenAI Images accepts image attachments. Use Google Gemini for PDF or video inputs.",
    );
  return {
    endpoint: attachments.length ? "/images/edits" : "/images/generations",
    body: {
      model,
      prompt,
      ...(options.aspectRatio ? { size: imageSizes[options.aspectRatio] } : {}),
      ...(attachments.length
        ? {
            images: attachments.map((a) => ({
              image_url: `data:${a.mime};base64,${a.data}`,
            })),
          }
        : {}),
    },
  };
}
export function geminiImageRequest(
  model,
  prompt,
  attachments = [],
  options = {},
) {
  if (model.startsWith("google/gemini"))
    return {
      endpoint: vertexPath(model, "generateContent"),
      body: {
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              ...attachments.map((a) => ({
                inlineData: { mimeType: a.mime, data: a.data },
              })),
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          ...(options.aspectRatio
            ? { imageConfig: { aspectRatio: options.aspectRatio } }
            : {}),
        },
      },
    };
  if (attachments.some((a) => !a.mime.startsWith("image/")))
    throw new Error("This image model accepts image references only.");
  const image = (a) => ({ bytesBase64Encoded: a.data, mimeType: a.mime });
  const instance = { prompt };
  if (attachments.length === 1) instance.image = image(attachments[0]);
  if (attachments.length > 1)
    instance.referenceImages = attachments.map((a, i) => ({
      referenceId: i + 1,
      referenceType: "REFERENCE_TYPE_RAW",
      referenceImage: image(a),
    }));
  return {
    endpoint: vertexPath(model, "predict"),
    body: {
      instances: [instance],
      parameters: {
        sampleCount: 1,
        ...(options.aspectRatio
          ? { imageSize: imageSizes[options.aspectRatio] }
          : {}),
      },
    },
  };
}
export function vertexVideoRequest(
  model,
  prompt,
  attachments = [],
  options = {},
) {
  if (
    attachments.length > 2 ||
    attachments.some((a) => !a.mime.startsWith("image/"))
  )
    throw new Error(
      "Vertex AI video accepts starting and optional ending frame images. Use Google Interactions for Omni image/video/file references.",
    );
  const instance = { prompt };
  if (attachments[0])
    instance.image = {
      bytesBase64Encoded: attachments[0].data,
      mimeType: attachments[0].mime,
    };
  if (attachments[1])
    instance.lastFrame = {
      bytesBase64Encoded: attachments[1].data,
      mimeType: attachments[1].mime,
    };
  return {
    endpoint: vertexPath(model, "predictLongRunning"),
    body: {
      instances: [instance],
      parameters: {
        sampleCount: 1,
        ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
        ...(options.durationSeconds
          ? { durationSeconds: options.durationSeconds }
          : {}),
      },
    },
  };
}
