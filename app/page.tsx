"use client";

import { useState } from "react";

export default function Home() {
  const [showForm, setShowForm] = useState(false);

  const [selectedDevice, setSelectedDevice] = useState("");
  const [selectedCart, setSelectedCart] = useState("");

  const [devices, setDevices] = useState([
    {
      id: "CT-001",
      status: "Pending",
    },
    {
      id: "CT-002",
      status: "Assigned",
    },
    {
      id: "CT-003",
      status: "Pending",
    },
  ]);

  const carts = [
    {
      id: "CART-01",
      name: "Cart 01",
    },
    {
      id: "CART-02",
      name: "Cart 02",
    },
    {
      id: "CART-03",
      name: "Cart 03",
    },
  ];

  function handleActivate() {
    if (!selectedDevice || !selectedCart) {
      alert("Please select a device and a cart.");
      return;
    }

    setDevices((currentDevices) =>
      currentDevices.map((device) =>
        device.id === selectedDevice
          ? {
              ...device,
              status: "Assigned",
            }
          : device
      )
    );

    alert(
      `Device ${selectedDevice} activated for ${selectedCart}`
    );

    setShowForm(false);
    setSelectedDevice("");
    setSelectedCart("");
  }

  function handleCancel() {
    setShowForm(false);
    setSelectedDevice("");
    setSelectedCart("");
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">

        {/* HEADER */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            CartTracker
          </h1>

          <p className="mt-2 text-gray-600">
            Alicante Golf Club
          </p>
        </header>

        {/* DASHBOARD */}
        <div className="grid gap-6 md:grid-cols-2">

          {/* DEVICES */}
          <section className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">
              Devices
            </h2>

            <div className="space-y-3">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
                >
                  <span className="font-medium text-gray-900">
                    {device.id}
                  </span>

                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                      device.status === "Assigned"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {device.status}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* CARTS */}
          <section className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">
              Golf Carts
            </h2>

            <div className="space-y-3">
              {carts.map((cart) => (
                <div
                  key={cart.id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <span className="font-medium text-gray-900">
                    {cart.name}
                  </span>
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* ACTIVATE BUTTON */}
        <div className="mt-8">
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-black px-6 py-3 font-medium text-white transition hover:bg-gray-800"
          >
            Activate device
          </button>
        </div>

        {/* ACTIVATION FORM */}
        {showForm && (
          <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">
              Activate device
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              Select a pending device and assign it to a golf cart.
            </p>

            <div className="mt-6 space-y-5">

              {/* DEVICE SELECT */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Device
                </label>

                <select
                  value={selectedDevice}
                  onChange={(event) =>
                    setSelectedDevice(event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-900"
                >
                  <option value="">
                    Select a device
                  </option>

                  {devices
                    .filter(
                      (device) =>
                        device.status === "Pending"
                    )
                    .map((device) => (
                      <option
                        key={device.id}
                        value={device.id}
                      >
                        {device.id}
                      </option>
                    ))}
                </select>
              </div>

              {/* CART SELECT */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Golf cart
                </label>

                <select
                  value={selectedCart}
                  onChange={(event) =>
                    setSelectedCart(event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-900"
                >
                  <option value="">
                    Select a cart
                  </option>

                  {carts.map((cart) => (
                    <option
                      key={cart.id}
                      value={cart.id}
                    >
                      {cart.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* FORM BUTTONS */}
              <div className="flex gap-3">
                <button
                  onClick={handleActivate}
                  className="rounded-lg bg-black px-5 py-3 font-medium text-white transition hover:bg-gray-800"
                >
                  Confirm activation
                </button>

                <button
                  onClick={handleCancel}
                  className="rounded-lg border border-gray-300 px-5 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </main>
  );
}