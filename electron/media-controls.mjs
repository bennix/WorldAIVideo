export const imageSizes = {
  "1:1": "1024x1024",
  "3:2": "1536x1024",
  "2:3": "1024x1536",
  "16:9": "1536x864",
  "9:16": "864x1536",
  "4:3": "1536x1152",
  "3:4": "1152x1536",
  "21:9": "1792x768",
};
export function mediaChoices(model) {
  if (model?.kind === "image")
    return { ratios: ["auto", ...Object.keys(imageSizes)], durations: [] };
  const omni = model?.id.includes("gemini-omni");
  const durations = omni
    ? Array.from({ length: model.id.includes("1.2") ? 13 : 8 }, (_, i) => i + 3)
    : model?.id.includes("veo")
      ? [5, 8]
      : [5, 8, 10];
  return {
    ratios: [
      "auto",
      "16:9",
      "9:16",
      ...(!omni && !model?.id.includes("veo") ? ["1:1"] : []),
    ],
    durations: ["auto", ...durations],
  };
}
export function validateMediaOptions(model, options = {}) {
  const choices = mediaChoices(model),
    result = {};
  if (options.aspectRatio && options.aspectRatio !== "auto") {
    if (!choices.ratios.includes(options.aspectRatio))
      throw new Error("Unsupported aspect ratio for this model");
    result.aspectRatio = options.aspectRatio;
  }
  if (options.durationSeconds && options.durationSeconds !== "auto") {
    if (
      model?.kind !== "video" ||
      !choices.durations.includes(Number(options.durationSeconds))
    )
      throw new Error("Unsupported video duration for this model");
    result.durationSeconds = Number(options.durationSeconds);
  }
  return result;
}
export function mediaGuidance(options = {}) {
  const constraints = [];
  if (options.aspectRatio)
    constraints.push(`Use an aspect ratio of ${options.aspectRatio}.`);
  if (options.durationSeconds)
    constraints.push(
      `The video must last ${options.durationSeconds} seconds. Allocate shot timings to total exactly ${options.durationSeconds} seconds. Fit actions, transitions and narration into that duration.`,
    );
  return constraints.length
    ? `Current generation controls take priority over conflicting dimensions or durations in previous messages and copied prompts. ${constraints.join(" ")}`
    : "";
}
