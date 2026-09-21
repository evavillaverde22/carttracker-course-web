"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";


const API_BASE_URL =
  "https://08m2whbesa.execute-api.us-east-1.amazonaws.com";


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


type SimMode =
  | "known"
  | "new";


export default function ProvisioningPage() {
  const searchParams = useSearchParams();

  const deviceId =
    searchParams.get("device_id");


  // =====================================================
  // ESTADO
  // =====================================================

  const [device, setDevice] =
    useState<Device | null>(null);

  const [courses, setCourses] =
    useState<Course[]>([]);

  const [carts, setCarts] =
    useState<Cart[]>([]);


  const [imei, setImei] =
    useState("");

  const [sims, setSims] =
    useState<Sim[]>([]);

  const [simMode, setSimMode] =
    useState<SimMode>("known");

  const [selectedSim, setSelectedSim] =
    useState("");

  const [newIccid, setNewIccid] =
    useState("");

  const [selectedCourse, setSelectedCourse] =
    useState("");

  const [selectedCart, setSelectedCart] =
    useState("");

  const [installerName, setInstallerName] =
    useState("");


  const [loadingDevice, setLoadingDevice] =
    useState(true);

  const [loadingCourses, setLoadingCourses] =
    useState(true);

  const [loadingCarts, setLoadingCarts] =
    useState(false);

  const [loadingSims, setLoadingSims] =
    useState(true);

  const [assigning, setAssigning] =
    useState(false);


  const [deviceError, setDeviceError] =
    useState("");

  const [coursesError, setCoursesError] =
    useState("");

  const [cartsError, setCartsError] =
    useState("");

  const [simsError, setSimsError] =
    useState("");

  const [assignError, setAssignError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");


  // =====================================================
  // CARGAR DISPOSITIVO
  // =====================================================

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

      const data: Device =
        await response.json();

      setDevice(data);

      /*
       * Si ya hay IMEI o ICCID guardados,
       * los mostramos.
       *
       * Si están a NULL, los inputs quedan vacíos.
       */

      setImei(
        data.imei ?? ""
      );

      if (data.iccid) {
        setSimMode("known");
        setSelectedSim(data.iccid);
        setNewIccid("");
      }

    } catch (error) {
      console.error(
        "Error cargando dispositivo:",
        error
      );

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


  // =====================================================
  // CARGAR SIMS DISPONIBLES
  // =====================================================

  async function loadAvailableSims() {
    try {
      setLoadingSims(true);
      setSimsError("");

      const response = await fetch(
        `${API_BASE_URL}/sims/available`
      );

      if (!response.ok) {
        throw new Error(
          `Error ${response.status}: ${response.statusText}`
        );
      }

      const data =
        await response.json();

      setSims(
        data.sims ?? []
      );

    } catch (error) {
      console.error(
        "Error cargando SIMs:",
        error
      );

      setSimsError(
        "No se han podido obtener las SIMs disponibles."
      );

      setSims([]);

    } finally {
      setLoadingSims(false);
    }
  }


  useEffect(() => {
    loadAvailableSims();
  }, []);


  // =====================================================
  // CARGAR CAMPOS DE GOLF
  // =====================================================

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

        const data =
          await response.json();

        setCourses(
          data.courses ?? []
        );

      } catch (error) {
        console.error(
          "Error cargando campos:",
          error
        );

        setCoursesError(
          "No se han podido obtener los campos de golf."
        );

      } finally {
        setLoadingCourses(false);
      }
    }

    loadCourses();

  }, []);


  // =====================================================
  // CARGAR CARRITOS DEL CAMPO
  // =====================================================

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

        const data =
          await response.json();

        setCarts(
          data.carts ?? []
        );

      } catch (error) {
        console.error(
          "Error cargando carritos:",
          error
        );

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


  // =====================================================
  // CARRITOS DISPONIBLES
  // =====================================================

  const availableCarts =
    carts.filter(
      (cart) =>
        cart.available ||
        cart.assigned_device_id === deviceId ||
        cart.cart_id === device?.cart_id
    );


  const selectedCourseData =
    courses.find(
      (course) =>
        course.course_id === selectedCourse
    );


  const currentDeviceIccid =
    device?.iccid ?? "";


  const selectableSims = [
    ...(currentDeviceIccid
      ? [{
          iccid: currentDeviceIccid,
          status: "assigned",
          assigned_device_id:
            deviceId,
        }]
      : []),

    ...sims.filter(
      (sim) =>
        sim.iccid !==
        currentDeviceIccid
    ),
  ];


  const finalIccid =
    simMode === "known"
      ? selectedSim.trim()
      : newIccid.trim();


  const validIccid =
    /^\d{18,22}$/.test(
      finalIccid
    );


  // =====================================================
  // GUARDAR PROVISIONING
  // =====================================================

  async function handleAssign() {
    setAssignError("");
    setSuccessMessage("");


    if (!deviceId) {
      setAssignError(
        "No se ha detectado ningún tracker."
      );

      return;
    }


    // ---------------------------------------------------
    // IMEI
    // ---------------------------------------------------

    const cleanImei =
      imei.replace(/\D/g, "");


    if (!cleanImei) {
      setAssignError(
        "Introduce el IMEI del MT700."
      );

      return;
    }


    if (
      !/^\d{15}$/.test(cleanImei)
    ) {
      setAssignError(
        "El IMEI debe contener exactamente 15 dígitos."
      );

      return;
    }


    // ---------------------------------------------------
    // ICCID
    // ---------------------------------------------------

    const cleanIccid =
      finalIccid.replace(
        /\D/g,
        ""
      );


    if (!cleanIccid) {
      setAssignError(
        simMode === "known"
          ? "Selecciona una SIM."
          : "Introduce el ICCID de la nueva SIM."
      );

      return;
    }


    if (
      !/^\d{18,22}$/.test(
        cleanIccid
      )
    ) {
      setAssignError(
        "El ICCID debe contener entre 18 y 22 dígitos."
      );

      return;
    }


    // ---------------------------------------------------
    // COURSE
    // ---------------------------------------------------

    if (!selectedCourse) {
      setAssignError(
        "Selecciona un campo de golf."
      );

      return;
    }


    // ---------------------------------------------------
    // CART
    // ---------------------------------------------------

    if (!selectedCart) {
      setAssignError(
        "Selecciona un carrito."
      );

      return;
    }


    // ---------------------------------------------------
    // INSTALLER
    // ---------------------------------------------------

    if (!installerName.trim()) {
      setAssignError(
        "Introduce el nombre del instalador."
      );

      return;
    }


    // ---------------------------------------------------
    // PAYLOAD
    // ---------------------------------------------------

    const payload = {
      imei:
        cleanImei,

      iccid:
        cleanIccid,

      course_id:
        selectedCourse,

      cart_id:
        selectedCart,

      changed_by:
        installerName.trim(),

      reason:
        "MT700 pilot QR provisioning",
    };


    try {
      setAssigning(true);

      console.log(
        "POST MT700 provisioning:",
        payload
      );


      const response = await fetch(
        `${API_BASE_URL}/devices/${deviceId}/assign`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(payload),
        }
      );


      if (!response.ok) {
        let message =
          `Error ${response.status} al guardar el dispositivo.`;

        try {
          const errorData =
            await response.json();

          message =
            errorData.message ??
            errorData.error ??
            message;

        } catch {
          // usamos mensaje por defecto
        }

        throw new Error(
          message
        );
      }


      const responseData =
        await response.json();


      console.log(
        "Provisioning completado:",
        responseData
      );


      setSuccessMessage(
        `El MT700 ${deviceId} se ha dado de alta correctamente y se ha asignado a ${selectedCart} en ${
          selectedCourseData?.name ??
          selectedCourse
        }.`
      );


      /*
       * Volvemos a cargar el dispositivo
       * para comprobar lo almacenado.
       */

      await loadDevice();

      /*
       * Recargamos las SIMs disponibles.
       */

      await loadAvailableSims();


      /*
       * Recargamos los carritos.
       */

      const cartsResponse =
        await fetch(
          `${API_BASE_URL}/courses/${selectedCourse}/carts`
        );


      if (cartsResponse.ok) {
        const cartsData =
          await cartsResponse.json();

        setCarts(
          cartsData.carts ?? []
        );
      }


    } catch (error) {
      console.error(
        "Error provisioning:",
        error
      );


      if (
        error instanceof Error
      ) {
        setAssignError(
          error.message
        );

      } else {
        setAssignError(
          "Ha ocurrido un error al guardar el dispositivo."
        );
      }

    } finally {
      setAssigning(false);
    }
  }


  // =====================================================
  // SIN DEVICE ID
  // =====================================================

  if (!deviceId) {
    return (
      <main className="min-h-screen bg-[#edf1ea] px-4 py-10">

        <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 shadow-sm">

          <h1 className="text-2xl font-bold text-[#1d2a24]">
            Courserev
          </h1>

          <p className="mt-6 font-medium text-red-600">
            No se ha detectado ningún tracker.
          </p>

          <p className="mt-2 text-sm text-gray-500">
            Abre esta página utilizando el QR del MT700.
          </p>

        </div>

      </main>
    );
  }


  // =====================================================
  // PÁGINA
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
                MT700 Pilot Provisioning
              </p>

            </div>

          </div>

        </header>


        {/* CARD PRINCIPAL */}

        <section className="rounded-[28px] bg-[#fafbf8] p-6 shadow-sm sm:p-10">


          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#477963]">
            MT700 Pilot
          </p>


          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#202824]">
            Dar de alta GPS
          </h2>


          <p className="mt-3 text-sm leading-6 text-gray-500">
            El tracker se ha identificado mediante el QR.
            Introduce los datos físicos del MT700 y selecciona
            el carrito donde se instalará.
          </p>


          {/* =================================================
              TRACKER
          ================================================= */}

          <div className="mt-8 rounded-2xl border border-[#dfe6dc] bg-white p-5">

            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Tracker detectado
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


            {!loadingDevice &&
              !deviceError && (

                <div className="mt-4 grid gap-5 sm:grid-cols-3">


                  <div>

                    <p className="text-xs uppercase text-gray-400">
                      Tracker ID
                    </p>

                    <p className="mt-1 font-bold text-[#202824]">
                      {device?.device_id ??
                        deviceId}
                    </p>

                  </div>


                  <div>

                    <p className="text-xs uppercase text-gray-400">
                      Carrito actual
                    </p>

                    <p className="mt-1 font-semibold text-[#202824]">
                      {device?.cart_id ??
                        "Sin asignar"}
                    </p>

                  </div>


                  <div>

                    <p className="text-xs uppercase text-gray-400">
                      Estado
                    </p>

                    <p className="mt-1 font-semibold text-[#202824]">
                      {device?.status ??
                        "registered"}
                    </p>

                  </div>


                </div>
              )}

          </div>


          {/* =================================================
              IMEI
          ================================================= */}

          <div className="mt-8">

            <div>

              <h3 className="font-semibold text-[#202824]">
                IMEI *
              </h3>

              <p className="mt-1 text-xs text-gray-400">
                Introduce los 15 dígitos del IMEI que aparecen en el MT700.
              </p>

            </div>


            <input
              type="text"

              value={imei}

              onChange={(event) => {
                const value =
                  event.target.value
                    .replace(/\D/g, "")
                    .slice(0, 15);

                setImei(
                  value
                );

                setAssignError("");
                setSuccessMessage("");
              }}

              disabled={assigning}

              placeholder="Introduce los 15 dígitos del IMEI"

              autoComplete="off"

              className="mt-3 w-full rounded-2xl border border-[#d9e1d8] bg-white px-4 py-4 text-[#26312c] outline-none focus:border-[#32634f] disabled:bg-gray-100"
            />

            <p className="mt-2 text-right text-xs text-gray-400">
              {imei.length}/15
            </p>

          </div>


          {/* =================================================
              ICCID / SIM
          ================================================= */}

          <div className="mt-7">

            <div>

              <h3 className="font-semibold text-[#202824]">
                SIM / ICCID *
              </h3>

              <p className="mt-1 text-xs text-gray-400">
                Selecciona una SIM ya registrada o añade una nueva.
              </p>

            </div>


            <div className="mt-4 grid gap-3 sm:grid-cols-2">

              <button
                type="button"

                onClick={() => {
                  setSimMode("known");
                  setNewIccid("");
                  setAssignError("");
                  setSuccessMessage("");
                }}

                disabled={assigning}

                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  simMode === "known"
                    ? "border-[#32634f] bg-[#edf5f0]"
                    : "border-[#d9e1d8] bg-white"
                } disabled:opacity-60`}
              >

                <p className="font-semibold text-[#202824]">
                  Seleccionar SIM conocida
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Elige una SIM disponible del inventario.
                </p>

              </button>


              <button
                type="button"

                onClick={() => {
                  setSimMode("new");
                  setSelectedSim("");
                  setAssignError("");
                  setSuccessMessage("");
                }}

                disabled={assigning}

                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  simMode === "new"
                    ? "border-[#32634f] bg-[#edf5f0]"
                    : "border-[#d9e1d8] bg-white"
                } disabled:opacity-60`}
              >

                <p className="font-semibold text-[#202824]">
                  Añadir nueva SIM
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Introduce manualmente un ICCID nuevo.
                </p>

              </button>

            </div>


            {simMode === "known" && (

              <div className="mt-4">

                <select
                  value={selectedSim}

                  onChange={(event) => {
                    setSelectedSim(
                      event.target.value
                    );

                    setAssignError("");
                    setSuccessMessage("");
                  }}

                  disabled={
                    assigning ||
                    loadingSims ||
                    !!simsError ||
                    selectableSims.length === 0
                  }

                  className="w-full rounded-2xl border border-[#d9e1d8] bg-white px-4 py-4 text-[#26312c] outline-none focus:border-[#32634f] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                >

                  <option value="">

                    {loadingSims
                      ? "Cargando SIMs..."
                      : selectableSims.length === 0
                      ? "No hay SIMs disponibles"
                      : "Selecciona una SIM"}

                  </option>


                  {selectableSims.map(
                    (sim) => (

                      <option
                        key={sim.iccid}
                        value={sim.iccid}
                      >

                        {sim.iccid}
                        {sim.iccid === currentDeviceIccid
                          ? " · SIM actual"
                          : ""}

                      </option>

                    )
                  )}

                </select>


                {simsError && (

                  <p className="mt-2 text-sm text-red-600">
                    {simsError}
                  </p>

                )}


                {!loadingSims &&
                  !simsError &&
                  selectableSims.length === 0 && (

                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">

                      <p className="font-semibold text-amber-800">
                        No hay SIMs disponibles
                      </p>

                      <p className="mt-1 text-sm text-amber-700">
                        Puedes elegir “Añadir nueva SIM” e introducir su ICCID.
                      </p>

                    </div>

                )}

              </div>

            )}


            {simMode === "new" && (

              <div className="mt-4">

                <input
                  type="text"

                  value={newIccid}

                  onChange={(event) => {
                    const value =
                      event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 22);

                    setNewIccid(
                      value
                    );

                    setAssignError("");
                    setSuccessMessage("");
                  }}

                  disabled={assigning}

                  placeholder="Introduce el ICCID de la nueva SIM"

                  autoComplete="off"

                  className="w-full rounded-2xl border border-[#d9e1d8] bg-white px-4 py-4 text-[#26312c] outline-none focus:border-[#32634f] disabled:bg-gray-100"
                />


                <div className="mt-2 flex items-center justify-between gap-3">

                  <p className="text-xs text-gray-400">
                    Entre 18 y 22 dígitos.
                  </p>

                  <p className="text-xs text-gray-400">
                    {newIccid.length}/22
                  </p>

                </div>

              </div>

            )}

          </div>


          {/* =================================================
              COURSE
          ================================================= */}

          <div className="mt-7">

            <div>

              <h3 className="font-semibold text-[#202824]">
                Campo de golf *
              </h3>

              <p className="mt-1 text-xs text-gray-400">
                Selecciona el campo donde se instalará el tracker.
              </p>

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

              className="mt-3 w-full rounded-2xl border border-[#d9e1d8] bg-white px-4 py-4 text-[#26312c] outline-none focus:border-[#32634f] disabled:bg-gray-100"
            >

              <option value="">

                {loadingCourses
                  ? "Cargando campos..."
                  : "Selecciona un campo"}

              </option>


              {courses.map(
                (course) => (

                  <option
                    key={
                      course.course_id
                    }

                    value={
                      course.course_id
                    }
                  >

                    {course.name}

                  </option>

                )
              )}

            </select>


            {coursesError && (

              <p className="mt-2 text-sm text-red-600">
                {coursesError}
              </p>

            )}

          </div>


          {/* =================================================
              CART
          ================================================= */}

          <div className="mt-7">

            <div>

              <h3 className="font-semibold text-[#202824]">
                Carrito *
              </h3>

              <p className="mt-1 text-xs text-gray-400">
                Selecciona el carrito donde se instalará este MT700.
              </p>

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

              className="mt-3 w-full rounded-2xl border border-[#d9e1d8] bg-white px-4 py-4 text-[#26312c] outline-none focus:border-[#32634f] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            >

              <option value="">

                {!selectedCourse
                  ? "Selecciona primero un campo"

                  : loadingCarts
                  ? "Cargando carritos..."

                  : availableCarts.length === 0
                  ? "No hay carritos disponibles"

                  : "Selecciona un carrito"}

              </option>


              {availableCarts.map(
                (cart) => (

                  <option
                    key={
                      cart.cart_id
                    }

                    value={
                      cart.cart_id
                    }
                  >

                    {cart.cart_id}

                  </option>

                )
              )}

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
                    Todos los carritos de este campo tienen actualmente un tracker asignado.
                  </p>

                </div>

              )}

          </div>


          {/* =================================================
              INSTALLER
          ================================================= */}

          <div className="mt-7">

            <div>

              <h3 className="font-semibold text-[#202824]">
                Instalador *
              </h3>

              <p className="mt-1 text-xs text-gray-400">
                Persona que realiza la instalación.
              </p>

            </div>


            <input
              type="text"

              value={installerName}

              onChange={(event) => {
                setInstallerName(
                  event.target.value
                );

                setAssignError("");
                setSuccessMessage("");
              }}

              disabled={assigning}

              placeholder="Nombre del instalador"

              className="mt-3 w-full rounded-2xl border border-[#d9e1d8] bg-white px-4 py-4 text-[#26312c] outline-none focus:border-[#32634f] disabled:bg-gray-100"
            />

          </div>


          {/* =================================================
              ERROR
          ================================================= */}

          {assignError && (

            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5">

              <p className="font-semibold text-red-700">
                No se ha podido completar el alta
              </p>

              <p className="mt-1 text-sm text-red-600">
                {assignError}
              </p>

            </div>

          )}


          {/* =================================================
              SUCCESS
          ================================================= */}

          {successMessage && (

            <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-5">

              <div className="flex items-start gap-3">

                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 font-bold text-white">
                  ✓
                </div>

                <div>

                  <p className="font-bold text-green-800">
                    Alta completada
                  </p>

                  <p className="mt-1 text-sm leading-6 text-green-700">
                    {successMessage}
                  </p>

                </div>

              </div>

            </div>

          )}


          {/* =================================================
              BUTTON
          ================================================= */}

          <button
            onClick={
              handleAssign
            }

            disabled={
              assigning ||
              loadingDevice ||
              !!deviceError ||
              imei.length !== 15 ||
              !validIccid ||
              !selectedCourse ||
              !selectedCart ||
              !installerName.trim()
            }

            className="mt-8 w-full rounded-2xl bg-[#32634f] px-6 py-4 font-semibold text-white transition hover:bg-[#28513f] disabled:cursor-not-allowed disabled:bg-gray-400"
          >

            {assigning
              ? "Guardando..."
              : "Confirmar alta MT700"}

          </button>


        </section>

      </div>

    </main>
  );
}