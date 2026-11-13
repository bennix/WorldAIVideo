# WorldModel Studio Technical Implementation Spec

Claude brainstorm was attempted using the requested skill on 2026-11-13. The local CLI failed because its OAuth session expired. This implementation plan is authored by Codex from the user's requirements.

## Product and scope
Electron desktop research and creation workspace. Chinese, English and Japanese UI. Pre-extract the project PDF into bundled private knowledge. Hide the book name, cover and file entry from the application. Package extracted text, with no source PDF. Import PDF/text/image/video attachments by picker, drop and clipboard. Render PDF cover and media thumbnails with removable attachment chips. Stream Markdown answers with page-level RAG references. Suggest prompts and create video prompts grounded in retrieved theory. Generate image and video using configurable ZenMux models. Copy text and media and export assets. Persist conversations, assets and documents locally and retrieve prior work in future chats. Batch export/delete history. Deletion removes owned attachments, chunks and generated media from future retrieval.

## Architecture and data
React/Vite renderer, context-isolated Electron preload with explicit IPC API, Node main process and service module. JSON state is written atomically. Asset bytes are copied into application userData and accessed by opaque IDs through a custom protocol. Key encrypted with Electron safeStorage when available and masked in renderer. Model settings have kind, ID, name and media protocol. Default endpoint https://zenmux.ai/api/v1. Main process owns all remote calls.

PDF.js extracts page text and creates a cover. Page-preserving overlapping chunks support lexical retrieval without credentials. Selected embedding model indexes missing chunks on demand in batches, with visible lexical fallback if embedding requests fail. Cosine similarity plus lexical matching ranks chunks. Every index is scoped to currently existing records. Documents imported into the global library persist independently. Chat-owned attachments and artifacts disappear when their owning conversation is deleted.

## User flows and acceptance
First launch installs pre-extracted built-in knowledge from electron/resources/knowledge.json. User configures key and models in Settings. New chat can ask questions, request prompt suggestions or a theory-based video prompt. Retrieval context is explicitly labeled untrusted data, with source IDs and pages. Prior messages and selected multimodal attachments are sent with the request. User can stop generation. Partial responses and failures remain visible. Media generation uses chat modalities by default, plus selectable images/generations or videos asynchronous adapter. Async tasks poll with cancellation and timeout. Unknown response shape produces an actionable error.

## UI
Warm paper and graphite research studio, saffron accent, source shelf, quiet conversation canvas and bottom composer. Sidebar switches conversation, library, artifacts and history. Settings dialog includes masked key, invitation link, endpoint, language and editable models. All visible primary controls have translated labels. Responsive columns collapse on narrow windows.

## Verification
Build renderer, run service regression tests covering atomic persistence, page chunking, SSE boundaries, model handling, retrieval and cascading deletion. Launch Electron and inspect real PDF import and UI. ZenMux connection, embedding retrieval and streamed GPT-6.1 Sol responses have been verified with the user-provided key. Paid media generation remains unverified. Scanned PDFs report missing text and need OCR externally.

## User refinements
The user requested that the book remain hidden and its knowledge be pre-extracted inside the program. A user-provided API key is persisted only in encrypted application data. GPT-6.1 Sol is the default validated chat model. The model list currently omits the requested Gemini Carbon, Omni and Nano Banana identifiers. Their presets remain editable. Deletion also invalidates derived knowledge and prior assistant context with deleted-source dependencies.

## Verified ZenMux definitions and refinements
Official Chat Completions uses reasoning_effort with none, minimal, low, medium, high and xhigh, depending on model. Auto omits the field. Temperature is omitted throughout. Omni supports native POST /interactions and its model_output steps. Chat video attachments use file content parts. The UI saves effort choice and provides individual conversation delete and persistent pinning. Adaptive transport discovers environment and system proxies plus common loopback proxy ports, falls back between proxy and direct and remembers the successful route. SSE output already delivered is never replayed. Official references are linked in README.md.

Real API validation succeeded for both embedding model IDs individually, and full OpenAI 1024-dimensional indexing plus streamed GPT-6.1 Sol reasoning-effort low completion. The 300 built-in vectors are packaged alongside extracted text for ready-to-use retrieval. No account secret is included in bundled knowledge.

## Native Omni correction verified
The live Omni backend requires typed user_input step_list input and rejects system_instruction. The native adapter uses typed steps, places creative grounding inside the user brief and requests response_format.type video. A real 10.026667-second 1280×720 MP4 was generated successfully and verified in the application's video player. Prompt code blocks have copy and fill-composer controls. Assistant text has a sticky top copy button. No temperature is sent.
