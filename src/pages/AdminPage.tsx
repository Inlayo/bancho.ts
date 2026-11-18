import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { BeatmapThumb } from "@/components/BeatmapThumb";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { GradeBadge } from "@/components/GradeBadge";
import { ModBadges } from "@/components/ModBadges";
import { PillTabs } from "@/components/ui/PillTabs";
import { api } from "@/lib/api/client";
import type {
  AdminMap,
  AdminUser,
  Player,
  PlayerScore,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import { replayDownloadUrl } from "@/lib/assets";
import {
  formatAccuracy,
  formatNumber,
  formatTimeAgo,
} from "@/lib/format";
import { splitModeId } from "@/lib/gamemodes";
import { usePageTitle } from "@/lib/usePageTitle";

const ADMINISTRATOR = 1 << 13;
const DEVELOPER = 1 << 14;
const UNRESTRICTED = 1;

const ROLE_OPTIONS = [
  { label: "Whitelisted", bit: 1 << 2 },
  { label: "Supporter", bit: 1 << 4 },
  { label: "Premium", bit: 1 << 5 },
  { label: "Alumni", bit: 1 << 7 },
  { label: "Tournament manager", bit: 1 << 10 },
  { label: "Nominator", bit: 1 << 11 },
  { label: "Moderator", bit: 1 << 12, staff: true },
  { label: "Administrator", bit: ADMINISTRATOR, staff: true },
  { label: "Developer", bit: DEVELOPER, staff: true },
];

const MODE_OPTIONS = [
  { id: 0, label: "osu!standard" },
  { id: 1, label: "osu!taiko" },
  { id: 2, label: "osu!catch" },
  { id: 3, label: "osu!mania" },
  { id: 4, label: "rx!standard" },
  { id: 5, label: "rx!taiko" },
  { id: 6, label: "rx!catch" },
  { id: 8, label: "ap!standard" },
];

const MAP_STATUSES = [
  { id: 0, label: "Pending / Unranked" },
  { id: 2, label: "Ranked" },
  { id: 3, label: "Approved" },
  { id: 4, label: "Qualified" },
  { id: 5, label: "Loved" },
];

export function AdminPage() {
  usePageTitle("Administration");
  const { player, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [playerListMode, setPlayerListMode] = useState<"online" | "offline">(
    "online",
  );
  const [offlineVisibleCount, setOfflineVisibleCount] = useState(20);
  const [reason, setReason] = useState("");
  const [wipeMode, setWipeMode] = useState("all");
  const [mapIdInput, setMapIdInput] = useState("");
  const [selectedMapId, setSelectedMapId] = useState<number | null>(null);
  const [mapStatus, setMapStatus] = useState<number | null>(null);
  const [mapScope, setMapScope] = useState<"map" | "set">("map");

  const isAdmin =
    player !== null &&
    (player.priv & ADMINISTRATOR) !== 0;

  const userSearchQuery = useQuery({
    queryKey: ["admin-users", userSearch.trim()],
    queryFn: () => api.searchAdminUsers(userSearch.trim()).then((result) => result.data),
    enabled:
      (userSearch.trim().length >= 2 || /^\d+$/.test(userSearch.trim())) &&
      isAdmin,
  });

  const serverStatsQuery = useQuery({
    queryKey: ["server-stats"],
    queryFn: () => api.fetchServerStats(),
    select: (result) => result.data,
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const onlinePlayersQuery = useQuery({
    queryKey: ["admin-online-players"],
    queryFn: async () => {
      const players: Player[] = [];
      let page = 1;
      while (true) {
        const result = await api.fetchPlayers({
          online: true,
          page,
          pageSize: 100,
        });
        players.push(...result.data);
        if (result.data.length < 100) return players;
        page += 1;
      }
    },
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const offlinePlayersQuery = useQuery({
    queryKey: ["admin-offline-players"],
    queryFn: async () => {
      const players: Awaited<ReturnType<typeof api.fetchAdminUsers>>["data"] = [];
      let page = 1;
      while (true) {
        const result = await api.fetchAdminUsers({
          page,
          pageSize: 100,
          includeHidden: true,
        });
        players.push(...result.data);
        if (result.data.length < 100) return players;
        page += 1;
      }
    },
    enabled: isAdmin && playerListMode === "offline",
    staleTime: 60_000,
  });

  const userQuery = useQuery({
    queryKey: ["admin-user", selectedUserId],
    queryFn: () => api.fetchAdminUser(selectedUserId!).then((result) => result.data),
    enabled: selectedUserId !== null && isAdmin,
  });

  const mapQuery = useQuery({
    queryKey: ["admin-map", selectedMapId],
    queryFn: () => api.fetchAdminMap(selectedMapId!).then((result) => result.data),
    enabled: selectedMapId !== null && isAdmin,
  });

  const userMutation = useMutation({
    mutationFn: (operation: Promise<unknown>) => operation,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-user", selectedUserId] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({
          queryKey: ["admin-player-scores", selectedUserId],
        }),
      ]);
    },
  });

  const mapMutation = useMutation({
    mutationFn: (operation: Promise<unknown>) => operation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-map", selectedMapId] });
    },
  });

  if (isLoading) return <LoadingState label="Checking administrator access..." />;
  if (!player || !isAdmin) return <Navigate to="/" replace />;

  const selectedUser = userQuery.data;
  const selectedMap = mapQuery.data;
  const canManageStaff = (player.priv & DEVELOPER) !== 0;
  const onlinePlayerIds = new Set(
    (onlinePlayersQuery.data ?? []).map((onlinePlayer) => onlinePlayer.id),
  );
  const offlinePlayers = (offlinePlayersQuery.data ?? []).filter(
    (offlinePlayer) => !onlinePlayerIds.has(offlinePlayer.id),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Administration</h1>
        <p className="text-sm text-muted">
          Manage player access, scores, privileges, and beatmap status.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Server overview</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="space-y-1">
            <p className="text-sm text-muted">Players online</p>
            <p className="text-2xl font-semibold text-accent">
              {serverStatsQuery.data
                ? formatAdminNumber(serverStatsQuery.data.online_players)
                : "—"}
            </p>
          </Card>
          <Card className="space-y-1">
            <p className="text-sm text-muted">Registered players</p>
            <p className="text-2xl font-semibold">
              {serverStatsQuery.data
                ? formatAdminNumber(serverStatsQuery.data.total_players)
                : "—"}
            </p>
          </Card>
        </div>
        {serverStatsQuery.error && <ErrorState error={serverStatsQuery.error} />}
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">
                {playerListMode === "online" ? "Online players" : "Offline players"}
              </h3>
              <p className="text-sm text-muted">
                Select a player to open moderation and account controls.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={playerListMode === "online"}
                onClick={() => setPlayerListMode("online")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  playerListMode === "online"
                    ? "bg-accent text-white"
                    : "border border-line bg-surface-2 hover:bg-surface-3"
                }`}
              >
                Online
              </button>
              <button
                type="button"
                aria-pressed={playerListMode === "offline"}
                onClick={() => {
                  setPlayerListMode("offline");
                  setOfflineVisibleCount(20);
                }}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  playerListMode === "offline"
                    ? "bg-accent text-white"
                    : "border border-line bg-surface-2 hover:bg-surface-3"
                }`}
              >
                Offline
              </button>
            </div>
          </div>
          {playerListMode === "online" ? (
            <>
              {onlinePlayersQuery.isPending && (
                <LoadingState label="Loading online players..." />
              )}
              {onlinePlayersQuery.error && (
                <ErrorState error={onlinePlayersQuery.error} />
              )}
              {onlinePlayersQuery.isSuccess &&
                (onlinePlayersQuery.data.length === 0 ? (
                  <EmptyState label="No players are online right now." />
                ) : (
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {onlinePlayersQuery.data.slice(0, 20).map((onlinePlayer) => (
                      <li key={onlinePlayer.id}>
                        <OnlinePlayerButton
                          id={onlinePlayer.id}
                          name={onlinePlayer.name}
                          selected={selectedUserId === onlinePlayer.id}
                          onSelect={() => {
                            setSelectedUserId(onlinePlayer.id);
                            setReason("");
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                ))}
              <Link
                to="/users?online=1"
                className="inline-flex w-fit rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-3"
              >
                Browse online players
              </Link>
            </>
          ) : (
            <>
              {onlinePlayersQuery.isPending && (
                <LoadingState label="Checking online player status..." />
              )}
              {onlinePlayersQuery.error && (
                <ErrorState error={onlinePlayersQuery.error} />
              )}
              {offlinePlayersQuery.isPending && (
                <LoadingState label="Loading offline players..." />
              )}
              {offlinePlayersQuery.error && (
                <ErrorState error={offlinePlayersQuery.error} />
              )}
              {onlinePlayersQuery.isSuccess &&
                offlinePlayersQuery.isSuccess &&
                (offlinePlayers.length === 0 ? (
                  <EmptyState label="No offline players found." />
                ) : (
                  <>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {offlinePlayers
                        .slice(0, offlineVisibleCount)
                        .map((offlinePlayer) => (
                          <li key={offlinePlayer.id}>
                            <OnlinePlayerButton
                              id={offlinePlayer.id}
                              name={offlinePlayer.name}
                              selected={selectedUserId === offlinePlayer.id}
                              onSelect={() => {
                                setSelectedUserId(offlinePlayer.id);
                                setReason("");
                              }}
                            />
                          </li>
                        ))}
                    </ul>
                    {offlineVisibleCount < offlinePlayers.length && (
                      <button
                        type="button"
                        onClick={() =>
                          setOfflineVisibleCount((count) => count + 20)
                        }
                        className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-3"
                      >
                        Load more offline players
                      </button>
                    )}
                  </>
                ))}
            </>
          )}
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Player management</h2>
        <Card className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Find a player</span>
            <input
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Search by username or user ID"
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
            />
          </label>

          {userSearchQuery.error && <ErrorState error={userSearchQuery.error} />}
          {userSearchQuery.isSuccess && (
            <ul className="space-y-1">
              {userSearchQuery.data.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserId(user.id);
                      setReason("");
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2 ${
                      selectedUserId === user.id ? "bg-surface-2" : ""
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Avatar
                        playerId={user.id}
                        alt={`${user.name}'s avatar`}
                        className="h-9 w-9 rounded-lg bg-surface-3 object-cover"
                      />
                      <span className="font-medium">
                        {displayUserName(user.name, user.id)}
                      </span>
                      <span className="text-muted">#{user.id}</span>
                    </span>
                  </button>
                </li>
              ))}
              {userSearchQuery.data.length === 0 && (
                <li className="text-sm text-muted">No matching players.</li>
              )}
            </ul>
          )}
        </Card>

        {userQuery.isPending && selectedUserId !== null && (
          <LoadingState label="Loading player..." />
        )}
        {userQuery.error && <ErrorState error={userQuery.error} />}
        {selectedUser && (
          <PlayerManagement
            user={selectedUser}
            reason={reason}
            setReason={setReason}
            wipeMode={wipeMode}
            setWipeMode={setWipeMode}
            canManageStaff={canManageStaff}
            pending={userMutation.isPending}
            error={userMutation.error}
            onUpdatePrivileges={(privileges) =>
              userMutation.mutate(
                api.updateAdminUserPrivileges(selectedUser.id, privileges),
              )
            }
            onSaveMemo={(memo) =>
              userMutation.mutate(api.updateAdminUserMemo(selectedUser.id, memo))
            }
            onRestrict={() =>
              userMutation.mutate(api.restrictAdminUser(selectedUser.id, reason))
            }
            onUnrestrict={() =>
              userMutation.mutate(api.unrestrictAdminUser(selectedUser.id, reason))
            }
            onWipeScores={() => {
              const label =
                wipeMode === "all"
                  ? "all modes"
                  : MODE_OPTIONS.find((mode) => mode.id === Number(wipeMode))?.label;
              if (!window.confirm(`Permanently wipe ${label} scores for ${selectedUser.name}?`)) {
                return;
              }
              userMutation.mutate(
                api.wipeAdminUserScores(
                  selectedUser.id,
                  wipeMode === "all" ? null : Number(wipeMode),
                ),
              );
            }}
          />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Beatmap ranking status</h2>
        <Card className="space-y-4">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              const id = Number(mapIdInput);
              if (!Number.isSafeInteger(id) || id < 1) return;
              setSelectedMapId(id);
              setMapStatus(null);
            }}
          >
            <input
              value={mapIdInput}
              onChange={(event) => setMapIdInput(event.target.value)}
              inputMode="numeric"
              placeholder="Beatmap ID"
              aria-label="Beatmap ID"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              Load beatmap
            </button>
          </form>

          {mapQuery.error && <ErrorState error={mapQuery.error} />}
          {selectedMap && (
            <MapManagement
              map={selectedMap}
              status={mapStatus ?? selectedMap.status}
              setStatus={setMapStatus}
              scope={mapScope}
              setScope={setMapScope}
              pending={mapMutation.isPending}
              error={mapMutation.error}
              onUpdate={() => {
                const nextStatus = mapStatus ?? selectedMap.status;
                if (
                  !window.confirm(
                    `Set this ${mapScope === "set" ? "beatmap set" : "beatmap"} to ${MAP_STATUSES.find((item) => item.id === nextStatus)?.label ?? nextStatus}?`,
                  )
                ) {
                  return;
                }
                mapMutation.mutate(
                  api.updateAdminMapStatus(selectedMap.id, nextStatus, mapScope),
                );
              }}
            />
          )}
        </Card>
      </section>
    </div>
  );
}

function OnlinePlayerButton({
  id,
  name,
  selected,
  onSelect,
}: {
  id: number;
  name: unknown;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-2 ${
        selected ? "bg-surface-2" : ""
      }`}
    >
      <Avatar
        playerId={id}
        alt={`${displayUserName(name, id)}'s avatar`}
        className="h-9 w-9 rounded-lg bg-surface-3 object-cover"
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {displayUserName(name, id)}
      </span>
      <span className="shrink-0 text-xs text-muted">#{id}</span>
    </button>
  );
}

function AdminScoreRow({ score }: { score: PlayerScore }) {
  const beatmap = score.beatmap;
  const { baseMode, submode } = splitModeId(score.mode);
  const rx = submode === "relax" ? 1 : submode === "autopilot" ? 2 : 0;

  return (
    <li className="flex items-center gap-3 overflow-hidden rounded-xl border border-line bg-surface px-3 py-2 transition-colors hover:bg-surface-2">
      {beatmap ? (
        <BeatmapThumb
          setId={beatmap.set_id}
          className="h-12 w-[5.25rem] shrink-0 rounded-lg"
        />
      ) : (
        <span className="block h-12 w-[5.25rem] shrink-0 rounded-lg bg-surface-3" />
      )}
      <GradeBadge grade={score.grade} />
      <div className="min-w-0 flex-1">
        {beatmap ? (
          <Link
            to={`/b/${beatmap.id}?mode=${baseMode}&rx=${rx}`}
            className="block truncate font-medium hover:text-accent"
          >
            {beatmap.artist} - {beatmap.title}{" "}
            <span className="text-muted">[{beatmap.version}]</span>
          </Link>
        ) : (
          <span className="block truncate font-medium text-muted">
            Unknown beatmap
          </span>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{formatTimeAgo(score.play_time)}</span>
          <ModBadges mods={score.mods} />
          <span>{formatAdminAccuracy(score.acc)}</span>
          <span>{formatAdminNumber(score.max_combo)}x</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-bold text-accent">
          {formatAdminNumber(score.pp)}pp
        </p>
        <p className="text-xs text-muted">{formatAdminNumber(score.score)}</p>
        <Link
          to={`/s/${score.id}`}
          className="text-xs text-accent hover:text-accent-hover"
        >
          View
        </Link>
      </div>
      {score.grade !== "F" && (
        <a
          href={replayDownloadUrl(score.id)}
          download
          aria-label={`Download replay for score ${score.id}`}
          title="Download replay to watch in osu!"
          className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-surface-3 hover:text-slate-100"
        >
          <DownloadIcon />
        </a>
      )}
    </li>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" />
    </svg>
  );
}

function displayUserName(name: unknown, userId: number): string {
  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.trim().toLowerCase() === "nan"
  ) {
    return `User #${userId}`;
  }
  return name;
}

function formatAdminNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? formatNumber(value)
    : "—";
}

function formatAdminAccuracy(value: number): string {
  return Number.isFinite(value) ? formatAccuracy(value) : "—";
}

function PlayerManagement({
  user,
  reason,
  setReason,
  wipeMode,
  setWipeMode,
  canManageStaff,
  pending,
  error,
  onUpdatePrivileges,
  onSaveMemo,
  onRestrict,
  onUnrestrict,
  onWipeScores,
}: {
  user: AdminUser;
  reason: string;
  setReason: (value: string) => void;
  wipeMode: string;
  setWipeMode: (value: string) => void;
  canManageStaff: boolean;
  pending: boolean;
  error: Error | null;
  onUpdatePrivileges: (privileges: number) => void;
  onSaveMemo: (memo: string) => void;
  onRestrict: () => void;
  onUnrestrict: () => void;
  onWipeScores: () => void;
}) {
  const [memoDraft, setMemoDraft] = useState(user.admin_note ?? "");
  useEffect(() => {
    setMemoDraft(user.admin_note ?? "");
  }, [user.id, user.admin_note]);

  const restricted = (user.priv & UNRESTRICTED) === 0;
  const hasStaffRole = (user.priv & (1 << 12 | ADMINISTRATOR | DEVELOPER)) !== 0;
  const canEditRoles = canManageStaff || !hasStaffRole;
  const roleMask = ROLE_OPTIONS.reduce((mask, role) => mask | role.bit, 0);
  const [scoreMode, setScoreMode] = useState(0);
  const [scoreScope, setScoreScope] = useState<"best" | "recent">("best");
  const scoresQuery = useQuery({
    queryKey: ["admin-player-scores", user.id, scoreMode, scoreScope],
    queryFn: () =>
      api.fetchPlayerScores(user.id, {
        scope: scoreScope,
        mode: scoreMode,
        limit: 10,
        ppOnly: true,
        includeFailed: false,
      }).then((result) => result.data),
  });
  const userName = displayUserName(user.name, user.id);

  function toggleRole(bit: number, enabled: boolean) {
    const newRoles = (user.priv & roleMask) & ~bit;
    onUpdatePrivileges(enabled ? newRoles | bit : newRoles);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/u/${user.id}`}
            aria-label={`View ${userName}'s profile`}
            className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Avatar
              playerId={user.id}
              alt={`${userName}'s avatar`}
              className="h-12 w-12 rounded-xl bg-surface-2 object-cover"
            />
          </Link>
          <div>
            <h3 className="text-lg font-semibold">
              {userName} <span className="text-sm text-muted">#{user.id}</span>
            </h3>
            <p className="text-sm text-muted">
              {restricted ? "Restricted" : "Unrestricted"} · {user.country}
            </p>
          </div>
          <Link
            to={`/u/${user.id}`}
            className="ml-auto rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-3"
          >
            View public profile
          </Link>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {ROLE_OPTIONS.filter((role) => canManageStaff || !role.staff).map((role) => (
            <label key={role.bit} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={(user.priv & role.bit) !== 0}
                disabled={!canEditRoles || pending}
                onChange={(event) => toggleRole(role.bit, event.target.checked)}
              />
              {role.label}
            </label>
          ))}
        </div>
        {!canEditRoles && (
          <p className="text-sm text-muted">Only developers can modify staff accounts.</p>
        )}

        <div className="space-y-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Moderation reason</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={2}
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
              placeholder="Required for restricting or unrestricting"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {restricted ? (
              <button
                type="button"
                disabled={pending || reason.trim().length < 3}
                onClick={onUnrestrict}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Unrestrict
              </button>
            ) : (
              <button
                type="button"
                disabled={pending || reason.trim().length < 3}
                onClick={() => {
                  if (window.confirm(`Restrict ${userName}? A notice will be emailed.`)) {
                    onRestrict();
                  }
                }}
                className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 disabled:opacity-50"
              >
                Restrict and email
              </button>
            )}
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Player scores</h3>
            <p className="text-sm text-muted">
              Open score details or download a replay to watch in osu!.
            </p>
          </div>
          <select
            value={scoreMode}
            onChange={(event) => setScoreMode(Number(event.target.value))}
            aria-label="Score game mode"
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
          >
            {MODE_OPTIONS.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>
        <PillTabs
          tabs={[
            { value: "best", label: "Top Play" },
            { value: "recent", label: "Recent Play" },
          ]}
          value={scoreScope}
          onChange={setScoreScope}
          grow
        />
        {scoresQuery.isPending ? (
          <LoadingState label="Loading player scores..." />
        ) : scoresQuery.error ? (
          <ErrorState error={scoresQuery.error} />
        ) : scoresQuery.data.length === 0 ? (
          <EmptyState
            label={
              scoreScope === "best"
                ? "No top plays found for this mode."
                : "No recent plays found for this mode."
            }
          />
        ) : (
          <ul className="space-y-1.5">
            {scoresQuery.data.map((score) => (
              <AdminScoreRow key={score.id} score={score} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">User memo</h3>
          <span className="text-xs text-muted">For staff only</span>
        </div>
        <label className="block space-y-1.5">
          <textarea
            value={memoDraft}
            onChange={(event) => setMemoDraft(event.target.value)}
            rows={5}
            maxLength={2000}
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
            placeholder="Leave a note for this user..."
            disabled={pending}
          />
        </label>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={pending || memoDraft === (user.admin_note ?? "")}
            onClick={() => onSaveMemo(memoDraft)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save memo
          </button>
        </div>
      </Card>

      <Card className="space-y-4">
        <h3 className="text-lg font-semibold">Player statistics</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-2 pr-3">Mode</th>
                <th className="py-2 pr-3">PP</th>
                <th className="py-2 pr-3">Plays</th>
                <th className="py-2">Ranked score</th>
              </tr>
            </thead>
            <tbody>
              {user.stats.map((stat) => (
                <tr key={stat.mode} className="border-t border-line">
                  <td className="py-2 pr-3">{MODE_OPTIONS.find((mode) => mode.id === stat.mode)?.label ?? stat.mode}</td>
                  <td className="py-2 pr-3">{formatAdminNumber(stat.pp)}</td>
                  <td className="py-2 pr-3">{formatAdminNumber(stat.plays)}</td>
                  <td className="py-2">{formatAdminNumber(stat.rscore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={wipeMode}
            onChange={(event) => setWipeMode(event.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
          >
            <option value="all">All modes</option>
            {MODE_OPTIONS.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            onClick={onWipeScores}
            className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 disabled:opacity-50"
          >
            Wipe scores and stats
          </button>
        </div>
      </Card>
      {error && <ErrorState error={error} />}
    </div>
  );
}

function MapManagement({
  map,
  status,
  setStatus,
  scope,
  setScope,
  pending,
  error,
  onUpdate,
}: {
  map: AdminMap;
  status: number;
  setStatus: (value: number) => void;
  scope: "map" | "set";
  setScope: (value: "map" | "set") => void;
  pending: boolean;
  error: Error | null;
  onUpdate: () => void;
}) {
  return (
    <div className="space-y-4 border-t border-line pt-4">
      <div className="flex items-center gap-3">
        <BeatmapThumb
          setId={map.set_id}
          className="h-16 w-24 shrink-0 rounded-xl border border-line bg-surface-2"
        />
        <div className="min-w-0">
          <p className="font-medium">
            {map.artist} - {map.title} [{map.version}]
          </p>
          <p className="text-sm text-muted">
            Map #{map.id} · Set #{map.set_id} · mapped by {map.creator}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={status}
          onChange={(event) => setStatus(Number(event.target.value))}
          className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
        >
          {MAP_STATUSES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value as "map" | "set")}
          className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
        >
          <option value="map">This map only</option>
          <option value="set">Entire set</option>
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={onUpdate}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Update status
        </button>
      </div>
      {error && <ErrorState error={error} />}
    </div>
  );
}
