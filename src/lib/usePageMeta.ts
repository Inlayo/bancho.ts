import { useEffect } from "react";

import { env } from "@/lib/env";

export interface PageMeta {
  title?: string;
  description?: string;
  image?: string;
  twitterCard?: "summary" | "summary_large_image";
  type?: "website" | "profile" | "article";
}

interface RouteMeta {
  title: string;
  description: string;
  noIndex?: boolean;
  type?: PageMeta["type"];
}

function getRouteMeta(pathname: string, appName: string): RouteMeta {
  if (pathname === "/") {
    return {
      title: "Home",
      description:
        `Play osu! on the ${appName} private osu! server, set scores, and browse rankings, player profiles, beatmaps, and top plays.`,
    };
  }
  if (pathname === "/leaderboard") {
    return {
      title: "Leaderboard",
      description:
        `Browse player rankings on ${appName} by mode, performance, accuracy, ranked score, total score, and play count.`,
    };
  }
  if (pathname === "/topplays") {
    return {
      title: "Top Plays",
      description: `Browse standout and recent top scores across osu! vanilla, relax, and autopilot modes on ${appName}.`,
    };
  }
  if (pathname === "/clans") {
    return {
      title: "Clans",
      description: `Browse and discover player clans and their members on ${appName}.`,
    };
  }
  if (pathname === "/chat") {
    return {
      title: "Chat",
      description: `View conversations and send private messages to players on ${appName}.`,
      noIndex: true,
    };
  }
  if (pathname.startsWith("/clan/")) {
    return {
      title: "Clan",
      description: `View a clan, its members, and player details on ${appName}.`,
    };
  }
  if (pathname.startsWith("/u/")) {
    return {
      title: "Player profile",
      description: `View a player's profile, preferred mode, scores, statistics, and recent activity on ${appName}.`,
      type: "profile",
    };
  }
  if (pathname.startsWith("/b/")) {
    return {
      title: "Beatmap",
      description: `View beatmap details, difficulty settings, rankings, leaderboard scores, and favourites on ${appName}.`,
    };
  }
  if (pathname.startsWith("/s/")) {
    return {
      title: "Score",
      description: `View score details, accuracy, performance points, modifiers, replay, player, and beatmap information on ${appName}.`,
    };
  }
  if (pathname === "/login") {
    return {
      title: "Sign in",
      description: `Sign in to your ${appName} account to play, chat, manage friends, and change profile settings.`,
      noIndex: true,
    };
  }
  if (pathname === "/register") {
    return {
      title: "Create account",
      description: `Create a ${appName} account and connect the osu! client to set scores on the private server.`,
      noIndex: true,
    };
  }
  if (pathname === "/forgot-password") {
    return {
      title: "Reset password",
      description: `Request a password reset for your ${appName} account.`,
      noIndex: true,
    };
  }
  if (pathname === "/verify-email") {
    return {
      title: "Verify email",
      description: `Verify the email address associated with your ${appName} account before account actions.`,
      noIndex: true,
    };
  }
  if (pathname === "/friends") {
    return {
      title: "Friends",
      description: `Manage your friends list and visit connected player profiles on ${appName}.`,
      noIndex: true,
    };
  }
  if (pathname === "/users") {
    return {
      title: "Players",
      description:
        new URLSearchParams(window.location.search).get("online") === "1"
          ? `See players currently connected to ${appName}.`
          : `Browse registered players, accounts, online status, and profiles on ${appName}.`,
    };
  }
  if (pathname === "/settings") {
    return {
      title: "Account settings",
      description: `Change your ${appName} username, password, avatar, user page, country, and game preferences.`,
      noIndex: true,
    };
  }
  if (pathname === "/admin") {
    return {
      title: "Administration",
      description: `Manage ${appName} users, privileges, restrictions, memos, scores, clans, maps, and server statistics.`,
      noIndex: true,
    };
  }
  return {
    title: "Page not found",
    description: `The requested page could not be found on ${appName}.`,
    noIndex: true,
  };
}

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  );
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function upsertCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = href;
}

function removeMeta(attribute: "name" | "property", key: string) {
  document.head
    .querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
    ?.remove();
}

export function usePageMeta({
  title,
  description,
  image,
  twitterCard,
  type,
}: PageMeta) {
  useEffect(() => {
    const routeMeta = getRouteMeta(window.location.pathname, env.appName);
    const pageTitle = `${title ?? routeMeta.title} · ${env.appName}`;
    const pageDescription = description ?? routeMeta.description;
    const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
    const pageType = type ?? routeMeta.type ?? "website";

    document.title = pageTitle;
    upsertMeta("name", "description", pageDescription);
    upsertMeta("property", "og:title", pageTitle);
    upsertMeta("property", "og:description", pageDescription);
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:site_name", env.appName);
    upsertMeta("property", "og:type", pageType);
    upsertMeta("property", "og:locale", "en_US");
    upsertCanonical(canonicalUrl);
    upsertMeta(
      "name",
      "robots",
      routeMeta.noIndex ? "noindex, nofollow" : "index, follow",
    );
    upsertMeta(
      "name",
      "twitter:card",
      twitterCard ?? (image ? "summary_large_image" : "summary"),
    );
    upsertMeta("name", "twitter:title", pageTitle);
    upsertMeta("name", "twitter:description", pageDescription);

    if (image) {
      upsertMeta("property", "og:image", image);
      upsertMeta("name", "twitter:image", image);
    } else {
      removeMeta("property", "og:image");
      removeMeta("name", "twitter:image");
    }
  }, [description, image, title, twitterCard, type]);
}