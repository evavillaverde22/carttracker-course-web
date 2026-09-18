"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE_URL =
  "https://08m2whbesa.execute-api.us-east-1.amazonaws.com";

type Device = {
  device_id?: string;
  cart_id?: string | null;
  course_id?: string | null;
  status?: string;
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

export default function ProvisioningPage() {
  const searchParams = useSearchParams();

  const deviceId = searchParams.get("device_id");

  const [device, setDevice] = useState<Device | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [carts, setCarts] = useState<Cart[]>([]);

  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedCart, setSelectedCart] = useState("");
  const [installerName, setInstallerName] = useState("");

  const [loadingDevice, setLoadingDevice] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingCarts, setLoadingCarts] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const [deviceError, setDeviceError] = useState("");
  const [coursesError, setCoursesError] = useState("");
  const [cartsError, setCartsError] = useState("");
  const [assignError, setAssignError] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  /*
   * =========================================================
   * CARGAR DISPOSITIVO
   * =========================================================
   */
  async function loadDevice() {
    if (!deviceId) {
      setLoadingDevice(false);
      return;
    }

    try {
      setLoadingDevice(true);
      setDeviceError("");

      const response = await fetch(
        `${API_BASE_URL}/devices/${deviceId}`
      );

      if (!response.ok) {
        throw new Error(
          `Error ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();

      console.log("GET device:");
      console.log(data);

      setDevice(data);
    } catch (error) {
      console.error(error);

      setDeviceError(
        "No se ha podido obtener el dispositivo."
      );
    } finally {
      setLoadingDevice(false);
    }
  }

  useEffect(() => {
    loadDevice();
  }, [deviceId]);

  /*
   * =========================================================
   * CARGAR COURSES
   * =========================================================
   */
  useEffect(() => {
    async function loadCourses() {
      try {
        setLoadingCourses(true);
        setCoursesError("");

        const response = await fetch(
          `${API_BASE_URL}/courses`
        );

        if (!response.ok) {
          throw new Error(
            `Error ${response.status}: ${response.statusText}`
          );
        }

        const data = await response.json();

        console.log("GET courses:");
        console.log(data);

        setCourses(data.courses ?? []);
      } catch (error) {
        console.error(error);

        setCoursesError(
          "No se han podido obtener los campos de golf."
        );
      } finally {
        setLoadingCourses(false);
      }
    }

    loadCourses();
  }, []);

  /*
   * =========================================================
   * CARGAR CARTS DEL COURSE SELECCIONADO
   * =========================================================
   */
  useEffect(() => {
    async function loadCarts() {
      if (!selectedCourse) {
        setCarts([]);
        setSelectedCart("");
        return;
      }

      try {
        setLoadingCarts(true);
        setCartsError("");
        setSelectedCart("");

        const response = await fetch(
          `${API_BASE_URL}/courses/${selectedCourse}/carts`
        );

        if (!response.ok) {
          throw new Error(
            `Error ${response.status}: ${response.statusText}`
          );
        }

        const data = await response.json();

        console.log("GET carts:");
        console.log(data);

        setCarts(data.carts ?? []);
      } catch (error) {
        console.error(error);

        setCartsError(
          "No se han podido obtener los carritos."
        );

        setCarts([]);
      } finally {
        setLoadingCarts(false);
      }
    }

    loadCarts();
  }, [selectedCourse]);

  /*
   * SOLO CARTS DISPONIBLES
   */
  const availableCarts = carts.filter(
    (cart) => cart.available
  );

  const selectedCourseData = courses.find(
    (course) =>
      course.course_id === selectedCourse
  );

  /*
   * =========================================================
   * ASIGNAR DEVICE
   * =========================================================
   */
  async function handleAssign() {
    setAssignError("");
    setSuccessMessage("");

    if (!deviceId) {
      setAssignError(
        "No se ha detectado ningún dispositivo."
      );
      return;
    }

    if (!selectedCourse) {
      setAssignError(
        "Selecciona un campo de golf."
      );
      return;
    }

    if (!selectedCart) {
      setAssignError(
        "Selecciona un carrito disponible."
      );
      return;
    }

    if (!installerName.trim()) {
      setAssignError(
        "Introduce el nombre del instalador."
      );
      return;
    }

    const payload = {
      course_id: selectedCourse,
      cart_id: selectedCart,
      changed_by: installerName.trim(),
      reason: "QR provisioning",
    };

    try {
      setAssigning(true);

      console.log("POST assign:");
      console.log(payload);

      const response = await fetch(
        `${API_BASE_URL}/devices/${deviceId}/assign`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        let message =
          `Error ${response.status} al realizar la asignación.`;

        try {
          const errorData = await response.json();

          message =
            errorData.message ??
            errorData.error ??
            message;
        } catch {
          // usamos el mensaje por defecto
        }

        throw new Error(message);
      }

      let responseData = null;

      try {
        responseData = await response.json();
      } catch {
        // puede devolver 204 o body vacío
      }

      console.log("POST assign response:");
      console.log(responseData);

      setSuccessMessage(
        `El dispositivo ${deviceId} se ha asignado correctamente a ${selectedCart} en ${
          selectedCourseData?.name ?? selectedCourse
        }.`
      );

      /*
       * Volvemos a leer el dispositivo para comprobar
       * que la asignación quedó persistida en Aurora.
       */
      await loadDevice();

      /*
       * Volvemos a cargar carts porque el que acabamos
       * de ocupar ya debería dejar de estar disponible.
       */
      const cartsResponse = await fetch(
        `${API_BASE_URL}/courses/${selectedCourse}/carts`
      );

      if (cartsResponse.ok) {
        const cartsData = await cartsResponse.json();

        setCarts(cartsData.carts ?? []);
      }

      setSelectedCart("");
    } catch (error) {
      console.error(error);

      if (error instanceof Error) {
        setAssignError(error.message);
      } else {
        setAssignError(
          "Ha ocurrido un error al realizar la asignación."
        );
      }
    } finally {
      setAssigning(false);
    }
  }

  /*
   * =========================================================
   * SIN DEVICE_ID
   * =========================================================
   */
  if (!deviceId) {
    return (
      <main className="min-h-screen bg-[#edf1ea] px-4 py-10">
        <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 shadow-sm">

          <h1 className="text-2xl font-bold text-[#1d2a24]">
            CartTracker
          </h1>

          <p className="mt-6 font-medium text-red-600">
            No se ha detectado ningún dispositivo.
          </p>

          <p className="mt-2 text-sm text-gray-500">
            Abre esta página utilizando el QR de instalación.
          </p>

        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#edf1ea] px-4 py-8">

      <div className="mx-auto max-w-2xl">

        {/* HEADER */}

        <header className="mb-6 flex items-center justify-between px-2">

          <div className="flex items-center gap-3">

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#32634f] text-sm font-bold text-white">
              CT
            </div>

            <div>
              <h1 className="text-xl font-bold text-[#202b27]">
                CartTracker
              </h1>

              <p className="text-sm text-gray-500">
                Device Provisioning
              </p>
            </div>

          </div>

        </header>

        {/* CARD PRINCIPAL */}

        <section className="rounded-[28px] bg-[#fafbf8] p-6 shadow-sm sm:p-10">

          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#477963]">
            Instalación
          </p>

          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#202824]">
            Asignar GPS a carrito
          </h2>

          <p className="mt-3 text-sm leading-6 text-gray-500">
            El dispositivo ha sido identificado mediante el QR.
          </p>

          {/* DEVICE */}

          <div className="mt-8 rounded-2xl border border-[#dfe6dc] bg-white p-5">

            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Dispositivo detectado
            </p>

            {loadingDevice && (
              <p className="mt-4 text-sm text-gray-500">
                Consultando dispositivo...
              </p>
            )}

            {deviceError && (
              <div className="mt-4 rounded-xl bg-red-50 p-4">

                <p className="font-medium text-red-700">
                  Error
                </p>

                <p className="mt-1 text-sm text-red-600">
                  {deviceError}
                </p>

              </div>
            )}

            {!loadingDevice && !deviceError && (
              <div className="mt-4 grid gap-5 sm:grid-cols-3">

                <div>
                  <p className="text-xs uppercase text-gray-400">
                    GPS
                  </p>

                  <p className="mt-1 font-bold text-[#202824]">
                    {device?.device_id ?? deviceId}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase text-gray-400">
                    Carrito actual
                  </p>

                  <p className="mt-1 font-semibold text-[#202824]">
                    {device?.cart_id ?? "Sin asignar"}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase text-gray-400">
                    Campo actual
                  </p>

                  <p className="mt-1 font-semibold text-[#202824]">
                    {device?.course_id ?? "Sin asignar"}
                  </p>
                </div>

              </div>
            )}

          </div>

          {/* COURSE */}

          <div className="mt-8">

            <div className="mb-3 flex items-center gap-3">

              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e5eee8] text-sm font-bold text-[#32634f]">
                1
              </div>

              <div>
                <h3 className="font-semibold text-[#202824]">
                  Campo de golf
                </h3>

                <p className="text-xs text-gray-400">
                  Selecciona el campo donde se instalará el dispositivo.
                </p>
              </div>

            </div>

            <select
              value={selectedCourse}
              onChange={(event) => {
                setSelectedCourse(
                  event.target.value
                );

                setSelectedCart("");
                setAssignError("");
                setSuccessMessage("");
              }}
              disabled={
                loadingCourses ||
                !!coursesError ||
                assigning
              }
              className="w-full rounded-2xl border border-[#d9e1d8] bg-white px-4 py-4 text-[#26312c] outline-none focus:border-[#32634f] disabled:bg-gray-100 disabled:text-gray-400"
            >

              <option value="">
                {loadingCourses
                  ? "Cargando campos..."
                  : "Selecciona un campo"}
              </option>

              {courses.map((course) => (
                <option
                  key={course.course_id}
                  value={course.course_id}
                >
                  {course.name} · {course.course_id}
                </option>
              ))}

            </select>

            {coursesError && (
              <p className="mt-2 text-sm text-red-600">
                {coursesError}
              </p>
            )}

          </div>

          {/* CART */}

          <div className="mt-7">

            <div className="mb-3 flex items-center gap-3">

              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e5eee8] text-sm font-bold text-[#32634f]">
                2
              </div>

              <div>
                <h3 className="font-semibold text-[#202824]">
                  Carrito
                </h3>

                <p className="text-xs text-gray-400">
                  Solo se muestran carritos que no tienen un GPS asignado.
                </p>
              </div>

            </div>

            <select
              value={selectedCart}
              onChange={(event) => {
                setSelectedCart(
                  event.target.value
                );

                setAssignError("");
                setSuccessMessage("");
              }}
              disabled={
                !selectedCourse ||
                loadingCarts ||
                availableCarts.length === 0 ||
                assigning
              }
              className="w-full rounded-2xl border border-[#d9e1d8] bg-white px-4 py-4 text-[#26312c] outline-none focus:border-[#32634f] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            >

              <option value="">
                {!selectedCourse
                  ? "Selecciona primero un campo"
                  : loadingCarts
                  ? "Cargando carritos..."
                  : availableCarts.length === 0
                  ? "No hay carritos disponibles"
                  : "Selecciona un carrito libre"}
              </option>

              {availableCarts.map((cart) => (
                <option
                  key={cart.cart_id}
                  value={cart.cart_id}
                >
                  {cart.cart_id}
                </option>
              ))}

            </select>

            {cartsError && (
              <p className="mt-2 text-sm text-red-600">
                {cartsError}
              </p>
            )}

            {!loadingCarts &&
              selectedCourse &&
              !cartsError &&
              availableCarts.length === 0 && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">

                  <p className="font-semibold text-amber-800">
                    No hay carritos libres
                  </p>

                  <p className="mt-1 text-sm text-amber-700">
                    Todos los carritos de este campo tienen actualmente un dispositivo asignado.
                  </p>

                </div>
              )}

          </div>

          {/* INSTALLER */}

          <div className="mt-7">

            <div className="mb-3 flex items-center gap-3">

              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e5eee8] text-sm font-bold text-[#32634f]">
                3
              </div>

              <div>
                <h3 className="font-semibold text-[#202824]">
                  Instalador
                </h3>

                <p className="text-xs text-gray-400">
                  Introduce quién realiza la instalación.
                </p>
              </div>

            </div>

            <input
              type="text"
              value={installerName}
              onChange={(event) => {
                setInstallerName(
                  event.target.value
                );

                setAssignError("");
              }}
              disabled={assigning}
              placeholder="Nombre del instalador"
              className="w-full rounded-2xl border border-[#d9e1d8] bg-white px-4 py-4 text-[#26312c] outline-none focus:border-[#32634f] disabled:bg-gray-100"
            />

          </div>

          {/* ERROR */}

          {assignError && (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5">

              <p className="font-semibold text-red-700">
                No se ha podido realizar la asignación
              </p>

              <p className="mt-1 text-sm text-red-600">
                {assignError}
              </p>

            </div>
          )}

          {/* SUCCESS */}

          {successMessage && (
            <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-5">

              <div className="flex items-start gap-3">

                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 font-bold text-white">
                  ✓
                </div>

                <div>
                  <p className="font-bold text-green-800">
                    Asignación completada
                  </p>

                  <p className="mt-1 text-sm leading-6 text-green-700">
                    {successMessage}
                  </p>
                </div>

              </div>

            </div>
          )}

          {/* BUTTON */}

          <button
            onClick={handleAssign}
            disabled={
              assigning ||
              loadingDevice ||
              !!deviceError ||
              !selectedCourse ||
              !selectedCart ||
              !installerName.trim()
            }
            className="mt-8 w-full rounded-2xl bg-[#32634f] px-6 py-4 font-semibold text-white transition hover:bg-[#28513f] disabled:cursor-not-allowed disabled:bg-gray-400"
          >

            {assigning
              ? "Guardando asignación..."
              : "Confirmar asignación"}

          </button>

        </section>

      </div>

    </main>
  );
}