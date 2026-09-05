import { redirect } from "next/navigation";

// Middleware already ensures only authenticated requests reach this route;
// the app has no marketing/landing page in this phase.
export default function RootPage() {
  redirect("/dashboard");
}
