import { Suspense } from "react";
import { auth0 } from "@/lib/auth0";
import ProvisioningClient from "./ProvisioningClient";

export default async function HomePage() {
  // proxy.ts already requires login. The user's name / email is shown in
  // the header and saved as "assigned by" in the assignment history.
  const session = await auth0.getSession();
  const user = session?.user;

  const signedInUser =
    user && (user.name || user.email)
      ? {
          name: user.name ?? null,
          email: user.email ?? null,
        }
      : null;

  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#edf1ea] px-4 py-10">
          <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-[#1d2a24]">
              CartTracker
            </h1>

            <p className="mt-6 text-sm text-gray-500">
              Loading GPS assignment...
            </p>
          </div>
        </main>
      }
    >
      <ProvisioningClient signedInUser={signedInUser} />
    </Suspense>
  );
}