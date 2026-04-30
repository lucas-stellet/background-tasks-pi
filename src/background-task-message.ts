interface Component {
  invalidate(): void;
  render(width: number): string[];
}

interface MessageTheme {
  fg: (color: string, text: string) => string;
  bg: (color: string, text: string) => string;
  bold: (text: string) => string;
}

const CARD_MAX_WIDTH = 88;
const CARD_MIN_WIDTH = 5;
const RESET = "\x1b[0m";
const HEADER_BG = "\x1b[48;2;58;37;5m";
const HEADER_FG = "\x1b[38;2;255;232;163m";
const BODY_BG = "\x1b[48;2;17;16;12m";
const BODY_FG = "\x1b[38;2;248;231;194m";
const ACCENT_FG = "\x1b[38;2;245;158;11m";
const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;

export interface BackgroundTaskMessageOptions {
  content: string;
  status: string;
  theme: MessageTheme;
}

function charWidth(char: string): number {
  const codePoint = char.codePointAt(0) ?? 0;
  if (codePoint === 0xfe0f) return 0;
  if (codePoint === 0x26a0 || codePoint === 0x26a1 || codePoint >= 0x1f000) return 2;
  return 1;
}

function visibleWidth(text: string): number {
  let width = 0;
  for (const char of text.replace(ANSI_PATTERN, "")) {
    width += charWidth(char);
  }
  return width;
}

function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return "";
  let output = "";
  let used = 0;
  for (const char of text) {
    const nextWidth = charWidth(char);
    if (used + nextWidth > width) break;
    output += char;
    used += nextWidth;
  }
  return output;
}

function paint(styles: string, text: string): string {
  return `${styles}${text}${RESET}`;
}

function pad(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function titleFor(status: string): string {
  if (status === "completed") return "⚡ Background task completed";
  if (status === "failed") return "⚠ Background task failed";
  return "🔔 Background task update";
}

function renderTopBorder(title: string, width: number): string {
  const clippedTitle = truncateToWidth(title, Math.max(0, width - 5));
  const fill = "─".repeat(Math.max(0, width - visibleWidth(clippedTitle) - 5));
  return `╭─ ${clippedTitle} ${fill}╮`;
}

function renderBottomBorder(width: number): string {
  return `╰${"─".repeat(Math.max(0, width - 2))}╯`;
}

function renderBodyLine(content: string, width: number): string {
  const innerWidth = Math.max(0, width - 4);
  const text = pad(truncateToWidth(content.replace(/\t/g, "  "), innerWidth), innerWidth);
  return `│ ${text} │`;
}

function normalizeContentLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/^🔔\s*/, ""))
    .filter((line) => line.trim().length > 0)
    .filter((line) => !/^Background task notifications:\s*$/.test(line));
}

export function createBackgroundTaskMessage(options: BackgroundTaskMessageOptions): Component {
  return {
    invalidate(): void {},
    render(width: number): string[] {
      const title = titleFor(options.status);
      const bodyLines = normalizeContentLines(options.content);
      const contentLines = bodyLines.length > 0 ? bodyLines : [""];

      if (width < CARD_MIN_WIDTH) {
        return contentLines.map((line) => paint(`${BODY_BG}${BODY_FG}`, truncateToWidth(line, width)));
      }

      const cardWidth = Math.min(CARD_MAX_WIDTH, width);
      return [
        paint(`${HEADER_BG}${HEADER_FG}`, renderTopBorder(title, cardWidth)),
        ...contentLines.map((line) => paint(`${BODY_BG}${BODY_FG}`, renderBodyLine(line, cardWidth))),
        paint(`${BODY_BG}${ACCENT_FG}`, renderBottomBorder(cardWidth)),
      ];
    },
  };
}
