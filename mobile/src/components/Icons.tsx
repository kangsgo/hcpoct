/** 图标（内联 SVG，跟随 currentColor，无需图标库） */

export type IconName =
  | "plug"
  | "pulse"
  | "flask"
  | "list"
  | "gear"
  | "plus"
  | "refresh"
  | "download"
  | "trash"
  | "chevron"
  | "send"
  | "clock"
  | "check"
  | "warn";

const PATHS: Record<IconName, string> = {
  plug: "M8 3v5a4 4 0 0 0 8 0V3 M12 12v4 M9 21h6",
  pulse: "M3 12h4l2.5-6 4 12L16 12h5",
  flask:
    "M9 3h6 M10 3v6.6L4.8 18A2 2 0 0 0 6.6 21h10.8a2 2 0 0 0 1.8-3L14 9.6V3 M7 15h10",
  list: "M8 6h13 M8 12h13 M8 18h13 M3.6 6h.01 M3.6 12h.01 M3.6 18h.01",
  gear: "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  plus: "M12 5v14 M5 12h14",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7 M20 5v6h-6",
  download: "M12 3v12 M7.5 10.5 12 15l4.5-4.5 M4 20h16",
  trash:
    "M4 7h16 M9.5 7V4.8h5V7 M6.5 7l.9 13.2h9.2L17.5 7 M10.5 11v6 M13.5 11v6",
  chevron: "M6 9.5 12 15.5l6-6",
  send: "M21 3 3 10.5l7 3 3 7L21 3Z M10 13.5 21 3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7.5V12l3.2 1.9",
  check: "M4.5 12.5 9.5 17.5 20 7",
  warn: "M12 4.5 2.8 20h18.4L12 4.5Z M12 10v4.5 M12 17.5h.01",
};

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
