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

// ICCID typed by hand: spaces (e.g. when pasted from a label) are
// removed; any other character is kept so validation can reject it.
function normalizeIccid(value: string) {
  return value.replace(/\s+/g, "");
}

const ICCID_FORMAT = /^\d{18,22}$/;

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
  const [iccid, setIccid] = useState("");

  // ---------------- Loading ----------------
  const [loadingDevice, setLoadingDevice] = useState(true);
  const [loadingCarts, setLoadingCarts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingUnassign, setConfirmingUnassign] =
    useState(false);

  // ---------------- Messages ----------------
  const [deviceError, setDeviceError] = useState("");
  const [cartsError, setCartsError] = useState("");
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

  function openSetup() {
    setSetupOpen(true);
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
      setIccid(data.iccid ?? "");

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

  const cleanImei = digitsOnly(imei);
  const cleanIccid = normalizeIccid(iccid);

  // Only sent when changed in Device setup.
  const imeiChanged =
    cleanImei !== "" && cleanImei !== (device?.imei ?? "");
  const iccidChanged =
    cleanIccid !== "" &&
    cleanIccid !== normalizeIccid(device?.iccid ?? "");
  const setupChanged = imeiChanged || iccidChanged;

  const imeiInvalid =
    cleanImei !== "" && !/^\d{15}$/.test(cleanImei);
  const iccidInvalid =
    cleanIccid !== "" && !ICCID_FORMAT.test(cleanIccid);

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
      setActionError(
        "ICCID must contain only digits (18 to 22)."
      );
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
                icon={<GolfCartIcon size={15} />}
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
                      <GolfCartIcon
                        size={19}
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

                  {/* SIM ICCID (typed by hand) */}
                  <label className="mt-3 block">
                    <span className="text-sm font-semibold text-[#202824]">
                      SIM ICCID
                    </span>
                    <span className="mt-0.5 block text-xs text-[#7a857f]">
                      The 18–22 digits printed on the SIM card installed in
                      the MT700. Spaces are removed automatically.
                    </span>
                    <input
                      type="text"
                      value={iccid}
                      onChange={(event) => {
                        setIccid(event.target.value.slice(0, 40));
                        clearMessages();
                      }}
                      disabled={saving}
                      placeholder="18–22 digit ICCID"
                      autoComplete="off"
                      inputMode="numeric"
                      className={`mt-2 ${fieldClass(iccidInvalid)}`}
                    />
                  </label>
                  <div className="mt-1.5 flex justify-between text-xs">
                    <span
                      className={
                        iccidInvalid ? "text-red-600" : "text-[#8a968f]"
                      }
                    >
                      {iccidInvalid
                        ? "Only digits, 18 to 22."
                        : "18–22 digits"}
                    </span>
                    <span className="text-[#8a968f]">
                      {cleanIccid.length}/22
                    </span>
                  </div>

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

          <div className="sticky bottom-0 z-20 mt-8 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
            <div className="rounded-3xl border border-[#dce5dd] bg-white/90 p-3 shadow-[0_10px_30px_rgba(35,77,60,0.14)] backdrop-blur">
            {summary && (
              <p className="mb-2.5 px-1 text-xs leading-5 text-[#4f5f56]">
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

// Soft golf landscape behind the page: layered hills with haze, groups of
// trees on their own knolls (left) and a flag with a bunker (right), fixed
// at the bottom of the screen. Drawn in SVG (no image to download). The
// tree groups are anchored to the sides so they stay visible on phones.
// The tree shapes were generated once and are kept as static markup.
const BACKDROP_LEFT = `<defs><linearGradient id="cw-cfL" x1="0" y1="0" x2="1" y2="0"><stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="cw-cmL"><rect width="460" height="230" fill="url(#cw-cfL)"/></mask></defs><path d="M0 150C70 140 150 150 230 168C300 184 380 196 460 204L460 230L0 230Z" fill="url(#cw-gKnoll)" mask="url(#cw-cmL)"/><path d="M87 170L89.5 115.4L94.5 115.4L97 170Z" fill="#adc4b3"/><path d="M92 47.6C96.1 47.5 100.9 48.7 104.5 50.7C108.2 52.7 110.3 57.4 114 59.7C117.6 61.9 122.3 62 126.4 64.3C130.5 66.5 136.7 69.2 138.6 73.3C140.4 77.3 138.7 84.3 137.6 88.7C136.5 93.2 133.4 96.6 132.1 100C130.9 103.3 131.3 105.9 130.2 108.8C129.1 111.7 127.8 114.9 125.6 117.6C123.4 120.4 120.6 123.2 117.2 125.3C113.8 127.3 109.6 129.4 105.4 130.1C101.2 130.8 96.3 130 92 129.6C87.7 129.2 83.6 128.5 79.6 127.6C75.5 126.7 71 126 67.7 124.2C64.4 122.4 62.3 119.2 59.8 116.7C57.3 114.2 55.1 111.9 52.6 109.2C50.1 106.6 45.7 104.2 44.7 100.7C43.6 97.3 44.9 92.7 46.3 88.7C47.7 84.7 51.1 80.9 53 76.9C54.9 72.9 55.4 68 57.7 64.4C60.1 60.8 63.6 57.3 67.2 55.1C70.9 52.9 75.5 52.6 79.6 51.4C83.8 50.1 87.9 47.7 92 47.6Z" fill="#bcd0c1"/><path d="M70.5 76.5C73 76 76.2 75.4 78.6 76.2C81 77 83.1 79.5 85 81.3C86.9 83.1 88.3 85.2 90 87.1C91.8 89 94.4 90.4 95.6 92.6C96.8 94.9 97.1 98 97.2 100.4C97.3 102.8 96.4 104.9 96.1 107C95.8 109 96.3 110.9 95.4 112.6C94.5 114.3 92.6 115.9 90.7 117.1C88.9 118.3 86.2 118.7 84.2 119.9C82.1 121 80.7 123 78.4 124C76.1 125 73 125.9 70.5 125.6C67.9 125.3 65.5 123.4 63.2 122.5C60.8 121.5 58.8 121 56.6 120.1C54.4 119.2 51.5 118.6 50 117.3C48.4 115.9 48.1 113.7 47.2 112C46.3 110.3 45.5 109 44.5 107C43.6 105 41.4 102.5 41.4 100C41.3 97.6 42.8 94.4 44.4 92.2C45.9 90 48.8 88.6 50.8 87C52.9 85.5 54.8 84.1 56.9 82.8C58.9 81.5 61 80.5 63.3 79.5C65.6 78.4 67.9 77.1 70.5 76.5Z" fill="#bcd0c1"/><path d="M114.4 73.2C117 72.9 119.7 72.9 122.5 73.1C125.4 73.3 129 73 131.4 74.4C133.9 75.8 136 78.7 137.2 81.3C138.4 84 137.7 87.7 138.5 90.4C139.2 93.1 141 95.3 141.9 97.7C142.8 100.1 144.2 102.8 143.8 105C143.4 107.1 140.8 108.6 139.5 110.3C138.1 112.1 137.2 113.8 135.8 115.7C134.5 117.5 133.5 120.2 131.3 121.4C129.1 122.5 125.4 122.4 122.6 122.5C119.8 122.6 117.1 121.8 114.4 121.8C111.7 121.9 108.9 122.8 106.3 122.6C103.6 122.3 100.8 121.3 98.6 120.2C96.4 119 94.8 117.2 93.1 115.6C91.4 114 89.3 112.6 88.2 110.8C87.1 109 86.7 107 86.5 104.8C86.3 102.6 86.7 100.4 86.8 97.7C86.8 95 86 91.5 86.8 88.7C87.6 86 89.4 83 91.5 81.2C93.6 79.4 97 78.8 99.5 77.8C102.1 76.7 104.3 75.7 106.8 74.9C109.3 74.1 111.8 73.5 114.4 73.2Z" fill="#bcd0c1"/><path d="M106.4 91.8C109.4 91.1 113.4 90.1 116.4 90.7C119.3 91.2 121.8 93.5 124 95C126.3 96.5 128.1 98 130.1 99.5C132.1 101 135.1 102.3 136.3 104C137.5 105.8 137.2 108.3 137.2 110.1C137.3 111.8 136.6 113.3 136.6 114.7C136.6 116.1 137.9 117.3 137.1 118.5C136.3 119.6 134.1 120.8 131.7 121.6C129.4 122.4 125.8 122.6 123.1 123.2C120.4 123.8 118.3 124.6 115.5 125.1C112.7 125.6 109.4 126.1 106.4 126C103.4 126 100.3 125.3 97.5 124.8C94.6 124.4 91.9 124 89.2 123.4C86.5 122.8 83.4 122.3 81.4 121.4C79.4 120.6 78.1 119.3 77.1 118.2C76.2 117.1 75.9 116.1 75.5 114.7C75.1 113.3 74.6 111.8 74.6 110C74.6 108.1 74.4 105.7 75.4 103.7C76.4 101.8 77.9 99.5 80.3 98.2C82.7 96.9 86.6 96.5 89.6 96C92.7 95.5 95.6 95.9 98.4 95.2C101.1 94.5 103.3 92.6 106.4 91.8Z" fill="#adc4b3" opacity="0.75"/><path d="M80.3 61.6C82.4 61.4 84.9 62.4 86.7 63.2C88.6 64 89.9 65.5 91.5 66.4C93.1 67.4 95.1 68 96.3 69.2C97.4 70.3 97.9 71.9 98.5 73.3C99.2 74.6 99.3 76 100.1 77.4C101 78.7 103.2 80 103.5 81.3C103.9 82.5 103.5 83.9 102.3 84.9C101.1 85.8 98.2 86.3 96.3 86.9C94.4 87.5 92.7 87.9 91.1 88.5C89.4 89 88 89.8 86.2 90.3C84.4 90.8 82.4 91.3 80.3 91.4C78.3 91.5 75.9 91.5 74.1 91C72.2 90.6 70.9 89.4 69.3 88.7C67.8 88 66.7 87.3 64.9 86.7C63.1 86 60 85.7 58.7 84.8C57.5 83.9 57 82.5 57.3 81.3C57.7 80 60.2 78.8 60.9 77.4C61.6 76 61.2 74.6 61.6 73.1C62.1 71.6 62.2 69.6 63.5 68.6C64.8 67.5 67.5 67.4 69.4 66.7C71.2 66 72.6 65.3 74.4 64.4C76.3 63.6 78.3 61.8 80.3 61.6Z" fill="#cbdacf" opacity="0.8"/><path d="M174.6 182L177.4 182L176.8 163.3L175.2 163.3Z" fill="#adc4b3"/><path d="M176 76.4C177.5 75.8 179.2 75.3 180.6 76.6C182 78 183.3 81.5 184.4 84.4C185.6 87.3 186.5 90.6 187.5 93.9C188.5 97.2 189.8 100.1 190.4 104C191.1 107.8 191.4 112.8 191.5 117.1C191.6 121.4 191.2 125.6 191 129.7C190.9 133.9 190.9 138.2 190.4 141.9C189.8 145.6 188.8 149.1 187.8 151.9C186.7 154.7 185.3 156.2 184.1 158.6C182.9 161 181.9 164.6 180.5 166.3C179.2 168.1 177.5 169.6 176 169.3C174.5 168.9 173.1 165.8 171.7 164.1C170.3 162.4 169.1 160.9 167.8 158.9C166.5 156.9 165.1 155.1 164.1 152.1C163.2 149.1 162.8 144.8 162.3 141C161.7 137.3 161.3 133.8 160.8 129.8C160.4 125.7 159.5 121.1 159.6 116.7C159.7 112.3 160.4 107.3 161.2 103.4C162 99.6 163.4 96.7 164.5 93.8C165.6 90.9 166.7 88.3 167.9 86.1C169.1 83.8 170.4 82 171.8 80.4C173.1 78.8 174.5 77 176 76.4Z" fill="#bcd0c1"/><path d="M180.7 93.5C181.4 93.3 182.2 93.5 183 94C183.8 94.5 184.8 94.7 185.5 96.5C186.2 98.3 186.8 101.5 187.2 104.7C187.6 107.8 187.6 111.9 187.8 115.3C188.1 118.6 188.5 121.7 188.7 124.8C188.9 127.9 189.2 131.2 189.1 133.9C189 136.6 188.4 138.6 188 140.9C187.7 143.2 187.3 145.3 186.9 147.5C186.5 149.7 186.1 152.6 185.4 154C184.8 155.4 183.8 155.7 183 156C182.2 156.3 181.5 155.8 180.7 155.8C179.9 155.8 179.1 156.5 178.3 156C177.6 155.6 176.8 154.4 176.1 153C175.5 151.6 175 149.4 174.5 147.5C174 145.5 173.4 143.5 173.1 141.2C172.8 139 172.6 136.5 172.5 133.8C172.5 131 172.5 128.1 172.6 124.8C172.6 121.4 172.6 117.2 172.8 113.8C173.1 110.5 173.6 107 174.2 104.5C174.7 102.1 175.6 100.8 176.3 99.3C177 97.8 177.7 96.4 178.4 95.5C179.2 94.5 179.9 93.8 180.7 93.5Z" fill="#adc4b3" opacity="0.75"/><path d="M134.7 186L136.4 149.9L139.6 149.9L141.3 186Z" fill="#98b29f"/><path d="M138 106.8C140.6 106.5 143.3 106.6 146.1 106.8C148.9 107 152.5 106.7 154.9 108.1C157.3 109.5 159.5 112.6 160.7 115.4C161.8 118.2 161.1 122 161.9 124.9C162.7 127.7 164.4 130 165.3 132.5C166.2 135 167.6 137.9 167.2 140.1C166.8 142.3 164.2 143.9 162.9 145.7C161.6 147.6 160.7 149.4 159.3 151.3C157.9 153.2 157 156.1 154.8 157.3C152.6 158.5 148.9 158.4 146.1 158.5C143.3 158.6 140.7 157.8 138 157.8C135.3 157.8 132.5 158.8 129.9 158.5C127.3 158.2 124.4 157.3 122.3 156.1C120.1 154.8 118.5 152.9 116.8 151.2C115.1 149.6 113 148.1 111.9 146.2C110.8 144.3 110.4 142.2 110.2 139.9C110 137.7 110.5 135.3 110.5 132.5C110.6 129.7 109.7 126 110.5 123.1C111.3 120.2 113.1 117.1 115.2 115.2C117.3 113.3 120.6 112.7 123.2 111.6C125.7 110.5 128 109.4 130.4 108.6C132.9 107.8 135.4 107.1 138 106.8Z" fill="#a8bfae"/><path d="M124.3 124.5C125.9 123.8 128.1 123 129.6 123.4C131.2 123.9 132.5 125.9 133.7 127.2C134.9 128.4 135.8 129.8 136.9 131C138 132.3 139.6 133.4 140.2 134.9C140.8 136.4 140.6 138.5 140.7 140.1C140.7 141.6 140.4 142.9 140.3 144.3C140.3 145.6 141 147 140.6 148.2C140.2 149.4 139 150.6 137.8 151.4C136.5 152.2 134.6 152.4 133.2 153C131.8 153.6 130.6 154.5 129.1 155C127.6 155.5 125.9 156 124.3 156C122.7 155.9 121.1 155.2 119.6 154.7C118.1 154.3 116.6 153.8 115.2 153.3C113.8 152.7 112.1 152.1 111.1 151.2C110 150.3 109.3 149.1 108.8 147.9C108.3 146.8 108.2 145.6 107.9 144.3C107.7 143 107.4 141.6 107.4 140C107.4 138.4 107.4 136.3 107.9 134.6C108.4 133 109.2 131 110.5 129.9C111.7 128.8 113.8 128.4 115.4 128C117 127.6 118.6 127.9 120.1 127.3C121.5 126.7 122.7 125.1 124.3 124.5Z" fill="#a8bfae"/><path d="M152.3 119C154 118.8 156.1 120 157.7 121C159.3 122 160.4 123.8 161.8 125C163.1 126.2 164.8 126.9 165.8 128.3C166.8 129.7 167.2 131.6 167.7 133.3C168.3 135 168.4 136.7 169.1 138.3C169.8 139.9 171.6 141.6 172 143.1C172.3 144.6 171.9 146.4 170.9 147.5C169.9 148.7 167.4 149.3 165.8 150C164.2 150.7 162.8 151.2 161.4 151.9C159.9 152.6 158.8 153.5 157.3 154.1C155.7 154.7 154 155.3 152.3 155.5C150.6 155.6 148.5 155.5 146.9 155C145.4 154.4 144.2 153.1 142.9 152.2C141.6 151.3 140.7 150.5 139.2 149.7C137.7 148.9 135 148.5 133.9 147.4C132.9 146.3 132.4 144.6 132.8 143.1C133.1 141.6 135.2 140 135.8 138.3C136.4 136.7 136 134.9 136.4 133.1C136.8 131.3 136.9 128.9 138 127.6C139.1 126.3 141.4 126.1 143 125.3C144.5 124.4 145.7 123.5 147.3 122.5C148.8 121.5 150.5 119.3 152.3 119Z" fill="#a8bfae"/><path d="M147.1 134.2C149 134.4 150.8 135.2 152.6 135.7C154.3 136.2 155.9 136.7 157.6 137.2C159.4 137.7 161.5 138.1 163.1 138.9C164.7 139.7 166.6 140.8 167.5 142C168.4 143.2 168.6 145 168.4 146.2C168.2 147.4 166.8 148.5 166.2 149.4C165.5 150.3 165.1 150.8 164.6 151.5C164.1 152.3 164 153.2 163 153.9C161.9 154.5 160.1 155 158.4 155.4C156.7 155.8 154.7 155.9 152.8 156.2C150.9 156.4 149.1 156.9 147.1 157C145.2 157.1 142.8 157 141.1 156.7C139.3 156.4 138 155.5 136.5 155C135.1 154.5 133.7 154 132.3 153.5C130.9 153 129.1 152.5 128.2 151.8C127.3 151.1 127 150.4 126.7 149.5C126.5 148.6 126.6 147.5 126.8 146.3C127 145.1 127.2 143.5 128 142.4C128.9 141.2 130.4 140.2 131.7 139.2C133.1 138.3 134.6 137.5 136.1 136.7C137.7 135.9 139.3 134.8 141.1 134.4C143 134 145.2 134 147.1 134.2Z" fill="#98b29f" opacity="0.75"/><path d="M130.6 115.2C131.9 115.4 133.1 115.9 134.3 116.2C135.6 116.5 137 116.5 138.1 117C139.2 117.5 140.2 118.3 141 119.1C141.7 119.9 142.1 120.9 142.7 121.8C143.2 122.8 143.9 123.7 144.2 124.6C144.4 125.5 144.4 126.5 144.2 127.2C143.9 128 143.3 128.6 142.8 129.3C142.2 129.9 141.7 130.6 141 131.2C140.2 131.8 139.3 132.4 138.2 132.8C137.1 133.2 135.8 133.4 134.5 133.6C133.2 133.8 131.9 133.9 130.6 133.9C129.3 133.9 127.9 133.7 126.7 133.5C125.5 133.2 124.4 132.8 123.4 132.4C122.4 132 121.5 131.4 120.7 130.9C119.9 130.4 119.3 129.8 118.5 129.2C117.7 128.6 116.6 128.1 116.1 127.3C115.5 126.5 114.9 125.3 115.3 124.4C115.6 123.5 117.3 122.5 118.4 121.8C119.5 121.1 121 121 121.9 120.3C122.7 119.6 122.7 118.4 123.4 117.5C124.2 116.6 125.2 115.3 126.3 114.9C127.5 114.5 129.2 115 130.6 115.2Z" fill="#b9cdbf" opacity="0.8"/><path d="M24.2 178L26.1 135.8L29.9 135.8L31.8 178Z" fill="#98b29f"/><path d="M28 83.8C31 82.5 35.1 80.9 38.1 81.8C41 82.7 43.5 86.8 45.7 89.3C48 91.9 49.8 94.5 51.8 97.1C53.9 99.8 56.9 101.9 58 104.9C59.2 108 58.9 112.2 59 115.4C59 118.5 58.4 121.2 58.4 123.9C58.3 126.7 59.6 129.4 58.8 131.8C58 134.2 55.8 136.7 53.5 138.3C51.1 139.9 47.6 140.4 44.8 141.6C42.1 142.9 39.9 144.6 37.1 145.6C34.3 146.6 31 147.7 28 147.6C25 147.5 21.9 146 19.1 145.1C16.2 144.1 13.5 143.3 10.8 142.1C8.1 140.9 5 139.8 3 138C1 136.2 -0.3 133.6 -1.3 131.2C-2.3 128.9 -2.5 126.7 -3 124C-3.4 121.3 -3.9 118.5 -3.9 115.2C-3.9 112 -4 107.8 -3.1 104.4C-2.1 101 -0.5 97.1 1.9 94.9C4.2 92.7 8.2 91.9 11.2 91C14.3 90.2 17.2 90.9 20 89.7C22.8 88.5 25 85.1 28 83.8Z" fill="#a8bfae"/><path d="M12.4 103.7C14.3 103.4 16.5 104.7 18.2 105.8C19.9 106.9 21.1 108.7 22.5 110C24 111.3 25.8 112.1 26.8 113.6C27.9 115.1 28.3 117.2 28.9 119C29.5 120.8 29.6 122.6 30.3 124.3C31.1 126.1 33.1 127.8 33.4 129.5C33.7 131.1 33.4 133 32.3 134.2C31.2 135.4 28.5 136.1 26.8 136.9C25.2 137.7 23.6 138.2 22.1 138.9C20.6 139.6 19.4 140.6 17.8 141.3C16.1 141.9 14.3 142.6 12.4 142.8C10.6 142.9 8.4 142.8 6.8 142.2C5.1 141.6 3.9 140.2 2.5 139.2C1.1 138.3 0.1 137.4 -1.5 136.6C-3.1 135.7 -5.9 135.3 -7.1 134.1C-8.2 132.9 -8.6 131.1 -8.3 129.5C-8 127.8 -5.7 126.2 -5.1 124.4C-4.4 122.6 -4.8 120.7 -4.4 118.7C-4 116.8 -3.9 114.2 -2.7 112.8C-1.6 111.4 0.9 111.3 2.5 110.4C4.2 109.4 5.5 108.5 7.1 107.4C8.8 106.3 10.6 103.9 12.4 103.7Z" fill="#a8bfae"/><path d="M44.2 101.9C46.1 102.3 47.9 103.7 49.7 104.5C51.4 105.3 53 106 54.8 106.9C56.6 107.7 58.6 108.4 60.3 109.7C62 111 63.8 112.8 64.7 114.8C65.6 116.8 65.9 119.7 65.6 121.8C65.4 123.9 64 125.8 63.4 127.4C62.8 129.1 62.4 130.2 61.8 131.6C61.3 133.1 61.2 135 60.2 136.3C59.1 137.6 57.2 138.6 55.5 139.3C53.8 140.1 51.8 140.3 49.9 140.8C48 141.4 46.2 142.4 44.2 142.5C42.2 142.7 39.9 142.6 38.1 141.9C36.3 141.2 35 139.6 33.5 138.5C32 137.5 30.6 136.6 29.2 135.6C27.8 134.5 26 133.5 25.1 132.2C24.2 130.8 23.9 129.3 23.6 127.6C23.4 125.9 23.4 123.9 23.7 121.9C23.9 119.9 24.1 117.4 24.9 115.4C25.8 113.5 27.3 111.8 28.7 110.2C30 108.7 31.5 107.3 33.1 106C34.7 104.7 36.3 102.9 38.1 102.2C40 101.5 42.3 101.5 44.2 101.9Z" fill="#a8bfae"/><path d="M38.4 117.1C40.6 117.4 42.6 118.1 44.8 118.6C46.9 119.1 49.3 119.1 51.2 119.8C53.1 120.6 54.8 121.9 56.1 123.1C57.4 124.3 58.1 125.9 59 127.3C59.9 128.7 61.1 130.2 61.5 131.5C61.9 132.8 61.9 134.2 61.5 135.2C61.1 136.3 60 137 59.1 137.8C58.2 138.7 57.3 139.5 56 140.3C54.7 141 53.1 141.8 51.3 142.3C49.5 142.8 47.2 143.2 45.1 143.4C42.9 143.6 40.6 143.8 38.4 143.7C36.2 143.7 33.9 143.5 31.8 143.2C29.8 142.9 27.9 142.4 26.2 141.8C24.5 141.3 23 140.6 21.6 139.9C20.2 139.3 19.1 138.6 17.8 137.8C16.5 137 14.6 136.4 13.7 135.3C12.7 134.2 11.7 132.6 12.3 131.2C13 129.9 15.7 128.3 17.6 127.2C19.4 126.1 22.1 126 23.5 124.9C25 123.8 25 122 26.2 120.6C27.5 119.3 29.1 117.2 31.2 116.6C33.2 116.1 36.1 116.7 38.4 117.1Z" fill="#98b29f" opacity="0.75"/><path d="M19.6 95C21 94.9 22.7 95.1 24.1 95.5C25.5 95.9 26.9 96.7 28 97.4C29.1 98.2 29.8 99.2 30.8 100.1C31.8 101 32.9 101.7 33.8 102.7C34.6 103.7 35.9 104.9 36 106C36.2 107.1 35.2 108.3 34.7 109.2C34.1 110.1 33 110.5 32.5 111.3C32 112.1 32.3 113.2 31.6 113.9C30.9 114.7 29.8 115.5 28.5 115.9C27.2 116.3 25.3 116.1 23.8 116.3C22.3 116.4 21.1 116.8 19.6 116.9C18.1 117 16.3 117.3 14.9 117.1C13.6 116.8 12.4 115.9 11.4 115.3C10.3 114.7 9.6 114 8.7 113.4C7.7 112.8 6.4 112.3 5.6 111.6C4.8 110.9 4.2 110.2 3.8 109.2C3.5 108.3 3.5 107.2 3.6 106.1C3.7 105 4 103.5 4.7 102.5C5.4 101.4 6.9 100.6 8 99.9C9.2 99.2 10.6 98.8 11.8 98.2C13 97.6 14 96.7 15.3 96.2C16.6 95.7 18.1 95.1 19.6 95Z" fill="#b9cdbf" opacity="0.8"/>`;

const BACKDROP_RIGHT = `<defs><linearGradient id="cw-cfR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000"/><stop offset="0.35" stop-color="#fff"/></linearGradient><mask id="cw-cmR"><rect width="420" height="230" fill="url(#cw-cfR)"/></mask></defs><path d="M0 214C80 196 170 176 260 170C330 166 390 168 420 172L420 230L0 230Z" fill="url(#cw-gKnoll)" mask="url(#cw-cmR)"/><path d="M301.5 170L303.8 120.7L308.2 120.7L310.5 170Z" fill="#adc4b3"/><path d="M306 60.4C309.6 60.8 313 62.3 316.4 63.4C319.9 64.5 323.5 65.2 326.7 67C329.9 68.8 333 71.3 335.6 74.3C338.2 77.2 340.5 80.8 342 84.5C343.6 88.2 345 92.8 344.9 96.6C344.8 100.3 342.6 103.9 341.5 106.9C340.3 109.9 338.8 111.7 338 114.5C337.1 117.3 338.1 121.3 336.4 123.9C334.7 126.5 331.3 129 328 130.2C324.7 131.4 320.1 130.6 316.4 131.2C312.7 131.8 309.6 133.6 306 134C302.4 134.5 297.8 135 294.7 133.7C291.5 132.5 289.6 128.4 287.1 126.3C284.6 124.3 282.6 122.8 279.5 121.2C276.4 119.6 270.8 118.8 268.4 116.5C266.1 114.3 265.2 110.7 265.4 107.5C265.5 104.2 268.2 100.6 269.3 96.9C270.4 93.3 270.8 89.2 272.1 85.6C273.5 82 275.1 78.2 277.3 75.1C279.5 72 282.4 69.4 285.3 67C288.3 64.7 291.5 62.2 295 61.1C298.4 60 302.4 60 306 60.4Z" fill="#bcd0c1"/><path d="M287.6 86.3C289.8 86.4 292 86.4 294.1 86.8C296.3 87.3 299 87.5 300.6 88.9C302.3 90.4 302.9 93.5 303.8 95.6C304.7 97.7 304.8 99.7 306.1 101.6C307.5 103.5 310.7 104.9 311.8 106.9C312.9 108.9 313.4 111.6 312.8 113.4C312.2 115.3 309.5 116.4 308.2 117.9C306.9 119.4 306.4 121 305 122.3C303.7 123.6 302.1 125.1 300.2 125.8C298.3 126.4 295.6 125.8 293.5 126.1C291.4 126.4 289.8 127.1 287.6 127.6C285.5 128.1 282.8 129.2 280.7 128.9C278.6 128.7 276.6 127.1 274.9 125.9C273.2 124.8 271.9 123.5 270.3 122.2C268.8 121 266.6 119.9 265.7 118.4C264.9 116.9 265.1 115 265.3 113.1C265.4 111.3 266.4 109.5 266.7 107.4C267 105.3 266.6 102.8 267.1 100.6C267.7 98.4 268.6 96 269.9 94.2C271.2 92.3 273.1 90.7 274.9 89.4C276.7 88.1 278.9 86.8 281 86.3C283.1 85.8 285.4 86.2 287.6 86.3Z" fill="#bcd0c1"/><path d="M325.1 80.3C327.5 80 330.3 79.7 332.6 80.5C334.9 81.2 337.4 82.8 339 84.7C340.5 86.7 340.9 90.2 341.9 92.4C342.9 94.7 343.8 96.4 345.1 98.4C346.5 100.4 349 102.3 349.9 104.5C350.8 106.6 351 109.3 350.6 111.3C350.3 113.3 348.8 114.9 347.7 116.6C346.6 118.2 345.6 120 344.1 121.4C342.5 122.8 340.7 124.1 338.6 125C336.6 125.9 334.1 126.3 331.9 126.6C329.6 126.9 327.4 126.8 325.1 126.8C322.9 126.7 320.8 126.6 318.5 126.3C316.2 126.1 313.5 126.1 311.4 125.3C309.2 124.6 306.9 123.3 305.7 121.7C304.4 120.2 304.4 117.9 303.7 116.1C303.1 114.3 302.4 113.1 301.6 111.1C300.7 109.1 298.7 106.6 298.8 104.2C298.9 101.9 300.5 98.8 302.1 96.8C303.7 94.9 306.7 94.2 308.5 92.6C310.3 91 311.2 89.1 312.8 87.4C314.4 85.6 316 83.2 318.1 82C320.1 80.9 322.7 80.5 325.1 80.3Z" fill="#bcd0c1"/><path d="M318.2 98.6C320.9 98.3 324 98.5 326.4 99.2C328.9 99.8 331 101.4 333.1 102.5C335.2 103.6 337.4 104.6 339.2 105.9C340.9 107.3 342.8 108.8 343.5 110.5C344.2 112.2 343.3 114.4 343.4 116C343.4 117.6 343.6 118.7 343.9 120C344.2 121.3 345.7 122.5 345.1 123.6C344.6 124.7 342.6 125.8 340.5 126.5C338.5 127.2 335.3 127.5 332.9 127.9C330.4 128.4 328.3 128.9 325.9 129.3C323.4 129.6 320.8 129.9 318.2 129.8C315.7 129.8 313.1 129.5 310.7 129.2C308.2 128.9 305.6 128.6 303.4 128.1C301.2 127.5 299 126.8 297.4 126C295.8 125.1 294.9 124.1 293.7 123.1C292.5 122.2 291 121.4 290.3 120.1C289.6 118.9 288.9 117.2 289.4 115.6C289.8 114 291.5 112 293 110.5C294.5 109 296.4 107.7 298.3 106.5C300.2 105.3 302.1 104.3 304.2 103.4C306.3 102.4 308.4 101.5 310.7 100.7C313 99.9 315.6 98.8 318.2 98.6Z" fill="#adc4b3" opacity="0.75"/><path d="M296.1 72.4C297.8 72.6 299.5 73.8 301.2 74.5C302.8 75.1 304.3 75.5 305.8 76.3C307.2 77 308.6 77.9 309.6 78.9C310.7 79.9 311.5 81.2 312.3 82.4C313 83.6 313.9 84.9 314.3 86.2C314.6 87.4 314.7 88.7 314.4 89.7C314.2 90.8 313.6 91.7 312.9 92.6C312.2 93.6 311.5 94.6 310.4 95.3C309.2 96.1 307.6 96.7 306 97.1C304.4 97.5 302.7 97.6 301 97.9C299.4 98.2 297.8 98.6 296.1 98.7C294.3 98.8 292.4 98.9 290.8 98.5C289.1 98.2 287.7 97.5 286.3 96.9C284.9 96.3 283.6 95.7 282.5 94.9C281.4 94.2 280.3 93.4 279.5 92.6C278.7 91.7 278.1 90.9 277.5 89.8C277 88.7 276.1 87.3 276.3 86C276.5 84.7 277.6 83 278.9 82C280.2 81 282.7 80.8 284 80C285.4 79.1 285.9 78.2 287 77.1C288.1 75.9 288.9 73.8 290.4 73C291.9 72.2 294.3 72.1 296.1 72.4Z" fill="#cbdacf" opacity="0.8"/><path d="M370.6 172L373.4 172L372.8 154.7L371.2 154.7Z" fill="#adc4b3"/><path d="M372 75.4C373.4 75.5 374.7 75.7 376.1 76.6C377.4 77.5 379 78.3 380 80.7C381.1 83.2 381.7 87.8 382.4 91.2C383.1 94.7 383.4 98.2 384.1 101.7C384.8 105.1 386.3 108.1 386.9 111.8C387.4 115.6 387.6 120.5 387.3 124.3C386.9 128.1 385.7 131.2 385 134.6C384.2 137.9 383.8 141.4 382.9 144.3C382.1 147.2 381 150.4 379.9 152C378.7 153.6 377.1 153.2 375.8 154C374.5 154.8 373.3 156.1 372 156.8C370.7 157.5 369.1 159 367.7 158.3C366.4 157.5 365.2 154.6 364.1 152.2C363 149.9 362.1 147 361.1 144.2C360.2 141.4 359 138.7 358.5 135.3C357.9 131.9 357.9 127.7 357.9 123.8C357.9 120 358.3 116.3 358.5 112.4C358.7 108.5 358.6 104.3 359.1 100.5C359.5 96.7 360.1 92.8 361 89.6C361.8 86.4 362.9 83.5 364.1 81.3C365.2 79 366.5 77 367.9 76C369.2 75 370.6 75.3 372 75.4Z" fill="#bcd0c1"/><path d="M376.3 88.4C377.1 88.1 377.9 88.1 378.6 89C379.3 90 380.1 91.7 380.6 94C381.1 96.3 381.4 100 381.8 102.8C382.1 105.5 382.5 107.9 382.8 110.6C383.2 113.3 383.8 116.2 384 119C384.3 121.9 384.3 125.1 384.2 127.7C384.1 130.2 383.7 132.3 383.4 134.4C383 136.6 382.7 138.8 382.2 140.5C381.7 142.3 381.2 144 380.5 145.2C379.9 146.4 379.2 147.1 378.5 147.5C377.8 148 377 148.1 376.3 148C375.6 148 374.9 147.7 374.2 147.3C373.5 146.9 372.7 146.6 372.1 145.5C371.4 144.4 370.7 142.8 370.3 140.9C369.9 139 369.8 136.3 369.5 134.1C369.3 131.8 369.1 130 368.9 127.5C368.7 124.9 368.2 121.8 368.3 118.8C368.3 115.8 368.7 112 369.2 109.3C369.6 106.7 370.4 105.1 370.9 102.9C371.4 100.7 371.8 98.4 372.4 96.3C372.9 94.2 373.5 91.7 374.1 90.4C374.8 89 375.6 88.6 376.3 88.4Z" fill="#adc4b3" opacity="0.75"/><path d="M399 178L401.5 122.6L406.5 122.6L409 178Z" fill="#98b29f"/><path d="M404 52.3C408.9 51.8 414.5 51.4 419.2 52.7C423.9 54 429 56.7 432.1 60.3C435.3 63.8 436 69.9 438.1 73.9C440.2 78 441.9 81 444.6 84.5C447.3 88.1 452.4 91.6 454.3 95.4C456.2 99.3 456.5 104 455.8 107.6C455.1 111.1 452.2 114 449.9 116.9C447.7 119.9 445.5 123 442.5 125.5C439.4 128 435.5 130.4 431.4 132C427.3 133.5 422.3 134.3 417.7 134.8C413.2 135.3 408.5 135.2 404 135.1C399.5 135 395.1 134.7 390.5 134.3C385.8 133.9 380.4 133.9 376.1 132.5C371.7 131.2 367 128.9 364.5 126.2C361.9 123.4 362 119.3 360.6 116.1C359.2 113 357.8 110.7 356.1 107.2C354.5 103.6 350.3 99.2 350.5 95C350.7 90.8 353.9 85.3 357.2 81.8C360.5 78.4 366.6 77.1 370.3 74.3C373.9 71.5 375.7 68.1 379 64.9C382.2 61.8 385.5 57.5 389.7 55.4C393.8 53.3 399.1 52.7 404 52.3Z" fill="#a8bfae"/><path d="M380.1 82.3C383 81.9 386.3 82.2 389 83.1C391.7 84.1 393.9 86.3 396.2 87.9C398.5 89.6 400.9 91 402.8 93C404.7 94.9 406.7 97.2 407.5 99.6C408.3 102 407.3 105.2 407.4 107.6C407.4 110 407.6 111.8 407.9 113.9C408.2 116 409.8 118.2 409.2 120.1C408.6 122 406.5 124 404.3 125.2C402.1 126.5 398.6 126.9 396 127.7C393.3 128.5 391 129.5 388.4 130C385.7 130.6 382.9 131.1 380.1 131.1C377.4 131.1 374.6 130.4 371.9 129.9C369.2 129.4 366.4 128.9 364 128C361.6 127 359.3 125.7 357.6 124.3C355.8 122.9 354.8 121 353.5 119.3C352.2 117.6 350.6 116.2 349.9 114.1C349.1 112.1 348.4 109.5 348.8 107C349.3 104.6 351.1 101.8 352.8 99.6C354.4 97.4 356.5 95.6 358.5 93.8C360.5 92.1 362.7 90.6 364.9 89.2C367.1 87.8 369.4 86.5 372 85.4C374.5 84.2 377.3 82.6 380.1 82.3Z" fill="#a8bfae"/><path d="M428.9 75.8C432 76.3 434.9 78.7 437.7 80.1C440.5 81.4 443.2 82.3 445.7 83.8C448.1 85.4 450.6 87.2 452.4 89.3C454.3 91.4 455.6 94 457 96.5C458.3 99 459.8 101.8 460.5 104.4C461.1 106.9 461.1 109.6 460.7 111.8C460.3 114.1 459.2 115.9 458.1 117.8C456.9 119.8 455.7 121.9 453.7 123.4C451.7 125 448.8 126.2 446.1 127.1C443.4 127.9 440.3 128.2 437.5 128.7C434.6 129.3 431.8 130.3 428.9 130.5C425.9 130.7 422.5 130.7 419.7 130.1C416.9 129.5 414.3 128 411.9 126.7C409.6 125.5 407.3 124.1 405.4 122.6C403.4 121.1 401.6 119.4 400.2 117.7C398.8 115.9 397.7 114.1 396.8 111.9C395.8 109.6 394.3 106.7 394.7 104C395.1 101.4 396.9 97.9 399.1 95.8C401.3 93.7 405.7 93.2 408 91.5C410.3 89.8 411.3 87.9 413.2 85.5C415 83.1 416.5 78.6 419.1 77C421.7 75.4 425.8 75.3 428.9 75.8Z" fill="#a8bfae"/><path d="M419.9 99.7C423.3 100.4 425.9 100.8 429.2 101.2C432.4 101.6 436.3 101.3 439.2 102.1C442.2 102.9 444.8 104.5 447.1 106C449.3 107.5 451.2 109.3 452.7 111.1C454.2 112.9 455.6 115.1 456 116.9C456.5 118.7 456.1 120.5 455.6 121.9C455.2 123.3 454.7 124.4 453.3 125.5C451.9 126.6 449.7 127.7 447.3 128.5C444.8 129.4 441.3 129.8 438.4 130.4C435.5 131 432.9 131.7 429.8 132.1C426.7 132.6 423.2 133 419.9 133C416.6 132.9 413.5 132.2 410.2 131.9C406.8 131.7 403.3 131.6 399.9 131.2C396.6 130.7 392.3 130.2 390.3 129.2C388.3 128.3 388.6 126.5 388 125.3C387.4 124 387.5 123.1 386.8 121.7C386.1 120.4 383.5 118.7 383.8 116.9C384.1 115.2 386.6 113.1 388.5 111.4C390.3 109.8 393 108.8 394.8 107C396.5 105.2 396.5 102.1 398.8 100.4C401.1 98.7 405.1 97.2 408.6 97.1C412.2 97 416.5 99.1 419.9 99.7Z" fill="#98b29f" opacity="0.75"/><path d="M391.1 69.3C393.3 69.3 395.6 69.8 397.9 70.1C400.1 70.5 402.8 70.7 404.7 71.5C406.5 72.4 408.1 73.9 409.2 75.2C410.3 76.6 410.5 78.2 411.4 79.6C412.4 81 414.4 82.3 415 83.7C415.7 85 416 86.6 415.5 87.8C414.9 88.9 412.7 89.7 411.6 90.7C410.5 91.6 410.1 92.7 408.9 93.7C407.7 94.6 406.4 95.8 404.5 96.4C402.6 96.9 399.9 96.8 397.6 97.1C395.4 97.4 393.4 97.9 391.1 98.1C388.7 98.3 385.7 98.8 383.7 98.4C381.7 97.9 380.3 96.3 378.9 95.4C377.6 94.4 377.2 93.4 375.6 92.6C374 91.9 370.9 91.8 369.2 91C367.4 90.2 365.7 89.1 365.2 87.9C364.7 86.6 365.6 85 366.2 83.6C366.9 82.1 367.7 80.4 368.9 79.1C370.2 77.8 372.1 76.7 373.8 75.8C375.5 74.8 377.3 74.1 379.1 73.2C380.8 72.3 382.4 71 384.4 70.3C386.4 69.7 388.8 69.4 391.1 69.3Z" fill="#b9cdbf" opacity="0.8"/><ellipse cx="196" cy="182" rx="40" ry="5.5" fill="#c4d6c8"/><ellipse cx="196" cy="181.5" rx="4.5" ry="1.6" fill="#93ab99"/><rect x="194.7" y="92" width="2.6" height="90" rx="1.3" fill="#97ae9d"/><path d="M197.3 93C210 94.5 221 96.5 233 101C221 105 210 107.5 197.3 110Z" fill="#a4bba9"/><path d="M150 204C170 197 196 197 214 203C200 208 168 209 150 204Z" fill="#e6e2d3" opacity="0.8"/>`;

function GolfBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="cw-hFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e3eae4" />
            <stop offset="1" stopColor="#dae5dc" />
          </linearGradient>
          <linearGradient id="cw-hMid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d3e0d5" />
            <stop offset="1" stopColor="#c9d9cc" />
          </linearGradient>
          <linearGradient id="cw-gKnoll" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#cddccf" />
            <stop offset="1" stopColor="#c3d5c7" />
          </linearGradient>
          <linearGradient id="cw-hNear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c3d5c7" />
            <stop offset="1" stopColor="#b6cbba" />
          </linearGradient>
          <linearGradient id="cw-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f3f6f2" stopOpacity="0" />
            <stop offset="0.6" stopColor="#f3f6f2" stopOpacity="0.6" />
            <stop offset="1" stopColor="#f3f6f2" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#dbe9de]/50 blur-3xl" />
      <div className="absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-[#e2ede4]/60 blur-3xl" />

      <div className="absolute inset-x-0 bottom-0 h-[36vh] min-h-[220px]">
        {/* far and middle hills, with haze between them */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1600 400"
          preserveAspectRatio="none"
        >
          <path
            d="M0 170C220 115 420 125 640 160S1060 100 1300 120S1520 160 1600 150L1600 400L0 400Z"
            fill="url(#cw-hFar)"
          />
          <rect y="140" width="1600" height="120" fill="url(#cw-haze)" />
          <path
            d="M0 262C260 222 520 236 760 256S1180 214 1400 228S1560 250 1600 246L1600 400L0 400Z"
            fill="url(#cw-hMid)"
          />
        </svg>

        {/* trees on the left */}
        <svg
          className="absolute bottom-[9%] left-0 w-[36%] min-w-[230px] max-w-[520px]"
          viewBox="0 0 460 230"
          dangerouslySetInnerHTML={{ __html: BACKDROP_LEFT }}
        />

        {/* flag, bunker and trees on the right */}
        <svg
          className="absolute bottom-[9%] right-0 w-[33%] min-w-[210px] max-w-[480px]"
          viewBox="0 0 420 230"
          dangerouslySetInnerHTML={{ __html: BACKDROP_RIGHT }}
        />

        {/* near grass */}
        <svg
          className="absolute inset-x-0 bottom-0 h-[16%] w-full"
          viewBox="0 0 1600 100"
          preserveAspectRatio="none"
        >
          <path
            d="M0 34C300 10 600 22 900 28S1360 8 1600 20L1600 100L0 100Z"
            fill="url(#cw-hNear)"
          />
          <path
            d="M0 60C400 40 800 52 1200 54S1500 46 1600 48"
            fill="none"
            stroke="#adc2b2"
            strokeWidth="1"
            opacity="0.6"
          />
        </svg>
      </div>
    </div>
  );
}

// Golf cart (side view), same stroke style as the lucide icons.
function GolfCartIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3.5 4.5h14" />
      <path d="M5.5 4.5v7.5" />
      <path d="M16 4.5l2.5 7.5" />
      <path d="M3 15.5v-3.5h16.5l1.5 2v1.5" />
      <path d="M8 12V9.5h3.5V12" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17.5" cy="17" r="2" />
      <path d="M9 17h6.5" />
    </svg>
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
      icon: <GolfCartIcon size={17} />,
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
