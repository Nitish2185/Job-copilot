import { createHashRouter, Navigate, RouterProvider } from "react-router";
import { Layout } from "./layout/Layout";
import { CompaniesPage } from "./pages/CompaniesPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { NeedsYouPage } from "./pages/NeedsYouPage";
import { ResumesPage } from "./pages/ResumesPage";
import { ReviewPage } from "./pages/ReviewPage";
import { TailorPage } from "./pages/TailorPage";
import { MatchesPage } from "./pages/MatchesPage";
import { ProfilePage } from "./pages/ProfilePage";
import { OnboardingPage } from "./onboarding/OnboardingPage";
import { RouteError } from "./pages/RouteError";
import { SettingsPage } from "./pages/SettingsPage";

/** Extension pages need hash routing (spec 4). Every route has an error boundary. */
const router = createHashRouter([
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/matches" replace /> },
      { path: "matches", element: <MatchesPage />, errorElement: <RouteError /> },
      { path: "jobs/:id", element: <JobDetailPage />, errorElement: <RouteError /> },
      { path: "jobs/:id/resume", element: <TailorPage />, errorElement: <RouteError /> },
      { path: "review", element: <ReviewPage />, errorElement: <RouteError /> },
      { path: "needs-you", element: <NeedsYouPage />, errorElement: <RouteError /> },
      { path: "resumes", element: <ResumesPage />, errorElement: <RouteError /> },
      { path: "profile", element: <ProfilePage />, errorElement: <RouteError /> },
      { path: "companies", element: <CompaniesPage />, errorElement: <RouteError /> },
      { path: "settings", element: <SettingsPage />, errorElement: <RouteError /> },
      { path: "onboarding", element: <OnboardingPage />, errorElement: <RouteError /> },
      { path: "*", element: <Navigate to="/matches" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
