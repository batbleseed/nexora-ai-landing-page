import { jsPDF } from "jspdf";
import type { WorkspaceThread } from "../data/workspaceThreads";

interface ParsedBlock {
  type: "text" | "code";
  lang?: string;
  content: string;
}

function splitTextAndCode(markdown: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const fenceRegex = /```([a-zA-Z0-9_.-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      const before = markdown.slice(lastIndex, match.index).trim();
      if (before) blocks.push({ type: "text", content: before });
    }
    const lang = (match[1] || "code").trim().toLowerCase();
    if (
      lang === "nexora-preview" ||
      lang === "html-preview" ||
      lang === "preview" ||
      lang === "widget"
    ) {
      blocks.push({
        type: "text",
        content: "[Interactive preview rendered in Nexora]",
      });
    } else {
      blocks.push({
        type: "code",
        lang,
        content: match[2].replace(/\s+$/, ""),
      });
    }
    lastIndex = fenceRegex.lastIndex;
  }

  const tail = markdown.slice(lastIndex).trim();
  if (tail) {
    blocks.push({ type: "text", content: tail });
  }
  return blocks;
}

function sanitizePdfText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, "--")
    .replace(/\u2013/g, "-")
    .replace(/\u2026/g, "...");
}

function getImageFormatAndSize(
  dataUrl: string
): Promise<{ width: number; height: number; format: "PNG" | "JPEG" | "WEBP" } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const format = dataUrl.startsWith("data:image/png")
        ? "PNG"
        : dataUrl.startsWith("data:image/webp")
          ? "WEBP"
          : "JPEG";
      resolve({
        width: img.naturalWidth || 400,
        height: img.naturalHeight || 300,
        format,
      });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function sanitizeFilename(title: string): string {
  const clean = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${clean || "nexora-chat"}.pdf`;
}

export async function exportThreadToPdf(
  thread: WorkspaceThread,
  options?: {
    folderName?: string | null;
    exportedBy?: string | null;
  }
): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 44;
  const marginTop = 48;
  const marginBottom = 50;
  const contentWidth = pageWidth - marginX * 2;
  let y = marginTop;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  // Document Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(115, 120, 130);
  doc.text("NEXORA  ·  CONVERSATION RECORD", marginX, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(26, 28, 32);
  const titleLines = doc.splitTextToSize(
    sanitizePdfText(thread.title || "Untitled conversation"),
    contentWidth
  ) as string[];
  for (const line of titleLines) {
    ensureSpace(22);
    doc.text(line, marginX, y);
    y += 21;
  }

  y += 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(100, 105, 115);

  const metaParts = [
    `Exported ${new Date().toLocaleString()}`,
    `${thread.messages.length} message${thread.messages.length === 1 ? "" : "s"}`,
  ];
  if (options?.folderName) metaParts.push(`Folder: ${options.folderName}`);
  if (thread.pinned) metaParts.push("Pinned");
  if (options?.exportedBy) metaParts.push(`Account: ${options.exportedBy}`);

  const metaLines = doc.splitTextToSize(
    sanitizePdfText(metaParts.join("  ·  ")),
    contentWidth
  ) as string[];
  for (const line of metaLines) {
    ensureSpace(14);
    doc.text(line, marginX, y);
    y += 13;
  }

  doc.setFontSize(8);
  doc.setTextColor(145, 150, 160);
  doc.text(`Thread ID: ${thread.id}`, marginX, y);
  y += 12;

  doc.setDrawColor(224, 227, 232);
  doc.setLineWidth(0.75);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 20;

  if (thread.messages.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10.5);
    doc.setTextColor(120, 125, 135);
    doc.text("No messages recorded in this conversation.", marginX, y);
  }

  for (let i = 0; i < thread.messages.length; i += 1) {
    const msg = thread.messages[i];
    const isUser = msg.role === "user";

    ensureSpace(44);

    // Sender & Metadata Row
    const senderLabel = isUser
      ? (options?.exportedBy || "USER").toUpperCase()
      : "NEXORA ASSISTANT";
    const metaSuffix = [msg.model, msg.effort, msg.timestamp].filter(Boolean).join(" · ");

    doc.setFillColor(isUser ? 241 : 246, isUser ? 243 : 247, isUser ? 247 : 250);
    doc.roundedRect(marginX, y - 10, contentWidth, 20, 4, 4, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(35, 38, 46);
    doc.text(sanitizePdfText(senderLabel), marginX + 8, y + 3);

    if (metaSuffix) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(115, 120, 130);
      const labelW = doc.getTextWidth(sanitizePdfText(senderLabel));
      const availableW = Math.max(40, contentWidth - labelW - 24);
      const clippedMeta = doc.splitTextToSize(sanitizePdfText(metaSuffix), availableW)[0] ?? "";
      doc.text(clippedMeta, pageWidth - marginX - 8, y + 3, { align: "right" });
    }
    y += 20;

    // Optional Reasoning Summary
    if (!isUser && msg.reasoningText && msg.reasoningText.trim()) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(120, 125, 135);
      const durLabel = msg.thinkingDurationMs
        ? `Reasoning (${Math.max(1, Math.round(msg.thinkingDurationMs / 1000))}s)`
        : "Reasoning";
      ensureSpace(16);
      doc.text(durLabel, marginX + 6, y);
      y += 12;

      const reasonLines = doc.splitTextToSize(
        sanitizePdfText(msg.reasoningText.trim()),
        contentWidth - 16
      ) as string[];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(110, 114, 124);
      for (const rLine of reasonLines) {
        ensureSpace(12);
        doc.text(rLine, marginX + 10, y);
        y += 11.5;
      }
      y += 6;
    }

    // Embedded Image Previews
    if (msg.attachmentPreviews && msg.attachmentPreviews.length > 0) {
      let rowX = marginX;
      let rowMaxH = 0;
      for (let imgIdx = 0; imgIdx < msg.attachmentPreviews.length; imgIdx += 1) {
        const src = msg.attachmentPreviews[imgIdx];
        const info = await getImageFormatAndSize(src);
        if (!info) continue;

        const maxThumbW = 140;
        const maxThumbH = 110;
        const scale = Math.min(1, maxThumbW / info.width, maxThumbH / info.height);
        const drawW = Math.max(36, info.width * scale);
        const drawH = Math.max(36, info.height * scale);

        if (rowX + drawW > pageWidth - marginX) {
          y += rowMaxH + 8;
          rowX = marginX;
          rowMaxH = 0;
        }
        ensureSpace(drawH + 10);
        try {
          doc.addImage(src, info.format, rowX, y, drawW, drawH);
          rowX += drawW + 8;
          rowMaxH = Math.max(rowMaxH, drawH);
        } catch {
          // Skip unembeddable image safely
        }
      }
      if (rowMaxH > 0) {
        y += rowMaxH + 12;
      }
    }

    // Message Content (Text & Code Blocks)
    const blocks = splitTextAndCode(msg.content || "");
    for (const block of blocks) {
      if (block.type === "code") {
        doc.setFont("courier", "normal");
        doc.setFontSize(8.5);
        const rawCodeLines = sanitizePdfText(block.content).split("\n");
        const wrappedCodeLines: string[] = [];
        for (const rawLine of rawCodeLines) {
          const parts = doc.splitTextToSize(rawLine || " ", contentWidth - 18) as string[];
          wrappedCodeLines.push(...parts);
        }

        const lineHeight = 11.5;
        let idx = 0;
        while (idx < wrappedCodeLines.length) {
          const remainingPage = pageHeight - marginBottom - y - 16;
          if (remainingPage < lineHeight * 2) {
            doc.addPage();
            y = marginTop;
          }
          const maxLinesHere = Math.max(
            1,
            Math.floor((pageHeight - marginBottom - y - 14) / lineHeight)
          );
          const slice = wrappedCodeLines.slice(idx, idx + maxLinesHere);
          const boxHeight = slice.length * lineHeight + 14;

          doc.setFillColor(246, 247, 249);
          doc.setDrawColor(228, 231, 236);
          doc.roundedRect(marginX, y - 4, contentWidth, boxHeight, 4, 4, "FD");

          doc.setFont("courier", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(40, 44, 52);
          let lineY = y + 9;
          for (const codeLine of slice) {
            doc.text(codeLine, marginX + 9, lineY);
            lineY += lineHeight;
          }

          y += boxHeight + 8;
          idx += slice.length;
        }
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(32, 35, 42);
        const paragraphs = sanitizePdfText(block.content).split("\n");
        for (const para of paragraphs) {
          if (!para.trim()) {
            y += 6;
            continue;
          }
          const lines = doc.splitTextToSize(para, contentWidth) as string[];
          for (const line of lines) {
            ensureSpace(14.5);
            doc.text(line, marginX, y);
            y += 14.5;
          }
        }
        y += 4;
      }
    }

    y += 12;
  }

  // Page numbers & footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(145, 150, 160);
    doc.text(
      `Page ${p} of ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 24,
      { align: "right" }
    );
    doc.text(
      sanitizePdfText((thread.title || "Nexora Chat").slice(0, 60)),
      marginX,
      pageHeight - 24
    );
  }

  doc.save(sanitizeFilename(thread.title || "nexora-chat"));
}
