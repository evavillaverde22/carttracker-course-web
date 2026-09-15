import { Suspense } from "react";
import ProvisioningClient from "./ProvisioningClient";

export default function ProvisioningPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#edf1ea] px-4 py-10">
          <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-[#1d2a24]">
              CartTracker
            </h1>

            <p className="mt-6 text-sm text-gray-500">
              Loading device provisioning...
            </p>
          </div>
        </main>
      }
    >
      <ProvisioningClient />
    </Suspense>
  );
}