import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { ErrorMessage } from "@/components/ui/States";

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${String(error.status)} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Something went wrong.";
  return (
    <div className="p-6">
      <ErrorMessage>
        <p className="font-medium">This page hit a problem.</p>
        <p className="mt-1">{message}</p>
      </ErrorMessage>
      <Link
        to="/matches"
        className="mt-4 inline-block text-sm text-blue-700 underline dark:text-blue-400"
      >
        Back to jobs
      </Link>
    </div>
  );
}
