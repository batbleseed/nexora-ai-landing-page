import type { MLCEngineInterface, InitProgressReport } from "@mlc-ai/web-llm";

export const LOCAL_MODEL_F16 = "SmolLM2-360M-Instruct-q4f16_1-MLC";
export const LOCAL_MODEL_F32 = "SmolLM2-360M-Instruct-q4f32_1-MLC";

export interface WebGpuCapability {
  supported: boolean;
  hasF16: boolean;
  modelId: string;
  reason?: string;
}

export interface LocalLoadProgress {
  progress: number;
  text: string;
}

let activeEngine: MLCEngineInterface | null = null;
let activeModelId: string | null = null;
let loadPromise: Promise<MLCEngineInterface> | null = null;

export async function checkWebGpuCapability(): Promise<WebGpuCapability> {
  if (typeof navigator === "undefined" || !("gpu" in navigator) || !navigator.gpu) {
    return {
      supported: false,
      hasF16: false,
      modelId: LOCAL_MODEL_F32,
      reason:
        "WebGPU is not exposed by this browser. Use a recent Chrome, Edge, or Chromium browser with hardware acceleration enabled.",
    };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return {
        supported: false,
        hasF16: false,
        modelId: LOCAL_MODEL_F32,
        reason:
          "No WebGPU GPU adapter was found on this device or browser session. Enable GPU/hardware acceleration in browser settings.",
      };
    }

    const hasF16 = adapter.features.has("shader-f16");
    return {
      supported: true,
      hasF16,
      modelId: hasF16 ? LOCAL_MODEL_F16 : LOCAL_MODEL_F32,
    };
  } catch (err) {
    return {
      supported: false,
      hasF16: false,
      modelId: LOCAL_MODEL_F32,
      reason:
        err instanceof Error
          ? `WebGPU adapter check failed: ${err.message}`
          : "WebGPU initialization failed in this browser.",
    };
  }
}

export async function isAnyLocalModelCached(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const { hasModelInCache, prebuiltAppConfig } = await import("@mlc-ai/web-llm");
    const [has16, has32] = await Promise.all([
      hasModelInCache(LOCAL_MODEL_F16, prebuiltAppConfig).catch(() => false),
      hasModelInCache(LOCAL_MODEL_F32, prebuiltAppConfig).catch(() => false),
    ]);
    return Boolean(has16 || has32);
  } catch {
    return false;
  }
}

export async function ensureLocalEngineLoaded(
  onProgress?: (info: LocalLoadProgress) => void
): Promise<MLCEngineInterface> {
  const cap = await checkWebGpuCapability();
  if (!cap.supported) {
    throw new Error(cap.reason || "WebGPU is unavailable in this browser.");
  }

  if (activeEngine && activeModelId === cap.modelId) {
    onProgress?.({ progress: 100, text: "WebGPU model ready." });
    return activeEngine;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
    const engine = await CreateMLCEngine(cap.modelId, {
      initProgressCallback: (report: InitProgressReport) => {
        const pct = Math.max(0, Math.min(100, Math.round((report.progress || 0) * 100)));
        onProgress?.({
          progress: pct,
          text: report.text || "Preparing WebGPU shaders and model weights…",
        });
      },
    });
    activeEngine = engine;
    activeModelId = cap.modelId;
    return engine;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

function stripTrailingRepetitionLoop(text: string): {
  cleaned: string;
  loopDetected: boolean;
} {
  if (text.length < 40) return { cleaned: text, loopDetected: false };
  // Detect 4+ consecutive repetitions of a short phrase or token pattern at the end
  const phraseLoopMatch = text.match(/(.{3,48}?)\1{3,}$/);
  if (phraseLoopMatch && phraseLoopMatch.index !== undefined) {
    const keepEnd = phraseLoopMatch.index + phraseLoopMatch[1].length;
    return { cleaned: text.slice(0, keepEnd).trimEnd(), loopDetected: true };
  }
  // Detect repeating word-sequence tails (e.g. "and by WebGPU by WebGPU by WebGPU...")
  const wordLoopMatch = text.match(/(\b\w+(?:\s+\w+){0,5})\s*(?:\1\s*){3,}$/i);
  if (wordLoopMatch && wordLoopMatch.index !== undefined) {
    const keepEnd = wordLoopMatch.index + wordLoopMatch[1].length;
    return { cleaned: text.slice(0, keepEnd).trimEnd(), loopDetected: true };
  }
  return { cleaned: text, loopDetected: false };
}

export async function streamLocalWebGpuChat(opts: {
  prompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  language?: string;
  effort?: string;
  onProgress?: (info: LocalLoadProgress) => void;
  onThought?: (delta: string) => void;
  onDelta: (delta: string) => void;
  onReplaceText?: (text: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const engine = await ensureLocalEngineLoaded(opts.onProgress);
  if (opts.signal?.aborted) {
    return "";
  }

  const languageDirective =
    opts.language && !opts.language.toLowerCase().startsWith("english")
      ? ` Respond in ${opts.language} unless asked otherwise.`
      : "";

  const effortDirective =
    opts.effort === "Low"
      ? " Be brief and direct."
      : opts.effort === "Max Effort"
        ? " Reason carefully step by step before giving a thorough answer."
        : "";

  const maxTokens =
    opts.effort === "Low" ? 280 : opts.effort === "Max Effort" ? 900 : 512;
  const temperature =
    opts.effort === "Low" ? 0.4 : opts.effort === "Max Effort" ? 0.65 : 0.55;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content: `You are Nexora Nano, a friendly and concise assistant. Reply directly and naturally without repeating words or phrases.${effortDirective}${languageDirective}`,
    },
    ...opts.history.slice(-8).map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    {
      role: "user",
      content: opts.prompt || "Hello",
    },
  ];

  const onAbort = () => {
    try {
      engine.interruptGenerate();
    } catch {
      // Ignore interrupt errors
    }
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  let fullText = "";
  let inThink = false;
  let pending = "";
  let loopStopped = false;

  const pushAnswerChunk = (out: string) => {
    fullText += out;
    const { cleaned, loopDetected } = stripTrailingRepetitionLoop(fullText);
    if (loopDetected) {
      fullText = cleaned;
      loopStopped = true;
      opts.onReplaceText?.(fullText);
      try {
        engine.interruptGenerate();
      } catch {
        // Ignore interrupt errors
      }
      return;
    }
    opts.onDelta(out);
  };

  const emitSplit = (chunkText: string) => {
    pending += chunkText;
    while (pending.length > 0 && !loopStopped) {
      if (!inThink) {
        const openIdx = pending.indexOf("<think>");
        if (openIdx === -1) {
          const safeLen = pending.endsWith("<") ? pending.length - 1 : pending.length;
          if (safeLen > 0) {
            const out = pending.slice(0, safeLen);
            pending = pending.slice(safeLen);
            pushAnswerChunk(out);
          }
          break;
        }
        if (openIdx > 0) {
          const out = pending.slice(0, openIdx);
          pushAnswerChunk(out);
        }
        pending = pending.slice(openIdx + 7);
        inThink = true;
      } else {
        const closeIdx = pending.indexOf("</think>");
        if (closeIdx === -1) {
          const safeLen = pending.endsWith("<") ? pending.length - 1 : pending.length;
          if (safeLen > 0) {
            opts.onThought?.(pending.slice(0, safeLen));
            pending = pending.slice(safeLen);
          }
          break;
        }
        if (closeIdx > 0) {
          opts.onThought?.(pending.slice(0, closeIdx));
        }
        pending = pending.slice(closeIdx + 8);
        inThink = false;
      }
    }
  };

  try {
    const stream = await engine.chat.completions.create({
      messages,
      stream: true,
      temperature,
      top_p: 0.9,
      frequency_penalty: 0.85,
      presence_penalty: 0.5,
      max_tokens: maxTokens,
    });

    for await (const chunk of stream) {
      if (opts.signal?.aborted || loopStopped) break;
      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        emitSplit(delta);
      }
    }
    if (pending && !loopStopped) {
      if (inThink) {
        opts.onThought?.(pending);
      } else {
        pushAnswerChunk(pending);
      }
    }
    return fullText;
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

export async function clearLocalModelCache(): Promise<void> {
  if (activeEngine) {
    try {
      await activeEngine.unload();
    } catch {
      // Ignore unload failure
    }
    activeEngine = null;
    activeModelId = null;
  }

  try {
    const { deleteModelAllInfoInCache, prebuiltAppConfig } = await import("@mlc-ai/web-llm");
    await Promise.all([
      deleteModelAllInfoInCache(LOCAL_MODEL_F16, prebuiltAppConfig).catch(() => {}),
      deleteModelAllInfoInCache(LOCAL_MODEL_F32, prebuiltAppConfig).catch(() => {}),
    ]);
  } catch {
    // Ignore cache deletion error if module unavailable
  }

  if (typeof caches !== "undefined") {
    await caches.delete("nexora-local-model-v1").catch(() => {});
  }
}
