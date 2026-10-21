"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  CreditCard,
  Flag,
  Info,
  LoaderCircle,
  LogOut,
  QrCode,
  Radio,
  RefreshCw,
  Search,
  ShoppingCart,
  Smartphone,
  TriangleAlert,
  Unlink,
  UserRound,
  X,
} from "lucide-react";

import trackerImage from "@/public/images/gps-tracker-3d.webp";

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

// Person logged in with Auth0 (read on the server in page.tsx). Their
// name, or email, is saved as "assigned by" in the assignment history.
export type SignedInUser = {
  name: string | null;
  email: string | null;
};

type CartState = "current" | "free" | "occupied";

// =====================================================
// HELPERS
// =====================================================

const ASSIGNED_BY_STORAGE_KEY = "courserev.assignedBy";

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

export default function ProvisioningPage({
  signedInUser = null,
}: {
  signedInUser?: SignedInUser | null;
}) {
  const searchParams = useSearchParams();
  const deviceId = searchParams.get("device_id");

  // ---------------- Data ----------------
  const [device, setDevice] = useState<Device | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [sims, setSims] = useState<Sim[]>([]);

  // ---------------- Form ----------------
  const [assignedBy, setAssignedBy] = useState(
    signedInUser?.name || signedInUser?.email || ""
  );
  const [cartQuery, setCartQuery] = useState("");
  const [selectedCart, setSelectedCart] = useState("");
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
    // Signed-in user: the name comes from the login.
    if (signedInUser?.name || signedInUser?.email) return;

    try {
      const saved = window.localStorage.getItem(
        ASSIGNED_BY_STORAGE_KEY
      );
      if (saved) setAssignedBy(saved);
    } catch {
      // storage unavailable: ignore
    }
  }, [signedInUser?.name, signedInUser?.email]);

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
    setConfirmReplace(false);
    clearMessages();
  }

  function handleCartKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
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
      <PageShell user={signedInUser}>
        <Notice
          tone="red"
          title="No GPS detected"
          text="Open this page by scanning the QR code on the GPS."
        />
      </PageShell>
    );
  }

  const noCourse = !!device && !deviceError && !courseId;
  const showMainFlow = !!device && !deviceError && !!courseId;
  const setupRequired = !!device && !device.imei;

  // Sentence for the summary above the main button.
  const summary = (() => {
    if (!selectedCart) return null;

    if (sameCart) {
      return setupChanged
        ? `The IMEI / SIM of ${deviceId} will be updated. It stays on ${selectedCart}.`
        : `${deviceId} is already on ${selectedCart}.`;
    }

    if (selectedCartState === "occupied") {
      return `${deviceId} will replace ${selectedCartData?.assigned_device_id} on ${selectedCart}. From now on its data belongs to ${selectedCart}.`;
    }

    if (currentCartId) {
      return `${deviceId} will move from ${currentCartId} to ${selectedCart}. From now on its data belongs to ${selectedCart}.`;
    }

    return `${deviceId} will be assigned to ${selectedCart}. From now on its data belongs to ${selectedCart}.`;
  })();

  // =====================================================
  // PAGE
  // =====================================================

  return (
    <PageShell user={signedInUser}>
      <div className="px-1">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#202824]">
          Assign GPS to a cart
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#66736c]">
          Choose the cart this GPS is installed on. If it was on another
          cart, its new data will belong to the new cart from now on.
        </p>
      </div>

      {/* =================================================
          GPS · COURSE · CURRENT CART
      ================================================= */}

      <section className="relative mt-6 overflow-hidden rounded-3xl border border-[#dce5dd] bg-white p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[#d4e6da]/70 blur-2xl" />

        {loadingDevice && !device && (
          <p className="relative flex items-center gap-2 text-sm text-[#66736c]">
            <LoaderCircle size={16} className="animate-spin" />
            Loading GPS…
          </p>
        )}

        {deviceError && (
          <Notice tone="red" title="GPS not available" text={deviceError} />
        )}

        {device && !deviceError && (
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#668071]">
                  <Radio size={14} />
                  GPS device
                </p>
                <p className="mt-1 break-all text-2xl font-bold text-[#202824]">
                  {device.device_id ?? deviceId}
                </p>
                {device.status && (
                  <span className="mt-2 inline-flex rounded-full bg-[#dcefe1] px-2.5 py-1 text-[11px] font-bold capitalize text-[#2f6a4d]">
                    {device.status}
                  </span>
                )}
              </div>

              <Image
                src={trackerImage}
                alt=""
                sizes="88px"
                className="-mr-1 -mt-1 h-auto w-[88px] shrink-0 drop-shadow-[0_10px_8px_rgba(35,77,60,0.18)]"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <InfoTile
                icon={<Flag size={15} />}
                label="Golf course"
                value={courseId ? courseLabel || "Loading…" : "Not set"}
              />
              <InfoTile
                icon={<ShoppingCart size={15} />}
                label="Current cart"
                value={currentCartId ?? "No cart"}
                muted={!currentCartId}
              />
            </div>
          </div>
        )}
      </section>

      {noCourse && (
        <div className="mt-5">
          <Notice
            tone="amber"
            title="This GPS isn’t linked to a golf course yet"
            text="Set its golf course in Admin Web, then scan the QR code again."
          />
        </div>
      )}

      {showMainFlow && (
        <>
          {/* =============================================
              1 · CHOOSE CART
          ============================================= */}

          <section className="mt-7">
            <StepHeading
              number={1}
              title="Choose the cart"
              text="Type the cart number or pick it from the list."
              aside={
                !loadingCarts && carts.length > 0
                  ? `${freeCount} free of ${carts.length}`
                  : undefined
              }
            />

            <div className="relative mt-3">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8a968f]"
              />
              <input
                type="text"
                role="combobox"
                aria-expanded
                aria-controls="cart-listbox"
                value={cartQuery}
                onChange={(event) => {
                  setCartQuery(event.target.value);
                  setSelectedCart("");
                  setConfirmReplace(false);
                  setHighlightIndex(0);
                  clearMessages();
                }}
                onKeyDown={handleCartKeyDown}
                disabled={loadingCarts || saving}
                placeholder={
                  loadingCarts ? "Loading carts…" : "Search cart, e.g. 12"
                }
                autoComplete="off"
                inputMode="search"
                className="w-full rounded-2xl border border-[#ccd8d0] bg-white py-3.5 pl-11 pr-11 text-[15px] text-[#202824] outline-none transition focus:border-[#7c9b8c] focus:ring-4 focus:ring-[#32634f]/10 disabled:bg-[#f3f5f2]"
              />
              {cartQuery && !saving && (
                <button
                  type="button"
                  aria-label="Clear"
                  onClick={() => {
                    setCartQuery("");
                    setSelectedCart("");
                    setConfirmReplace(false);
                  }}
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#8a968f] transition hover:bg-[#f1f4f1]"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <ul
              id="cart-listbox"
              role="listbox"
              className="mt-2 max-h-[320px] overflow-y-auto rounded-2xl border border-[#dce5dd] bg-white"
            >
              {loadingCarts && (
                <li className="flex items-center gap-2 px-4 py-4 text-sm text-[#66736c]">
                  <LoaderCircle size={16} className="animate-spin" />
                  Loading carts…
                </li>
              )}

              {!loadingCarts && filteredCarts.length === 0 && carts.length > 0 && (
                <li className="px-4 py-4 text-sm text-[#66736c]">
                  No carts match “{cartQuery}”.
                </li>
              )}

              {!loadingCarts &&
                filteredCarts.map((cart, index) => {
                  const selected = cart.cart_id === selectedCart;

                  return (
                    <li
                      key={cart.cart_id}
                      role="option"
                      aria-selected={selected}
                      onClick={() => !saving && selectCart(cart)}
                      onMouseEnter={() => setHighlightIndex(index)}
                      className={`flex cursor-pointer items-center gap-3 border-b border-[#eef2ee] px-4 py-3 last:border-b-0 ${
                        selected
                          ? "bg-[#edf5f0]"
                          : index === highlightIndex && cartQuery
                            ? "bg-[#f6f9f6]"
                            : ""
                      }`}
                    >
                      <ShoppingCart
                        size={17}
                        className={selected ? "text-[#32634f]" : "text-[#8a968f]"}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-[#26312c]">
                        {cart.cart_id}
                      </span>
                      <CartBadge
                        state={cartState(cart)}
                        deviceId={cart.assigned_device_id}
                      />
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          selected
                            ? "bg-[#32634f] text-white"
                            : "border border-[#d4ddd6]"
                        }`}
                      >
                        {selected && <Check size={14} strokeWidth={3} />}
                      </span>
                    </li>
                  );
                })}
            </ul>

            {cartsError && (
              <p className="mt-2 text-sm text-red-600">{cartsError}</p>
            )}

            {!loadingCarts && !cartsError && carts.length === 0 && (
              <div className="mt-3">
                <Notice
                  tone="amber"
                  title="No carts yet"
                  text="This golf course has no carts yet. Add them in Admin Web."
                />
              </div>
            )}

            {/* Replace warning */}
            {selectedCartState === "occupied" && selectedCartData && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="flex items-center gap-2 font-semibold text-amber-900">
                  <TriangleAlert size={17} />
                  {selectedCart} already has a GPS
                </p>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  <strong>{selectedCartData.assigned_device_id}</strong> will
                  be left without a cart (it stays in {courseLabel}). Its
                  past data stays with {selectedCart}.
                </p>
                <label className="mt-3 flex items-center gap-2.5 text-sm font-semibold text-amber-900">
                  <input
                    type="checkbox"
                    checked={confirmReplace}
                    onChange={(event) =>
                      setConfirmReplace(event.target.checked)
                    }
                    disabled={saving}
                    className="h-5 w-5 accent-[#32634f]"
                  />
                  Yes, replace it with this GPS
                </label>
              </div>
            )}

            {/* Move info */}
            {selectedCart &&
              selectedCartState === "free" &&
              currentCartId && (
                <p className="mt-3 flex gap-2 rounded-2xl bg-[#edf5f0] p-4 text-sm leading-6 text-[#2c4a3d]">
                  <Info size={17} className="mt-0.5 shrink-0" />
                  <span>
                    This GPS will leave <strong>{currentCartId}</strong>,
                    which becomes free. Data recorded so far stays with{" "}
                    {currentCartId}.
                  </span>
                </p>
              )}
          </section>

          {/* =============================================
              2 · IMEI & SIM
          ============================================= */}

          <section className="mt-7">
            <StepHeading
              number={2}
              title="IMEI & SIM"
              text={
                setupRequired
                  ? "This GPS has no IMEI yet. Add it before assigning a cart."
                  : "Only when installing a new GPS or changing its SIM."
              }
              aside={
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    setupRequired
                      ? "bg-amber-100 text-amber-800"
                      : "bg-[#eef1ee] text-[#66736c]"
                  }`}
                >
                  {setupRequired ? "Required" : "Optional"}
                </span>
              }
            />

            <div className="mt-3 rounded-2xl border border-[#dce5dd] bg-white">
              <button
                type="button"
                onClick={toggleSetup}
                aria-expanded={setupOpen}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
                  <SetupValue
                    icon={<Smartphone size={14} />}
                    label="IMEI"
                    value={device?.imei ?? null}
                  />
                  <SetupValue
                    icon={<CreditCard size={14} />}
                    label="SIM"
                    value={device?.iccid ?? null}
                  />
                </div>
                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-[#32634f]">
                  {setupOpen ? "Close" : "Edit"}
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${setupOpen ? "rotate-180" : ""}`}
                  />
                </span>
              </button>

              {setupOpen && (
                <div className="border-t border-[#eef2ee] px-4 pb-4 pt-4">
                  {/* IMEI */}
                  <label className="block">
                    <span className="text-sm font-semibold text-[#202824]">
                      IMEI{setupRequired ? " *" : ""}
                    </span>
                    <span className="mt-0.5 block text-xs text-[#7a857f]">
                      The 15 digits printed on the MT700.
                    </span>
                    <input
                      type="text"
                      value={imei}
                      onChange={(event) => {
                        setImei(digitsOnly(event.target.value).slice(0, 15));
                        clearMessages();
                      }}
                      disabled={saving}
                      placeholder="15-digit IMEI"
                      autoComplete="off"
                      inputMode="numeric"
                      className={`mt-2 ${fieldClass(imeiInvalid)}`}
                    />
                  </label>
                  <p
                    className={`mt-1.5 text-right text-xs ${
                      imeiInvalid ? "text-red-600" : "text-[#8a968f]"
                    }`}
                  >
                    {imei.length}/15
                  </p>

                  {/* SIM */}
                  <p className="mt-3 text-sm font-semibold text-[#202824]">
                    SIM / ICCID
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-[#f1f4f1] p-1">
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
                        className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                          simMode === mode
                            ? "bg-white text-[#32634f] shadow-sm"
                            : "text-[#66736c]"
                        }`}
                      >
                        {mode === "known" ? "From inventory" : "New SIM"}
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
                        className={fieldClass(false)}
                      >
                        <option value="">
                          {loadingSims
                            ? "Loading SIMs…"
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
                        <p className="mt-2 text-sm text-red-600">{simsError}</p>
                      )}
                      {!loadingSims &&
                        !simsError &&
                        simsLoaded &&
                        selectableSims.length === 0 && (
                          <p className="mt-2 text-sm text-amber-700">
                            No SIMs available. Use “New SIM” to type an
                            ICCID.
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
                        className={fieldClass(iccidInvalid)}
                      />
                      <div className="mt-1.5 flex justify-between text-xs">
                        <span
                          className={
                            iccidInvalid ? "text-red-600" : "text-[#8a968f]"
                          }
                        >
                          18–22 digits
                        </span>
                        <span className="text-[#8a968f]">
                          {newIccid.length}/22
                        </span>
                      </div>
                    </div>
                  )}

                  <p className="mt-4 flex gap-2 text-xs leading-5 text-[#7a857f]">
                    <Info size={14} className="mt-0.5 shrink-0" />
                    Saved with the main button. To change only IMEI / SIM,
                    choose the cart this GPS is already on.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* =============================================
              WHO (only if the login has no name / email)
          ============================================= */}

          {!signedInUser && (
            <section className="mt-7">
              <StepHeading
                number={3}
                title="Assigned by"
                text="Your name. It’s saved in the assignment history."
              />
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
                className={`mt-3 ${fieldClass(false)}`}
              />
            </section>
          )}

          {/* =============================================
              RESULT
          ============================================= */}

          {actionError && (
            <div className="mt-7">
              <Notice
                tone="red"
                title="Couldn’t save the change"
                text={actionError}
              />
            </div>
          )}

          {successMessage && (
            <div className="mt-7 flex gap-3 rounded-2xl border border-[#cfe3d6] bg-[#eef6f0] p-4">
              <CircleCheck size={22} className="shrink-0 text-[#2f6a4d]" />
              <div>
                <p className="font-bold text-[#28513f]">Done</p>
                <p className="mt-1 text-sm leading-6 text-[#2c4a3d]">
                  {successMessage}
                </p>
              </div>
            </div>
          )}

          {/* =============================================
              REMOVE FROM CART
          ============================================= */}

          {currentCartId && (
            <section className="mt-8 rounded-2xl border border-[#e7ddd9] bg-white p-4">
              {!confirmingUnassign ? (
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                    <Unlink size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#202824]">
                      Taking the GPS off {currentCartId}?
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-[#7a857f]">
                      For charging or repair. The cart keeps its history.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      clearMessages();
                      setConfirmingUnassign(true);
                    }}
                    disabled={saving}
                    className="shrink-0 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-[#202824]">
                    Remove {deviceId} from {currentCartId}?
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[#66736c]">
                    The GPS stays in {courseLabel} without a cart until it’s
                    assigned again. {currentCartId} keeps the data recorded
                    so far.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingUnassign(false)}
                      disabled={saving}
                      className="rounded-xl border border-[#cad6ce] bg-white px-4 py-2.5 text-sm font-semibold text-[#45524a]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleUnassign}
                      disabled={saving}
                      className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      {saving ? "Removing…" : "Yes, remove"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* =============================================
              SUMMARY + MAIN BUTTON (fixed at the bottom)
          ============================================= */}

          <div className="sticky bottom-0 -mx-4 mt-8 bg-gradient-to-t from-[#e9f0e9] via-[#eef3ee]/90 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-6">
            {summary && (
              <p className="mb-2.5 text-xs leading-5 text-[#4f5f56]">
                {summary}
                {assignedBy.trim() && !sameCart && (
                  <span className="text-[#7a857f]">
                    {" "}
                    Saved as {assignedBy.trim()}.
                  </span>
                )}
              </p>
            )}

            <button
              type="button"
              onClick={handleAssign}
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#32634f] px-5 py-4 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#28513f] disabled:cursor-not-allowed disabled:bg-[#b9c6bd]"
            >
              {saving ? (
                <>
                  <LoaderCircle size={18} className="animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  {actionLabel}
                  {canSubmit && <ArrowRight size={18} />}
                </>
              )}
            </button>

            {selectedCart && !assignedBy.trim() && (
              <p className="mt-2 text-center text-xs text-[#7a857f]">
                Enter your name in “Assigned by” to continue.
              </p>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}

// =====================================================
// LAYOUT
// =====================================================

function PageShell({
  user,
  children,
}: {
  user: SignedInUser | null;
  children: React.ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = user?.name || user?.email || "";
  const initials = displayName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <main className="relative isolate min-h-screen bg-gradient-to-b from-[#f7f9f6] via-[#f1f5f0] to-[#e6eee6]">
      <GolfBackdrop />

      <header className="sticky top-0 z-30 border-b border-[#e3eae4]/80 bg-[#f7f9f6]/80 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#427460] to-[#234d3c] text-xs font-bold text-white shadow-sm">
            CR
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-tight text-[#202824]">
              CourseRev
            </p>
            <p className="text-xs text-[#7a857f]">GPS cart assignment</p>
          </div>

          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="How it works"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#527363] transition hover:bg-[#e8efe9]"
          >
            <CircleHelp size={21} />
          </button>

          {user && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="Account"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dceadf] text-sm font-bold text-[#285d47]"
              >
                {initials || <UserRound size={18} />}
              </button>

              {menuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-[#dce5dd] bg-white p-3 shadow-xl">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#87948c]">
                      Signed in as
                    </p>
                    {user.name && (
                      <p className="mt-1 truncate text-sm font-semibold text-[#202824]">
                        {user.name}
                      </p>
                    )}
                    {user.email && (
                      <p className="truncate text-xs text-[#66736c]">
                        {user.email}
                      </p>
                    )}
                    <a
                      href="/auth/logout"
                      className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-[#cad6ce] px-3 py-2 text-sm font-semibold text-[#45524a] transition hover:bg-[#f2f5f2]"
                    >
                      <LogOut size={15} />
                      Log out
                    </a>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-xl px-4 pb-16 pt-6">
        {children}
      </div>

      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} />}
    </main>
  );
}

// Soft golf landscape behind the page (hills, trees and a flag), fixed at
// the bottom of the screen. Drawn in SVG: no image to download. The trees
// and the flag are placed on their own so they stay visible on phones.
function GolfBackdrop() {
  const hill = (d: string, fill: string, opacity: number) => (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1200 300"
      preserveAspectRatio="none"
    >
      <path d={d} fill={fill} opacity={opacity} />
    </svg>
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#dbe9de]/60 blur-3xl" />
      <div className="absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-[#e2ede4]/70 blur-3xl" />

      <div className="absolute inset-x-0 bottom-0 h-[34vh] min-h-[220px]">
        {/* far hills */}
        {hill(
          "M0 110 C 160 50 300 60 430 95 C 560 130 690 35 860 50 C 1000 62 1100 100 1200 85 L1200 300 L0 300 Z",
          "#dfe9df",
          0.75
        )}

        {/* trees (left) */}
        <svg
          className="absolute bottom-[52%] left-[2%] w-[30%] max-w-[230px]"
          viewBox="0 0 230 110"
        >
          <g fill="#c6dacb">
            <rect x="93" y="46" width="8" height="64" rx="4" />
            <circle cx="97" cy="34" r="30" />
            <circle cx="76" cy="52" r="21" />
            <circle cx="118" cy="50" r="22" />
            <rect x="171" y="66" width="6" height="44" rx="3" />
            <circle cx="174" cy="56" r="21" />
            <circle cx="160" cy="66" r="14" />
            <rect x="26" y="74" width="5" height="36" rx="2.5" />
            <circle cx="28" cy="66" r="15" />
          </g>
        </svg>

        {/* middle hills */}
        {hill(
          "M0 165 C 140 120 280 127 420 153 C 560 179 700 115 880 127 C 1030 137 1120 165 1200 157 L1200 300 L0 300 Z",
          "#d3e3d6",
          0.85
        )}

        {/* flag (right) */}
        <svg
          className="absolute bottom-[38%] right-[7%] w-[13%] max-w-[90px]"
          viewBox="0 0 70 130"
        >
          <rect x="22" y="6" width="4" height="116" rx="2" fill="#b3cbb8" />
          <path d="M26 8 L66 22 L26 36 Z" fill="#a6c2ad" />
          <ellipse cx="24" cy="124" rx="20" ry="5" fill="#bfd5c4" />
        </svg>

        {/* near hills */}
        {hill(
          "M0 222 C 180 188 330 196 500 214 C 680 232 820 188 1000 196 C 1100 200 1160 216 1200 212 L1200 300 L0 300 Z",
          "#c8dccc",
          0.9
        )}
      </div>
    </div>
  );
}

function HelpSheet({ onClose }: { onClose: () => void }) {
  const items = [
    {
      icon: <QrCode size={17} />,
      title: "Scan the QR on the GPS",
      text: "This page opens with that GPS, its golf course and its current cart.",
    },
    {
      icon: <ShoppingCart size={17} />,
      title: "Choose the cart and confirm",
      text: "From that moment its data belongs to the new cart. Data recorded before stays with the previous cart.",
    },
    {
      icon: <RefreshCw size={17} />,
      title: "Cart already has a GPS?",
      text: "You can replace it. The old GPS stays in the golf course without a cart.",
    },
    {
      icon: <Smartphone size={17} />,
      title: "IMEI & SIM",
      text: "Only needed when installing a GPS for the first time or changing its SIM.",
    },
    {
      icon: <Unlink size={17} />,
      title: "Remove",
      text: "When you take the GPS off the cart (charging, repair). The cart keeps its history.",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#14241d]/45 sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-bold text-[#202824]">How it works</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#66736c] transition hover:bg-[#f1f4f1]"
          >
            <X size={18} />
          </button>
        </div>

        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e4efe7] text-[#32634f]">
                {item.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-[#202824]">
                  {item.title}
                </p>
                <p className="mt-0.5 text-sm leading-5 text-[#66736c]">
                  {item.text}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl bg-[#32634f] px-5 py-3.5 text-sm font-semibold text-white"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// =====================================================
// SMALL PIECES
// =====================================================

function fieldClass(invalid: boolean) {
  return `w-full rounded-2xl border bg-white px-4 py-3.5 text-[15px] text-[#202824] outline-none transition focus:ring-4 disabled:cursor-not-allowed disabled:bg-[#f3f5f2] disabled:text-[#9aa49e] ${
    invalid
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-[#ccd8d0] focus:border-[#7c9b8c] focus:ring-[#32634f]/10"
  }`;
}

function StepHeading({
  number,
  title,
  text,
  aside,
}: {
  number: number;
  title: string;
  text: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dceadf] text-sm font-bold text-[#285d47]">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold leading-tight text-[#202824]">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-[#7a857f]">{text}</p>
      </div>
      {aside && (
        <span className="mt-0.5 shrink-0 text-xs font-semibold text-[#7a857f]">
          {aside}
        </span>
      )}
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-[#f5f7f3] px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#87948c]">
        <span className="text-[#477963]">{icon}</span>
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm font-semibold ${
          muted ? "text-amber-700" : "text-[#26372f]"
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function SetupValue({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#87948c]">
        <span className="text-[#477963]">{icon}</span>
        {label}
      </p>
      <p
        className={`mt-0.5 truncate font-mono text-xs ${
          value ? "text-[#46584f]" : "font-sans font-semibold text-amber-700"
        }`}
        title={value ?? undefined}
      >
        {value ?? "Not recorded"}
      </p>
    </div>
  );
}

function Notice({
  tone,
  title,
  text,
}: {
  tone: "red" | "amber";
  title: string;
  text: string;
}) {
  const styles =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div className={`flex gap-3 rounded-2xl border p-4 ${styles}`}>
      <TriangleAlert size={18} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-6 opacity-90">{text}</p>
      </div>
    </div>
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
      <span className="shrink-0 rounded-full bg-[#dcefe1] px-2.5 py-1 text-[11px] font-bold text-[#2f6a4d]">
        This GPS
      </span>
    );
  }

  if (state === "occupied") {
    return (
      <span className="max-w-[45%] shrink-0 truncate rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
        Has {deviceId}
      </span>
    );
  }

  return (
    <span className="shrink-0 rounded-full bg-[#eef1ee] px-2.5 py-1 text-[11px] font-bold text-[#66736c]">
      Free
    </span>
  );
}
