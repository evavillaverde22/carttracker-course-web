"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

// =====================================================
// TYPES
// =====================================================

type Device = {
  device_id?: string;
  thing_name?: string | null;
  imei?: string | null;
  iccid?: string | null;
  cart_id?: string | null;
  course_id?: string | null;
  status?: string | null;
};

type Course = {
  course_id: string;
  name: string;
  pinvision_club_id?: string | null;
};

type Cart = {
  cart_id: string;
  course_id: string;
  assigned_device_id: string | null;
  available: boolean;
};

type Sim = {
  iccid: string;
  status: string;
  assigned_device_id: string | null;
  created_at?: string | null;
};

type SimMode = "known" | "new";

type CartState = "current" | "free" | "occupied";

// =====================================================
// HELPERS
// =====================================================

const ASSIGNED_BY_STORAGE_KEY = "courserev.assignedBy";

const inputClass =
  "w-full rounded-2xl border border-[#d9e1d8] bg-white px-4 py-4 text-[#26312c] outline-none focus:border-[#32634f] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

async function readErrorMessage(
  response: Response,
  fallback: string
) {
  try {
    const data = await response.json();
    return data.message ?? data.error ?? fallback;
  } catch {
    return fallback;
  }
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

// =====================================================
// COMPONENT
// =====================================================
//
// Flow: QR (device_id) → device → course (from the device)
// → current cart → search / select new cart → "Assigned by"
// → confirm. IMEI / ICCID live in the secondary "Device setup".

export default function ProvisioningPage() {
  const searchParams = useSearchParams();
  const deviceId = searchParams.get("device_id");

  // ---------------- Data ----------------
  const [device, setDevice] = useState<Device | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [sims, setSims] = useState<Sim[]>([]);

  // ---------------- Form ----------------
  const [assignedBy, setAssignedBy] = useState("");
  const [cartQuery, setCartQuery] = useState("");
  const [selectedCart, setSelectedCart] = useState("");
  const [cartListOpen, setCartListOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [confirmReplace, setConfirmReplace] = useState(false);

  // Device setup (secondary)
  const [setupOpen, setSetupOpen] = useState(false);
  const [imei, setImei] = useState("");
  const [simMode, setSimMode] = useState<SimMode>("known");
  const [selectedSim, setSelectedSim] = useState("");
  const [newIccid, setNewIccid] = useState("");

  // ---------------- Loading ----------------
  const [loadingDevice, setLoadingDevice] = useState(true);
  const [loadingCarts, setLoadingCarts] = useState(false);
  const [loadingSims, setLoadingSims] = useState(false);
  const [simsLoaded, setSimsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingUnassign, setConfirmingUnassign] =
    useState(false);

  // ---------------- Messages ----------------
  const [deviceError, setDeviceError] = useState("");
  const [cartsError, setCartsError] = useState("");
  const [simsError, setSimsError] = useState("");
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const assignedByRef = useRef<HTMLInputElement>(null);

  function clearMessages() {
    setActionError("");
    setSuccessMessage("");
  }

  // =====================================================
  // REMEMBER "ASSIGNED BY" ON THIS PHONE
  // =====================================================

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(
        ASSIGNED_BY_STORAGE_KEY
      );
      if (saved) setAssignedBy(saved);
    } catch {
      // storage unavailable: ignore
    }
  }, []);

  function rememberAssignedBy(value: string) {
    try {
      window.localStorage.setItem(ASSIGNED_BY_STORAGE_KEY, value);
    } catch {
      // storage unavailable: ignore
    }
  }

  // =====================================================
  // LOAD SIMS (only when Device setup is opened)
  // =====================================================

  const loadAvailableSims = useCallback(async () => {
    try {
      setLoadingSims(true);
      setSimsError("");

      const response = await fetch(`/api/backend/sims/available`);

      if (!response.ok) {
        throw new Error(
          `Error ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();
      setSims(data.sims ?? []);
      setSimsLoaded(true);
    } catch (error) {
      console.error("Error loading SIMs:", error);
      setSimsError("Could not load available SIMs.");
      setSims([]);
    } finally {
      setLoadingSims(false);
    }
  }, []);

  function openSetup() {
    setSetupOpen(true);
    if (!simsLoaded && !loadingSims) loadAvailableSims();
  }

  function toggleSetup() {
    if (setupOpen) setSetupOpen(false);
    else openSetup();
  }

  // =====================================================
  // LOAD DEVICE
  // =====================================================

  const loadDevice = useCallback(async () => {
    if (!deviceId) {
      setLoadingDevice(false);
      return null;
    }

    try {
      setLoadingDevice(true);
      setDeviceError("");

      const response = await fetch(
        `/api/backend/devices/${encodeURIComponent(deviceId)}`
      );

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? `GPS ${deviceId} is not registered. Create it in Admin Web first.`
            : `Could not load this GPS (error ${response.status}).`
        );
      }

      const data: Device = await response.json();

      setDevice(data);
      setImei(data.imei ?? "");
      setNewIccid("");
      setSimMode("known");
      setSelectedSim(data.iccid ?? "");

      return data;
    } catch (error) {
      console.error("Error loading device:", error);
      setDeviceError(
        error instanceof Error
          ? error.message
          : "Could not load this GPS."
      );
      return null;
    } finally {
      setLoadingDevice(false);
    }
  }, [deviceId]);

  useEffect(() => {
    loadDevice();
  }, [loadDevice]);

  // =====================================================
  // LOAD CARTS OF THE DEVICE'S COURSE
  // =====================================================

  const courseId = device?.course_id ?? null;

  const loadCarts = useCallback(async (id: string) => {
    try {
      setLoadingCarts(true);
      setCartsError("");

      const response = await fetch(
        `/api/backend/courses/${encodeURIComponent(id)}/carts`
      );

      if (!response.ok) {
        throw new Error(
          `Error ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();
      setCourse(data.course ?? null);
      setCarts(data.carts ?? []);
    } catch (error) {
      console.error("Error loading carts:", error);
      setCartsError("Could not load the carts of this golf course.");
      setCarts([]);
    } finally {
      setLoadingCarts(false);
    }
  }, []);

  useEffect(() => {
    if (courseId) loadCarts(courseId);
  }, [courseId, loadCarts]);

  // Device without IMEI: open Device setup so it can be added.
  useEffect(() => {
    if (device && !device.imei && !setupOpen) openSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device]);

  // =====================================================
  // DERIVED DATA
  // =====================================================

  const currentCartId = device?.cart_id ?? null;
  const courseLabel = course?.name ?? courseId ?? "";

  function cartState(cart: Cart): CartState {
    if (
      cart.assigned_device_id === deviceId ||
      cart.cart_id === currentCartId
    ) {
      return "current";
    }

    return cart.assigned_device_id ? "occupied" : "free";
  }

  const sortedCarts = useMemo(
    () =>
      [...carts].sort((a, b) =>
        naturalCompare(a.cart_id, b.cart_id)
      ),
    [carts]
  );

  const filteredCarts = useMemo(() => {
    const query = cartQuery.trim().toLowerCase();

    if (!query || query === selectedCart.toLowerCase()) {
      return sortedCarts;
    }

    const queryNumber = digitsOnly(query);

    const matches = sortedCarts.filter(
      (cart) =>
        cart.cart_id.toLowerCase().includes(query) ||
        (cart.assigned_device_id ?? "")
          .toLowerCase()
          .includes(query)
    );

    // Exact number first: typing "3" puts CART_003 above CART_013.
    if (queryNumber) {
      matches.sort((a, b) => {
        const aExact =
          Number(digitsOnly(a.cart_id)) === Number(queryNumber);
        const bExact =
          Number(digitsOnly(b.cart_id)) === Number(queryNumber);
        if (aExact === bExact) return 0;
        return aExact ? -1 : 1;
      });
    }

    return matches;
  }, [cartQuery, selectedCart, sortedCarts]);

  const selectedCartData = carts.find(
    (cart) => cart.cart_id === selectedCart
  );

  const selectedCartState = selectedCartData
    ? cartState(selectedCartData)
    : null;

  const freeCount = carts.filter(
    (cart) => cartState(cart) === "free"
  ).length;

  // ---------------- Device setup ----------------

  const currentDeviceIccid = device?.iccid ?? "";

  const selectableSims = [
    ...(currentDeviceIccid
      ? [
          {
            iccid: currentDeviceIccid,
            status: "assigned",
            assigned_device_id: deviceId,
          },
        ]
      : []),
    ...sims.filter((sim) => sim.iccid !== currentDeviceIccid),
  ];

  const cleanImei = digitsOnly(imei);
  const cleanIccid = digitsOnly(
    simMode === "known" ? selectedSim : newIccid
  );

  // Only sent when changed in Device setup.
  const imeiChanged =
    cleanImei !== "" && cleanImei !== (device?.imei ?? "");
  const iccidChanged =
    cleanIccid !== "" &&
    cleanIccid !== digitsOnly(device?.iccid ?? "");
  const setupChanged = imeiChanged || iccidChanged;

  const imeiInvalid =
    cleanImei !== "" && !/^\d{15}$/.test(cleanImei);
  const iccidInvalid =
    cleanIccid !== "" && !/^\d{18,22}$/.test(cleanIccid);

  const hasImei = !!device?.imei || (cleanImei !== "" && !imeiInvalid);

  // ---------------- Main action ----------------

  const sameCart =
    !!selectedCart && selectedCartState === "current";

  const actionLabel = (() => {
    if (!selectedCart) return "Select a cart";

    if (sameCart) {
      return setupChanged
        ? "Save device setup"
        : `Already on ${selectedCart}`;
    }

    if (selectedCartState === "occupied") {
      return `Replace GPS on ${selectedCart}`;
    }

    if (currentCartId) {
      return `Move from ${currentCartId} to ${selectedCart}`;
    }

    return `Assign to ${selectedCart}`;
  })();

  const canSubmit =
    !saving &&
    !loadingDevice &&
    !deviceError &&
    !!courseId &&
    assignedBy.trim().length > 0 &&
    !!selectedCart &&
    hasImei &&
    !imeiInvalid &&
    !iccidInvalid &&
    (!sameCart || setupChanged) &&
    (selectedCartState !== "occupied" || confirmReplace);

  // =====================================================
  // CART PICKER
  // =====================================================

  function selectCart(cart: Cart) {
    setSelectedCart(cart.cart_id);
    setCartQuery(cart.cart_id);
    setCartListOpen(false);
    setConfirmReplace(false);
    clearMessages();
  }

  function handleCartKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCartListOpen(true);
      setHighlightIndex((index) =>
        Math.min(index + 1, filteredCarts.length - 1)
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const cart = filteredCarts[highlightIndex];
      if (cart) selectCart(cart);
    } else if (event.key === "Escape") {
      setCartListOpen(false);
    }
  }

  async function refreshAfterChange() {
    await loadDevice();
    if (courseId) await loadCarts(courseId);
    if (simsLoaded) await loadAvailableSims();
  }

  function requireAssignedBy() {
    const who = assignedBy.trim();

    if (!who) {
      setActionError(
        "Enter the name of the person making the change in “Assigned by”."
      );
      assignedByRef.current?.focus();
      return null;
    }

    rememberAssignedBy(who);
    return who;
  }

  // =====================================================
  // ASSIGN / MOVE / REPLACE
  // =====================================================

  async function handleAssign() {
    clearMessages();

    if (!deviceId || !courseId) return;

    const who = requireAssignedBy();
    if (!who) return;

    if (!selectedCart) {
      setActionError("Select a cart.");
      return;
    }

    if (!hasImei || imeiInvalid) {
      setActionError(
        imeiInvalid
          ? "IMEI must be exactly 15 digits."
          : "This GPS has no IMEI yet. Add it in Device setup."
      );
      openSetup();
      return;
    }

    if (iccidInvalid) {
      setActionError("ICCID must be between 18 and 22 digits.");
      openSetup();
      return;
    }

    if (selectedCartState === "occupied" && !confirmReplace) {
      setActionError(
        "Confirm that you want to replace the GPS on this cart."
      );
      return;
    }

    const previousCart = currentCartId;
    const replacing = selectedCartState === "occupied";

    const payload = {
      course_id: courseId,
      cart_id: selectedCart,
      assigned_by: who,
      changed_by: who,
      replace_existing: replacing,
      reason: replacing
        ? `Replaced GPS on ${selectedCart} via QR`
        : previousCart
        ? `Moved from ${previousCart} to ${selectedCart} via QR`
        : `Assigned to ${selectedCart} via QR`,
      ...(imeiChanged ? { imei: cleanImei } : {}),
      ...(iccidChanged ? { iccid: cleanIccid } : {}),
    };

    try {
      setSaving(true);

      const response = await fetch(
        `/api/backend/devices/${encodeURIComponent(deviceId)}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error(
          await readErrorMessage(
            response,
            `Error ${response.status} while saving.`
          )
        );
      }

      const result = await response.json().catch(() => ({}));

      let message: string;

      if (sameCart) {
        message = `Device setup for ${deviceId} has been saved.`;
      } else if (previousCart) {
        message = `GPS ${deviceId} moved from ${previousCart} to ${selectedCart}. From now on its data belongs to ${selectedCart}.`;
      } else {
        message = `GPS ${deviceId} assigned to ${selectedCart} (${courseLabel}).`;
      }

      if (result.replaced_device_id) {
        message += ` GPS ${result.replaced_device_id} no longer has a cart.`;
      }

      setSuccessMessage(message);
      setConfirmReplace(false);
      await refreshAfterChange();
    } catch (error) {
      console.error("Error assigning device:", error);
      setActionError(
        error instanceof Error
          ? error.message
          : "Something went wrong while saving."
      );
    } finally {
      setSaving(false);
    }
  }

  // =====================================================
  // UNASSIGN
  // =====================================================

  async function handleUnassign() {
    clearMessages();

    if (!deviceId || !currentCartId) return;

    const who = requireAssignedBy();

    if (!who) {
      setConfirmingUnassign(false);
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `/api/backend/devices/${encodeURIComponent(deviceId)}/unassign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assigned_by: who,
            changed_by: who,
            reason: `Unassigned from ${currentCartId} via QR`,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          await readErrorMessage(
            response,
            `Error ${response.status} while unassigning.`
          )
        );
      }

      setSuccessMessage(
        `GPS ${deviceId} has been removed from ${currentCartId}. It stays in ${courseLabel} without a cart.`
      );

      setSelectedCart("");
      setCartQuery("");
      await refreshAfterChange();
    } catch (error) {
      console.error("Error unassigning device:", error);
      setActionError(
        error instanceof Error
          ? error.message
          : "Something went wrong while unassigning."
      );
    } finally {
      setSaving(false);
      setConfirmingUnassign(false);
    }
  }

  // =====================================================
  // NO DEVICE ID IN THE QR
  // =====================================================

  if (!deviceId) {
    return (
      <main className="min-h-screen bg-[#edf1ea] px-4 py-10">
        <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-[#1d2a24]">
            Courserev
          </h1>
          <p className="mt-6 font-medium text-red-600">
            No GPS detected.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Open this page by scanning the QR code on the GPS.
          </p>
        </div>
      </main>
    );
  }

  const noCourse = !!device && !deviceError && !courseId;
  const showMainFlow = !!device && !deviceError && !!courseId;

  // =====================================================
  // PAGE
  // =====================================================

  return (
    <main className="min-h-screen bg-[#edf1ea] px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {/* HEADER */}
        <header className="mb-6 px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#32634f] text-sm font-bold text-white">
              CR
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#202b27]">
                Courserev
              </h1>
              <p className="text-sm text-gray-500">
                GPS cart assignment
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-[28px] bg-[#fafbf8] p-6 shadow-sm sm:p-10">
          <h2 className="text-3xl font-bold tracking-tight text-[#202824]">
            Assign GPS to a cart
          </h2>
          <p className="mt-3 text-sm leading-6 text-gray-500">
            Choose the cart this GPS is installed on. If it was on
            another cart, its new data will belong to the new cart
            from now on.
          </p>

          {/* =================================================
              DEVICE + COURSE + CURRENT CART
          ================================================= */}
          <div className="mt-8 rounded-2xl border border-[#dfe6dc] bg-white p-5">
            {loadingDevice && !device && (
              <p className="text-sm text-gray-500">Loading GPS...</p>
            )}

            {deviceError && (
              <div className="rounded-xl bg-red-50 p-4">
                <p className="font-medium text-red-700">
                  GPS not available
                </p>
                <p className="mt-1 text-sm text-red-600">
                  {deviceError}
                </p>
              </div>
            )}

            {device && !deviceError && (
              <>
                <div className="grid gap-5 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase text-gray-400">
                      GPS
                    </p>
                    <p className="mt-1 break-all font-bold text-[#202824]">
                      {device.device_id ?? deviceId}
                    </p>
                    {device.status && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {device.status}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs uppercase text-gray-400">
                      Golf course
                    </p>
                    <p className="mt-1 font-semibold text-[#202824]">
                      {courseId
                        ? courseLabel || "Loading..."
                        : "Not set"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase text-gray-400">
                      Current cart
                    </p>
                    {currentCartId ? (
                      <p className="mt-1 font-semibold text-[#202824]">
                        {currentCartId}
                      </p>
                    ) : (
                      <p className="mt-1 font-semibold text-amber-700">
                        No cart
                      </p>
                    )}
                  </div>
                </div>

                {currentCartId && showMainFlow && (
                  <div className="mt-5 border-t border-[#eef1ec] pt-4">
                    {!confirmingUnassign ? (
                      <button
                        type="button"
                        onClick={() => {
                          clearMessages();
                          setConfirmingUnassign(true);
                        }}
                        disabled={saving}
                        className="text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        Remove from {currentCartId}
                      </button>
                    ) : (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <p className="text-sm text-red-700">
                          Remove this GPS from{" "}
                          <strong>{currentCartId}</strong>? It
                          stays in {courseLabel} without a cart
                          until it’s assigned again.
                        </p>
                        <div className="mt-3 flex gap-3">
                          <button
                            type="button"
                            onClick={handleUnassign}
                            disabled={saving}
                            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {saving ? "Removing..." : "Yes, remove"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmingUnassign(false)
                            }
                            disabled={saving}
                            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Device without a golf course */}
          {noCourse && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="font-semibold text-amber-800">
                This GPS isn’t linked to a golf course yet
              </p>
              <p className="mt-1 text-sm text-amber-700">
                Set its golf course in Admin Web, then scan the QR
                code again.
              </p>
            </div>
          )}

          {showMainFlow && (
            <>
              {/* =============================================
                  NEW CART (searchable)
              ============================================= */}
              <div className="mt-8">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[#202824]">
                      New cart *
                    </h3>
                    <p className="mt-1 text-xs text-gray-400">
                      Type a cart number or pick it from the list.
                    </p>
                  </div>
                  {!loadingCarts && carts.length > 0 && (
                    <p className="text-xs text-gray-400">
                      {freeCount} free / {carts.length}
                    </p>
                  )}
                </div>

                <div className="relative mt-3">
                  <input
                    type="text"
                    role="combobox"
                    aria-expanded={cartListOpen}
                    aria-controls="cart-listbox"
                    value={cartQuery}
                    onChange={(event) => {
                      setCartQuery(event.target.value);
                      setSelectedCart("");
                      setConfirmReplace(false);
                      setCartListOpen(true);
                      setHighlightIndex(0);
                      clearMessages();
                    }}
                    onFocus={() => {
                      setCartListOpen(true);
                      setHighlightIndex(0);
                    }}
                    onBlur={() =>
                      setTimeout(() => setCartListOpen(false), 120)
                    }
                    onKeyDown={handleCartKeyDown}
                    disabled={loadingCarts || saving}
                    placeholder={
                      loadingCarts
                        ? "Loading carts..."
                        : "Search cart, e.g. 12"
                    }
                    autoComplete="off"
                    inputMode="search"
                    className={`${inputClass} pr-24`}
                  />

                  <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    {cartQuery && !saving && (
                      <button
                        type="button"
                        aria-label="Clear"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setCartQuery("");
                          setSelectedCart("");
                          setConfirmReplace(false);
                          setCartListOpen(true);
                        }}
                        className="rounded-full px-2 text-lg text-gray-400 hover:text-gray-600"
                      >
                        ×
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Show all carts"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setCartListOpen((open) => !open)}
                      disabled={loadingCarts || saving}
                      className={`rounded-full px-2 text-gray-400 transition-transform hover:text-gray-600 ${
                        cartListOpen ? "rotate-180" : ""
                      }`}
                    >
                      ▾
                    </button>
                  </div>

                  {cartListOpen && !loadingCarts && (
                    <ul
                      id="cart-listbox"
                      role="listbox"
                      className="absolute z-10 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-[#d9e1d8] bg-white py-2 shadow-lg"
                    >
                      {filteredCarts.length === 0 && (
                        <li className="px-4 py-3 text-sm text-gray-500">
                          No carts match “{cartQuery}”.
                        </li>
                      )}

                      {filteredCarts.map((cart, index) => (
                        <li
                          key={cart.cart_id}
                          role="option"
                          aria-selected={cart.cart_id === selectedCart}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            selectCart(cart);
                          }}
                          onMouseEnter={() => setHighlightIndex(index)}
                          className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-3 ${
                            index === highlightIndex
                              ? "bg-[#edf5f0]"
                              : ""
                          }`}
                        >
                          <span className="font-medium text-[#26312c]">
                            {cart.cart_id}
                          </span>
                          <CartBadge
                            state={cartState(cart)}
                            deviceId={cart.assigned_device_id}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {cartsError && (
                  <p className="mt-2 text-sm text-red-600">
                    {cartsError}
                  </p>
                )}

                {!loadingCarts && !cartsError && carts.length === 0 && (
                  <p className="mt-2 text-sm text-amber-700">
                    This golf course has no carts yet. Add them in
                    Admin Web.
                  </p>
                )}

                {/* Replace warning */}
                {selectedCartState === "occupied" && selectedCartData && (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="font-semibold text-amber-800">
                      {selectedCart} already has a GPS
                    </p>
                    <p className="mt-1 text-sm text-amber-700">
                      GPS{" "}
                      <strong>{selectedCartData.assigned_device_id}</strong>{" "}
                      will be left without a cart (it stays in{" "}
                      {courseLabel}). Its past data stays with{" "}
                      {selectedCart}.
                    </p>
                    <label className="mt-3 flex items-center gap-2 text-sm font-medium text-amber-900">
                      <input
                        type="checkbox"
                        checked={confirmReplace}
                        onChange={(event) =>
                          setConfirmReplace(event.target.checked)
                        }
                        disabled={saving}
                        className="h-4 w-4 accent-[#32634f]"
                      />
                      Replace it with this GPS
                    </label>
                  </div>
                )}

                {/* Move summary */}
                {selectedCart &&
                  selectedCartState === "free" &&
                  currentCartId && (
                    <p className="mt-3 rounded-2xl bg-[#edf5f0] p-4 text-sm text-[#2c4a3d]">
                      This GPS will leave{" "}
                      <strong>{currentCartId}</strong>, which becomes
                      free. Data recorded so far stays with{" "}
                      {currentCartId}.
                    </p>
                  )}
              </div>

              {/* =============================================
                  ASSIGNED BY
              ============================================= */}
              <div className="mt-7">
                <h3 className="font-semibold text-[#202824]">
                  Assigned by *
                </h3>
                <p className="mt-1 text-xs text-gray-400">
                  Name of the person making the change. It’s saved
                  in the assignment history.
                </p>
                <input
                  ref={assignedByRef}
                  type="text"
                  value={assignedBy}
                  onChange={(event) => {
                    setAssignedBy(event.target.value);
                    clearMessages();
                  }}
                  disabled={saving}
                  placeholder="Your name"
                  autoComplete="name"
                  className={`mt-3 ${inputClass}`}
                />
              </div>

              {/* =============================================
                  ERROR / SUCCESS
              ============================================= */}
              {actionError && (
                <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5">
                  <p className="font-semibold text-red-700">
                    Couldn’t save the change
                  </p>
                  <p className="mt-1 text-sm text-red-600">
                    {actionError}
                  </p>
                </div>
              )}

              {successMessage && (
                <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 font-bold text-white">
                      ✓
                    </div>
                    <div>
                      <p className="font-bold text-green-800">Done</p>
                      <p className="mt-1 text-sm leading-6 text-green-700">
                        {successMessage}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* =============================================
                  CONFIRM
              ============================================= */}
              <button
                onClick={handleAssign}
                disabled={!canSubmit}
                className="mt-8 w-full rounded-2xl bg-[#32634f] px-6 py-4 font-semibold text-white transition hover:bg-[#28513f] disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {saving ? "Saving..." : actionLabel}
              </button>

              {selectedCart && !assignedBy.trim() && (
                <p className="mt-2 text-center text-xs text-gray-500">
                  Enter your name in “Assigned by” to continue.
                </p>
              )}

              {/* =============================================
                  DEVICE SETUP (secondary)
              ============================================= */}
              <div className="mt-10 rounded-2xl border border-[#dfe6dc] bg-white">
                <button
                  type="button"
                  onClick={toggleSetup}
                  aria-expanded={setupOpen}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <div>
                    <p className="font-semibold text-[#202824]">
                      Device setup (IMEI / ICCID)
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {!device?.imei
                        ? "This GPS has no IMEI yet. Add it before assigning a cart."
                        : "Only needed during installation or to change the SIM."}
                    </p>
                  </div>
                  <span
                    className={`text-gray-400 transition-transform ${
                      setupOpen ? "rotate-180" : ""
                    }`}
                  >
                    ▾
                  </span>
                </button>

                {setupOpen && (
                  <div className="border-t border-[#eef1ec] px-5 pb-5 pt-4">
                    {/* IMEI */}
                    <h4 className="text-sm font-semibold text-[#202824]">
                      IMEI{!device?.imei ? " *" : ""}
                    </h4>
                    <p className="mt-1 text-xs text-gray-400">
                      The 15 digits printed on the MT700.
                    </p>
                    <input
                      type="text"
                      value={imei}
                      onChange={(event) => {
                        setImei(
                          digitsOnly(event.target.value).slice(0, 15)
                        );
                        clearMessages();
                      }}
                      disabled={saving}
                      placeholder="15-digit IMEI"
                      autoComplete="off"
                      inputMode="numeric"
                      className={`mt-3 ${inputClass}`}
                    />
                    <p
                      className={`mt-2 text-right text-xs ${
                        imeiInvalid ? "text-red-600" : "text-gray-400"
                      }`}
                    >
                      {imei.length}/15
                    </p>

                    {/* SIM */}
                    <h4 className="mt-4 text-sm font-semibold text-[#202824]">
                      SIM / ICCID
                    </h4>
                    <p className="mt-1 text-xs text-gray-400">
                      Pick a SIM from inventory or add a new one.
                    </p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {(["known", "new"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            setSimMode(mode);
                            if (mode === "known") {
                              setNewIccid("");
                              setSelectedSim(currentDeviceIccid);
                            } else {
                              setSelectedSim("");
                            }
                            clearMessages();
                          }}
                          disabled={saving}
                          className={`rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60 ${
                            simMode === mode
                              ? "border-[#32634f] bg-[#edf5f0]"
                              : "border-[#d9e1d8] bg-white"
                          }`}
                        >
                          <p className="text-sm font-semibold text-[#202824]">
                            {mode === "known" ? "Existing SIM" : "New SIM"}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {mode === "known"
                              ? "Choose from available inventory."
                              : "Type a new ICCID manually."}
                          </p>
                        </button>
                      ))}
                    </div>

                    {simMode === "known" && (
                      <div className="mt-3">
                        <select
                          value={selectedSim}
                          onChange={(event) => {
                            setSelectedSim(event.target.value);
                            clearMessages();
                          }}
                          disabled={
                            saving ||
                            loadingSims ||
                            !!simsError ||
                            selectableSims.length === 0
                          }
                          className={inputClass}
                        >
                          <option value="">
                            {loadingSims
                              ? "Loading SIMs..."
                              : selectableSims.length === 0
                              ? "No SIMs available"
                              : "Select a SIM"}
                          </option>
                          {selectableSims.map((sim) => (
                            <option key={sim.iccid} value={sim.iccid}>
                              {sim.iccid}
                              {sim.iccid === currentDeviceIccid
                                ? " · current SIM"
                                : ""}
                            </option>
                          ))}
                        </select>

                        {simsError && (
                          <p className="mt-2 text-sm text-red-600">
                            {simsError}
                          </p>
                        )}

                        {!loadingSims &&
                          !simsError &&
                          simsLoaded &&
                          selectableSims.length === 0 && (
                            <p className="mt-2 text-sm text-amber-700">
                              No SIMs available. Use “New SIM” to enter
                              an ICCID.
                            </p>
                          )}
                      </div>
                    )}

                    {simMode === "new" && (
                      <div className="mt-3">
                        <input
                          type="text"
                          value={newIccid}
                          onChange={(event) => {
                            setNewIccid(
                              digitsOnly(event.target.value).slice(0, 22)
                            );
                            clearMessages();
                          }}
                          disabled={saving}
                          placeholder="New SIM ICCID"
                          autoComplete="off"
                          inputMode="numeric"
                          className={inputClass}
                        />
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p
                            className={`text-xs ${
                              iccidInvalid ? "text-red-600" : "text-gray-400"
                            }`}
                          >
                            18–22 digits.
                          </p>
                          <p className="text-xs text-gray-400">
                            {newIccid.length}/22
                          </p>
                        </div>
                      </div>
                    )}

                    <p className="mt-4 text-xs text-gray-400">
                      Changes here are saved with the main button
                      above. To only update IMEI / ICCID, select the
                      current cart.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

// =====================================================
// CART BADGE
// =====================================================

function CartBadge({
  state,
  deviceId,
}: {
  state: CartState;
  deviceId: string | null;
}) {
  if (state === "current") {
    return (
      <span className="rounded-full bg-[#dcebe2] px-2.5 py-1 text-xs font-semibold text-[#2c5a46]">
        This GPS
      </span>
    );
  }

  if (state === "occupied") {
    return (
      <span className="max-w-[55%] truncate rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
        Has {deviceId}
      </span>
    );
  }

  return (
    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
      Free
    </span>
  );
}
