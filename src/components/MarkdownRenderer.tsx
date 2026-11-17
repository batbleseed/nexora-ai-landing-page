import { isValidElement, memo, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "./CodeBlock";

type MarkdownRendererProps = {
  content: string;
  fontScale?: "default" | "large";
  isError?: boolean;
  isStreaming?: boolean;
};

function sanitizeHref(href?: string): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }
  return undefined;
}

function langToFilename(lang: string): string {
  const clean = lang.trim().toLowerCase();
  if (clean === "typescript" || clean === "ts" || clean === "tsx") return `snippet.${clean}`;
  if (clean === "javascript" || clean === "js" || clean === "jsx") return `snippet.${clean}`;
  if (clean === "python" || clean === "py") return "script.py";
  if (clean === "json") return "data.json";
  if (clean === "bash" || clean === "sh" || clean === "shell" || clean === "zsh") {
    return "commands.sh";
  }
  if (clean === "sql") return "query.sql";
  if (clean === "html") return "index.html";
  if (clean === "css") return "styles.css";
  return clean ? `${clean}.txt` : "snippet.txt";
}

function extractTextContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractTextContent).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractTextContent(node.props.children);
  }
  return "";
}

function MarkdownRenderer({
  content,
  fontScale = "default",
  isError = false,
  isStreaming = false,
}: MarkdownRendererProps) {
  const sizeClass =
    fontScale === "large"
      ? "text-[15.5px] leading-[1.72]"
      : "text-[14.5px] leading-[1.68]";

  const components = useMemo<Components>(
    () => ({
      h1: ({ children }) => (
        <h1 className="mt-5 mb-2.5 font-display text-[1.42em] font-semibold tracking-[-0.02em] text-ink first:mt-0">
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 className="mt-4 mb-2 font-display text-[1.24em] font-semibold tracking-[-0.015em] text-ink first:mt-0">
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="mt-4 mb-1.5 font-display text-[1.09em] font-semibold tracking-[-0.01em] text-ink first:mt-0">
          {children}
        </h3>
      ),
      h4: ({ children }) => (
        <h4 className="mt-3.5 mb-1.5 font-display text-[1em] font-semibold text-ink first:mt-0">
          {children}
        </h4>
      ),
      h5: ({ children }) => (
        <h5 className="mt-3 mb-1 font-display text-[0.94em] font-semibold text-ink first:mt-0">
          {children}
        </h5>
      ),
      h6: ({ children }) => (
        <h6 className="mt-3 mb-1 font-display text-[0.88em] font-semibold uppercase tracking-[0.04em] text-ink-2 first:mt-0">
          {children}
        </h6>
      ),
      p: ({ children }) => <p className="my-2.5 first:mt-0 last:mb-0">{children}</p>,
      ul: ({ children }) => (
        <ul className="my-2.5 list-disc space-y-1.5 pl-5 marker:text-ink-3 first:mt-0 last:mb-0 [&>li>ol]:mt-1.5 [&>li>ul]:mt-1.5">
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol className="my-2.5 list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-ink-2 first:mt-0 last:mb-0 [&>li>ol]:mt-1.5 [&>li>ul]:mt-1.5">
          {children}
        </ol>
      ),
      li: ({ children }) => (
        <li className="pl-0.5 [&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
          {children}
        </li>
      ),
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      em: ({ children }) => <em className="italic">{children}</em>,
      del: ({ children }) => (
        <del className="text-ink-3 line-through">{children}</del>
      ),
      blockquote: ({ children }) => (
        <blockquote className="my-3 border-l-2 border-line-strong pl-3.5 text-ink-2 first:mt-0 last:mb-0 [&>p]:my-1.5 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-4 border-0 border-t border-line" />,
      a: ({ href, children }) => {
        const safeHref = sanitizeHref(href);
        if (!safeHref) return <span>{children}</span>;
        const isExternal =
          safeHref.startsWith("http://") || safeHref.startsWith("https://");
        return (
          <a
            href={safeHref}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noreferrer noopener" : undefined}
            className="font-medium text-accent-ink underline decoration-accent-ink/40 underline-offset-[3px] transition-colors hover:decoration-accent-ink"
          >
            {children}
          </a>
        );
      },
      code: ({ children }) => (
        <code className="rounded-[5px] border border-line/80 bg-inset px-1.5 py-[1px] font-mono text-[0.86em] text-ink">
          {children}
        </code>
      ),
      pre: ({ children }) => {
        const child = Array.isArray(children) ? children[0] : children;
        let lang = "";
        if (isValidElement<{ className?: string }>(child)) {
          const match = /language-([a-zA-Z0-9_.-]+)/.exec(child.props.className || "");
          if (match) lang = match[1];
        }
        const raw = extractTextContent(children).replace(/\n$/, "");
        return (
          <div className="my-3 first:mt-0 last:mb-0">
            <CodeBlock fill filename={langToFilename(lang)} lines={raw.split("\n")} />
          </div>
        );
      },
      table: ({ children }) => (
        <div className="my-3 w-full overflow-x-auto rounded-card border border-line bg-surface shadow-hairline first:mt-0 last:mb-0">
          <table className="w-full border-collapse text-left text-[13px]">
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => (
        <thead className="border-b border-line bg-inset text-[12px] font-semibold text-ink">
          {children}
        </thead>
      ),
      tbody: ({ children }) => <tbody className="divide-y divide-line">{children}</tbody>,
      tr: ({ children }) => (
        <tr className="transition-colors hover:bg-hover/60">{children}</tr>
      ),
      th: ({ children }) => (
        <th className="px-3.5 py-2 text-left font-semibold text-ink">{children}</th>
      ),
      td: ({ children }) => (
        <td className="px-3.5 py-2 align-top text-ink-2">{children}</td>
      ),
      input: ({ type, checked }) => {
        if (type !== "checkbox") return null;
        return (
          <input
            type="checkbox"
            checked={Boolean(checked)}
            readOnly
            aria-label={checked ? "Completed task" : "Pending task"}
            className="mr-2 inline-block size-3.5 translate-y-[2px] rounded border-line-strong accent-accent"
          />
        );
      },
    }),
    []
  );

  return (
    <div
      className={`break-words ${sizeClass} ${isError ? "text-red" : "text-ink"}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span
          aria-hidden="true"
          className="mt-1 inline-block h-3.5 w-[2px] rounded-full bg-ink"
          style={{ animation: "caret-blink 1s step-end infinite" }}
        />
      )}
    </div>
  );
}

export default memo(MarkdownRenderer);
