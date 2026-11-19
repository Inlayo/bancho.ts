import { Link } from "react-router-dom";

import { usePageTitle } from "@/lib/usePageTitle";

export function NotFoundPage() {
  usePageTitle("Not found", {
    description: "The requested Inlayo page could not be found.",
  });

  return (
    <div className="py-24 text-center">
      <p className="text-6xl font-semibold text-accent">404</p>
      <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-xl bg-accent px-6 py-2.5 font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        Back home
      </Link>
    </div>
  );
}
