import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";

import { Avatar } from "@/components/Avatar";
import { Flag } from "@/components/Flag";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api/client";
import type { Player } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import { formatTimeAgo } from "@/lib/format";
import { usePageTitle } from "@/lib/usePageTitle";

export function FriendsPage() {
  usePageTitle("Friends", {
    description: "Manage your Inlayo friends list and open player profiles.",
  });

  const { player: me, isLoading } = useAuth();

  const friendsQuery = useQuery({
    queryKey: ["friends", me?.id],
    queryFn: () => api.fetchFriends(me!.id),
    enabled: me !== null,
    select: (envelope) => envelope.data,
  });

  if (isLoading) {
    return null;
  }
  if (!me) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Friends"
        description="Friends added here also show up in-game."
      />

      {friendsQuery.isPending && <LoadingState label="Loading friends..." />}
      {friendsQuery.error && <ErrorState error={friendsQuery.error} />}
      {friendsQuery.isSuccess &&
        (friendsQuery.data.length === 0 ? (
          <EmptyState label="No friends added yet — find players via the search bar and add them from their profile." />
        ) : (
          <ul className="space-y-1.5">
            {friendsQuery.data.map((friend) => (
              <FriendRow key={friend.id} friend={friend} meId={me.id} />
            ))}
          </ul>
        ))}
    </div>
  );
}

function FriendRow({ friend, meId }: { friend: Player; meId: number }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.removeFriend(meId, friend.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["friends", meId] }),
  });

  return (
    <li>
      <Card className="flex items-center gap-3.5">
        <Avatar
          playerId={friend.id}
          className="h-10 w-10 rounded-lg bg-surface-2 object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Flag countryCode={friend.country} />
            <Link
              to={`/u/${friend.id}`}
              className="truncate font-medium hover:text-accent"
            >
              {friend.name}
            </Link>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Last seen {formatTimeAgo(friend.latest_activity)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-3 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Remove
        </button>
      </Card>
    </li>
  );
}
