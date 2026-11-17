import { memo, useEffect, useId, useMemo, useRef, useState } from "react";

type InlineHtmlPreviewProps = {
  html: string;
  isDark?: boolean;
  isLoading?: boolean;
};

function buildPreviewDocument(rawHtml: string, previewId: string, isDark: boolean): string {
  const themeStyle = `<style data-nexora-preview-base>
:root {
  color-scheme: ${isDark ? "dark" : "light"};
  --bg: ${isDark ? "#1e1f24" : "#ffffff"};
  --page: ${isDark ? "#191a1e" : "#fafafa"};
  --surface: ${isDark ? "#23252c" : "#ffffff"};
  --inset: ${isDark ? "#1d1f25" : "#f5f6f8"};
  --ink: ${isDark ? "#f3f4f6" : "#1c1f24"};
  --ink-2: ${isDark ? "#a7adb8" : "#5a606c"};
  --ink-3: ${isDark ? "#737985" : "#8c93a0"};
  --muted: ${isDark ? "#a7adb8" : "#5a606c"};
  --line: ${isDark ? "#31343e" : "#e9ecf0"};
  --line-strong: ${isDark ? "#3e424e" : "#dce0e7"};
  --accent: ${isDark ? "#5c9dff" : "#3278f6"};
  --green: ${isDark ? "#39c47f" : "#1f9d60"};
  --orange: ${isDark ? "#f09d4c" : "#d97706"};
  --red: ${isDark ? "#ef5d5d" : "#dc2626"};
}
*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  background: var(--surface);
  color: var(--ink);
  font-family: "DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
body {
  padding: 18px;
  overflow-x: auto;
}
</style>`;

  const resizeScript = `<script data-nexora-preview-resize>
(function () {
  var id = ${JSON.stringify(previewId)};
  var lastHeight = 0;
  function measureAndPost() {
    try {
      var body = document.body;
      var docEl = document.documentElement;
      if (!body || !docEl) return;
      var h = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        docEl.scrollHeight,
        docEl.offsetHeight
      );
      if (h > 0 && Math.abs(h - lastHeight) >= 2) {
        lastHeight = h;
        window.parent.postMessage(
          { type: "nexora-inline-preview-height", id: id, height: h },
          "*"
        );
      }
    } catch (e) {}
  }
  if (typeof ResizeObserver !== "undefined") {
    var ro = new ResizeObserver(measureAndPost);
    if (document.documentElement) ro.observe(document.documentElement);
    window.addEventListener("DOMContentLoaded", function () {
      if (document.body) ro.observe(document.body);
      measureAndPost();
    });
  }
  window.addEventListener("load", measureAndPost);
  setTimeout(measureAndPost, 60);
  setTimeout(measureAndPost, 260);
})();
</script>`;

  const trimmed = rawHtml.trim();
  const hasHtmlRoot = /^<!doctype\s+html/i.test(trimmed) || /<html[\s>]/i.test(trimmed);

  if (!hasHtmlRoot) {
    return `<!DOCTYPE html>
<html lang="en"${isDark ? ' class="dark"' : ""}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${themeStyle}
${resizeScript}
</head>
<body>
${rawHtml}
</body>
</html>`;
  }

  let doc = rawHtml;
  if (/<head[^>]*>/i.test(doc)) {
    doc = doc.replace(/<head([^>]*)>/i, `<head$1>\n${themeStyle}`);
  } else if (/<html[^>]*>/i.test(doc)) {
    doc = doc.replace(/<html([^>]*)>/i, `<html$1>\n<head>${themeStyle}</head>`);
  } else {
    doc = `${themeStyle}\n${doc}`;
  }

  if (/<\/body>/i.test(doc)) {
    doc = doc.replace(/<\/body>/i, `${resizeScript}\n</body>`);
  } else {
    doc = `${doc}\n${resizeScript}`;
  }

  return doc;
}

function InlineHtmlPreview({
  html,
  isDark = false,
  isLoading = false,
}: InlineHtmlPreviewProps) {
  const previewId = useId();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState<number>(260);

  const srcDoc = useMemo(() => {
    if (isLoading || !html.trim()) return "";
    return buildPreviewDocument(html, previewId, isDark);
  }, [html, previewId, isDark, isLoading]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        !iframeRef.current ||
        event.source !== iframeRef.current.contentWindow ||
        !event.data ||
        typeof event.data !== "object"
      ) {
        return;
      }
      const data = event.data as {
        type?: string;
        id?: string;
        height?: unknown;
      };
      if (
        data.type === "nexora-inline-preview-height" &&
        data.id === previewId &&
        typeof data.height === "number" &&
        Number.isFinite(data.height)
      ) {
        const clamped = Math.max(120, Math.min(720, Math.ceil(data.height)));
        setFrameHeight(clamped);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [previewId]);

  if (isLoading) {
    return (
      <div className="my-1 flex h-44 w-full items-center justify-center rounded-card border border-line bg-surface px-4 shadow-card">
        <div className="flex items-center gap-2.5 text-[13px] text-ink-2">
          <span
            className="size-3.5 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
            style={{ animation: "spin 700ms linear infinite" }}
          />
          <span>Rendering interactive view…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-1 w-full overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <iframe
        ref={iframeRef}
        title="Interactive preview"
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        style={{ height: `${frameHeight}px` }}
        className="block w-full border-0 bg-surface transition-[height] duration-150 ease-out"
      />
    </div>
  );
}

export default memo(InlineHtmlPreview);
