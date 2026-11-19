import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { Pagination } from "@/components/Pagination";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { api } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { usePageTitle } from "@/lib/usePageTitle";

const PAGE_SIZE = 50;

export function ClansPage() {
  usePageTitle("Clans", {
    description:
      "Browse player clans on Inlayo, view clan tags and members, and open individual clan profiles.",
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const pageParam = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1;

  const { data, isPending, error } = useQuery({
    queryKey: ["clans", page],
    queryFn: () => api.fetchClans({ page, pageSize: PAGE_SIZE }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clans"
        description="Player-run clans on the server, created and joined in-game."
      />

      {isPending ? (
        <LoadingState label="Loading clans..." />
      ) : error ? (
        <ErrorState error={error} />
      ) : data.data.length === 0 ? (
        <EmptyState label="No clans have been created yet." />
      ) : (
        <>
          <Card padded={false}>
            <ul className="divide-y divide-line/50">
              {data.data.map((clan) => (
                <li key={clan.id}>
                  <Link
                    to={`/clan/${clan.id}`}
                    className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span className="w-20 shrink-0 font-bold text-accent">
                      [{clan.tag}]
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {clan.name}
                    </span>
                    <span className="text-xs text-muted">
                      est. {formatDate(clan.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Pagination
            page={page}
            hasNextPage={data.data.length === PAGE_SIZE}
            onPageChange={(nextPage) =>
              setSearchParams((params) => {
                params.set("page", String(nextPage));
                return params;
              })
            }
          />
        </>
      )}
    </div>
  );
}
