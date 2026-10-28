import { Fragment, type ReactNode } from "react";

interface TextNode {
  type: "text";
  value: string;
}

interface TagNode {
  type: "tag";
  name: string;
  attribute?: string;
  children: BbCodeNode[];
}

interface ListItemNode {
  type: "item";
  children: BbCodeNode[];
}

type BbCodeNode = TextNode | TagNode | ListItemNode;
type StackFrame = TagNode | ListItemNode;
interface RootFrame {
  type: "root";
  children: BbCodeNode[];
}

interface ImageMapArea {
  x: number;
  y: number;
  width: number;
  height: number;
  href: string;
  title: string;
}

function isImageMapAreaStart(tokens: string[], index: number): boolean {
  const coordinates = tokens.slice(index, index + 4).map(Number);
  const redirect = tokens[index + 4];
  return (
    coordinates.length === 4 &&
    coordinates.every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 100,
    ) &&
    redirect !== undefined &&
    (redirect === "#" ||
      isSafeWebUrl(redirect.startsWith("www.") ? `https://${redirect}` : redirect))
  );
}

function parseImageMapAreas(tokens: string[]): ImageMapArea[] {
  const areas: ImageMapArea[] = [];
  let cursor = 0;

  while (cursor < tokens.length) {
    if (!isImageMapAreaStart(tokens, cursor)) {
      cursor += 1;
      continue;
    }

    const [x, y, width, height] = tokens.slice(cursor, cursor + 4).map(Number);
    const redirect = tokens[cursor + 4];
    const titleStart = cursor + 5;
    let nextAreaStart = titleStart;
    while (
      nextAreaStart < tokens.length &&
      !isImageMapAreaStart(tokens, nextAreaStart)
    ) {
      nextAreaStart += 1;
    }

    if (redirect && redirect !== "#") {
      const href = redirect.startsWith("www.")
        ? `https://${redirect}`
        : redirect;
      areas.push({
        x,
        y,
        width,
        height,
        href,
        title: tokens.slice(titleStart, nextAreaStart).join(" "),
      });
    }

    cursor = nextAreaStart;
  }

  return areas;
}

const TAG_PATTERN =
  /\[code\]([\s\S]*?)\[\/code\]|\[\/?([a-z*]+)(?:=([^\]\r\n]*))?\]/gi;
const SUPPORTED_TAGS = new Set([
  "b",
  "i",
  "u",
  "s",
  "strike",
  "color",
  "size",
  "left",
  "centre",
  "center",
  "right",
  "spoiler",
  "box",
  "spoilerbox",
  "quote",
  "c",
  "url",
  "profile",
  "list",
  "email",
  "img",
  "imagemap",
  "youtube",
  "audio",
  "heading",
  "notice",
]);

function isSafeWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "ftp:"
    );
  } catch {
    return false;
  }
}

function normalizeMediaUrl(value: string): string | null {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("//")
    ? `${window.location.protocol}${trimmed}`
    : trimmed;
  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:"
      ? normalized
      : null;
  } catch {
    return null;
  }
}

function appendText(parent: { children: BbCodeNode[] }, value: string) {
  if (!value) return;
  parent.children.push({ type: "text", value });
}

function parseBbCode(content: string): BbCodeNode[] {
  const root: RootFrame = { type: "root", children: [] };
  const stack: StackFrame[] = [];
  const current = (): StackFrame | RootFrame => stack[stack.length - 1] ?? root;
  const matcher = new RegExp(TAG_PATTERN);
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(content)) !== null) {
    appendText(current(), content.slice(cursor, match.index));
    cursor = matcher.lastIndex;

    if (match[1] !== undefined) {
      const codeNode: TagNode = {
        type: "tag",
        name: "code",
        children: [{ type: "text", value: match[1] }],
      };
      current().children.push(codeNode);
      continue;
    }

    const raw = match[0];
    const name = match[2].toLowerCase();
    const isClosing = raw.startsWith("[/");
    const attribute = match[3];

    if (name === "*" && !isClosing) {
      const listFrame = [...stack]
        .reverse()
        .find((frame) => frame.type === "tag" && frame.name === "list");
      if (
        !listFrame ||
        (current() !== listFrame && current().type !== "item")
      ) {
        appendText(current(), raw);
        continue;
      }
      if (current().type === "item") stack.pop();
      const item: ListItemNode = { type: "item", children: [] };
      listFrame.children.push(item);
      stack.push(item);
      continue;
    }

    if (!SUPPORTED_TAGS.has(name)) {
      appendText(current(), raw);
      continue;
    }

    if (isClosing) {
      if (name === "list" && current().type === "item") stack.pop();
      const top = current();
      if (top.type === "tag" && top.name === name) {
        stack.pop();
      } else {
        appendText(current(), raw);
      }
      continue;
    }

    const node: TagNode = {
      type: "tag",
      name,
      attribute: attribute?.trim(),
      children: [],
    };
    current().children.push(node);
    stack.push(node);
  }

  appendText(current(), content.slice(cursor));
  return root.children;
}

function renderPlainText(value: string, playerName: string): ReactNode {
  const withPlayerName = value.replace(/\[me\]/gi, playerName);
  const linkPattern =
    /((?:(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"']+|[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+))/gi;
  const parts = withPlayerName.split(linkPattern);

  return parts.map((part, index) => {
    if (index % 2 === 1) {
      const link = part.replace(/[),.!?;:]+$/, "");
      const trailingText = part.slice(link.length);
      const isEmail = link.includes("@") && !/^(?:https?|ftp):/i.test(link);
      const href = isEmail
        ? `mailto:${link}`
        : link.startsWith("www.")
          ? `https://${link}`
          : link;
      return (
        <Fragment key={index}>
          {isEmail || isSafeWebUrl(href) ? (
            <a
              href={href}
              target={isEmail ? undefined : "_blank"}
              rel={isEmail ? undefined : "noopener noreferrer nofollow"}
              className="text-accent hover:text-accent-hover underline underline-offset-2"
            >
              {link}
            </a>
          ) : (
            link
          )}
          {trailingText}
        </Fragment>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function renderNodes(nodes: BbCodeNode[], playerName: string): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "text") {
      return <Fragment key={index}>{renderPlainText(node.value, playerName)}</Fragment>;
    }
    if (node.type === "item") {
      return <li key={index}>{renderNodes(node.children, playerName)}</li>;
    }

    const children = renderNodes(node.children, playerName);
    const key = `${node.name}-${index}`;
    switch (node.name) {
      case "b":
        return <strong key={key}>{children}</strong>;
      case "i":
        return <em key={key}>{children}</em>;
      case "u":
        return <u key={key}>{children}</u>;
      case "s":
      case "strike":
        return <s key={key}>{children}</s>;
      case "left":
      case "centre":
      case "center":
      case "right":
        return (
          <div
            key={key}
            className={
              node.name === "left"
                ? "text-left"
                : node.name === "right"
                  ? "text-right"
                  : "text-center"
            }
          >
            {children}
          </div>
        );
      case "color": {
        const color = node.attribute?.toLowerCase();
        if (
          !color ||
          (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color) &&
            !/^[a-z]+$/i.test(color))
        ) {
          return <Fragment key={key}>{children}</Fragment>;
        }
        return (
          <span key={key} style={{ color }}>
            {children}
          </span>
        );
      }
      case "size": {
        const sizes: Record<string, string> = {
          tiny: "50%",
          small: "85%",
          normal: "100%",
          large: "150%",
        };
        const size = node.attribute?.toLowerCase() ?? "";
        const fontSize = sizes[size] ?? (/^\d+$/.test(size) && Number(size) >= 30 && Number(size) <= 200
          ? `${size}%`
          : undefined);
        return fontSize ? (
          <span key={key} style={{ fontSize }}>
            {children}
          </span>
        ) : (
          <Fragment key={key}>{children}</Fragment>
        );
      }
      case "spoiler":
        return (
          <details key={key} className="my-1">
            <summary className="inline cursor-pointer rounded bg-black px-1 text-slate-100">
              Reveal spoiler
            </summary>
            <span className="ml-1">{children}</span>
          </details>
        );
      case "box":
      case "spoilerbox":
        return (
          <details
            key={key}
            className="my-2 rounded-xl border border-line bg-surface-2 px-3 py-2"
          >
            <summary className="cursor-pointer font-medium text-accent">
              {node.name === "spoilerbox" ? "SPOILER" : node.attribute}
            </summary>
            <div className="mt-2 whitespace-pre-wrap">{children}</div>
          </details>
        );
      case "quote":
        return (
          <blockquote
            key={key}
            className="my-2 border-l-2 border-accent px-3 py-1 text-slate-300"
          >
            {node.attribute && (
              <cite className="mb-1 block text-xs not-italic text-muted">
                {node.attribute.replace(/^"(.*)"$/, "$1")}
              </cite>
            )}
            {children}
          </blockquote>
        );
      case "c":
        return (
          <code key={key} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">
            {children}
          </code>
        );
      case "code":
        return (
          <pre key={key} className="my-2 overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-xs">
            <code>
              {node.children.map((child) =>
                child.type === "text" ? child.value : "",
              ).join("")}
            </code>
          </pre>
        );
      case "url": {
        const href = node.attribute || node.children.map((child) =>
          child.type === "text" ? child.value : "",
        ).join("").trim();
        const normalizedHref = href.startsWith("www.") ? `https://${href}` : href;
        if (!isSafeWebUrl(normalizedHref)) return <Fragment key={key}>{children}</Fragment>;
        return (
          <a
            key={key}
            href={normalizedHref}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-accent hover:text-accent-hover underline underline-offset-2"
          >
            {children.length ? children : href}
          </a>
        );
      }
      case "profile":
        return node.attribute ? (
          <a key={key} href={`/u/${encodeURIComponent(node.attribute)}`} className="text-accent hover:text-accent-hover underline underline-offset-2">
            {children}
          </a>
        ) : (
          <Fragment key={key}>{children}</Fragment>
        );
      case "list": {
        const ordered = !!node.attribute;
        const heading = node.children
          .filter((child): child is TextNode => child.type === "text")
          .map((child) => child.value.trim())
          .filter(Boolean)
          .join(" ");
        const items = node.children.filter(
          (child): child is ListItemNode => child.type === "item",
        );
        const List = ordered ? "ol" : "ul";
        return (
          <Fragment key={key}>
            {heading && <p className="mt-2 font-medium">{heading}</p>}
            <List
              className={`my-2 space-y-1 pl-6 ${ordered ? "list-decimal" : "list-disc"}`}
            >
              {items.map((item, itemIndex) => {
                const itemChildren = [...item.children];
                while (itemChildren[0]?.type === "text") {
                  itemChildren[0].value = itemChildren[0].value.trimStart();
                  if (itemChildren[0].value) break;
                  itemChildren.shift();
                }
                while (itemChildren[itemChildren.length - 1]?.type === "text") {
                  const last = itemChildren[itemChildren.length - 1];
                  if (last?.type !== "text") break;
                  last.value = last.value.trimEnd();
                  if (last.value) break;
                  itemChildren.pop();
                }
                return (
                  <li key={itemIndex}>{renderNodes(itemChildren, playerName)}</li>
                );
              })}
            </List>
          </Fragment>
        );
      }
      case "email": {
        const address = (node.attribute || node.children.map((child) =>
          child.type === "text" ? child.value : "",
        ).join("")).replace(/^mailto:/i, "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
          return <Fragment key={key}>{children}</Fragment>;
        }
        return (
          <a key={key} href={`mailto:${address}`} className="text-accent hover:text-accent-hover underline underline-offset-2">
            {children.length ? children : address}
          </a>
        );
      }
      case "img": {
        const src = node.children.map((child) =>
          child.type === "text" ? child.value : "",
        ).join("").trim();
        const imageUrl = normalizeMediaUrl(src);
        return imageUrl ? (
          <img
            key={key}
            src={imageUrl}
            alt=""
            loading="lazy"
            className="my-2 max-h-96 max-w-full rounded-lg object-contain"
          />
        ) : null;
      }
      case "imagemap": {
        const content = node.children
          .map((child) => (child.type === "text" ? child.value : ""))
          .join("")
          .trim();
        const [imageUrl = "", ...areaTokens] = content.split(/\s+/);
        const normalizedImageUrl = normalizeMediaUrl(imageUrl);
        if (!normalizedImageUrl) return null;
        const areas = parseImageMapAreas(areaTokens);
        return (
          <div key={key} className="relative my-2 w-fit max-w-full">
            <img
              src={normalizedImageUrl}
              alt=""
              loading="lazy"
              className="max-h-96 max-w-full rounded-lg object-contain"
            />
            {areas.map((area, areaIndex) => (
              <a
                key={areaIndex}
                href={area.href}
                title={area.title}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="absolute"
                style={{
                  left: `${area.x}%`,
                  top: `${area.y}%`,
                  width: `${area.width}%`,
                  height: `${area.height}%`,
                }}
              >
                <span className="sr-only">{area.title || "Image link"}</span>
              </a>
            ))}
          </div>
        );
      }
      case "youtube": {
        const videoId = node.children.map((child) =>
          child.type === "text" ? child.value : "",
        ).join("").trim();
        return /^[\w-]{11}$/.test(videoId) ? (
          <div key={key} className="my-3 aspect-video max-w-2xl overflow-hidden rounded-xl">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}`}
              title="YouTube video"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-presentation"
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        ) : null;
      }
      case "audio": {
        const src = node.children.map((child) =>
          child.type === "text" ? child.value : "",
        ).join("").trim();
        const audioUrl = normalizeMediaUrl(src);
        return audioUrl ? (
          <audio key={key} controls preload="none" src={audioUrl} className="my-2 max-w-full" />
        ) : null;
      }
      case "heading":
        return (
          <h3 key={key} className="my-2 text-lg font-semibold text-accent">
            {children}
          </h3>
        );
      case "notice":
        return (
          <div key={key} className="my-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
            {children}
          </div>
        );
      default:
        return <Fragment key={key}>{children}</Fragment>;
    }
  });
}

export function UserpageContent({
  content,
  playerName,
}: {
  content: string;
  playerName: string;
}) {
  return (
    <div className="break-words whitespace-pre-wrap text-sm leading-relaxed text-slate-200 [&_p]:my-1">
      {renderNodes(parseBbCode(content), playerName)}
    </div>
  );
}
