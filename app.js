(function () {
  "use strict";

  const BASE_URL =
    "https://shurmad.b513.live/openmrs/ws/rest/v1";
  const EMRAPI_BASE =
    "https://shurmad.b513.live/openmrs/ws/rest/emrapi";

  const CONCEPTS = {
    TSH: "1003609d-a493-40f8-9a28-739e89e1f435",
    FREE_T4: "64e51875-3d4c-4b8d-ae38-10609c04f79b",
    DATE_OF_TEST: "48ffcc57-fd13-4398-aae6-07317c52d198",
    WEIGHT: "5089AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  };

  const LEVOTHYROXINE_ORDER_TYPE =
    "131168f4-15f5-102d-96e4-000c29c2a5d7"; //Drug order
  const LEVOTHYROXINE_CONCEPT =
    "5d8e199d-5705-44b1-840e-4ae88d5455ba"; //
  const TSH_ORDER_CONCEPT =
    "1003609d-a493-40f8-9a28-739e89e1f435";
  const FT4_ORDER_CONCEPT =
    "64e51875-3d4c-4b8d-ae38-10609c04f79b";
  const TEST_ORDER_TYPE =
    "52a447d3-a64a-11e3-9aeb-50e549534c5e";
  const OUTPATIENT_CARE_SETTING =
    "6f0c9a92-6f24-11e3-af88-005056821db0";

  // Diagnosis concept UUIDs
  const DIAGNOSIS_CONCEPTS = {
    PRIMARY: {
      uuid: "952bcc33-d38c-4e99-83f9-c643804bc1fa",
      name: "Hypothyroidism",
      shortName: null
    },
    SUBCLINICAL: {
      uuid: "df27dd07-06b9-4870-a7f0-962e47b1df78",
      name: "Subclinical Hypothyroidism",
      shortName: "Subclinical Hypo"
    }
  };

  // Drug UUIDs by dose
  const LEVO_DRUGS = {
    25:  "d58202d4-2219-489a-be30-18f32b8998d5",
    50:  "9bca6cb5-ffc8-4552-a2d5-ff28929741a5",
    75:  "8d2910f4-4811-4ea1-8b65-9c627ba9b985",
    88:  "2720163d-58b8-4d10-b700-b792c2bc940c",
    100: "e068566f-4f36-445c-9516-2d7cf5572ab5",
    112: "cfca7d01-c7ce-4fa4-9969-627c100f5607",
    125: "165edfc1-e90a-4642-9112-ac58c497abc9",
    137: "7ad278c7-aa35-46ba-8b82-84d48c300f92",
    150: "065278f6-ed8d-4450-8e55-29884c86c24e",
    175: "021800e0-d18a-4548-bf6d-11819c940789",
    200: "acad7878-13e6-4f6e-b702-f68aeb6f8881",
    300: "e386ebc4-7e26-4f5f-9a73-78094b491442"
  };

  const DOSE_UNITS_MCG = "162366AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; //mcg
  const ROUTE_ORAL = "160240AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; //oral route
  const FREQ_ONCE_DAILY = "160865OFAAAAAAAAAAAAAAA"; // ← REPLACE with UUID from GET /orderfrequency on shurmad server;

  let tshChartInstance = null;
  let ft4ChartInstance = null;
  let currentPatientUUID = null;
  let currentData = null;

  const RECALL_WEEKS = {
    SCHEDULE_RECALL_6_8WK: 6,
    SCHEDULE_RECALL_3_4WK: 3,
    SCHEDULE_RECALL_3MO: 12,
    SCHEDULE_RECALL_12MO: 52,
    SCHEDULE_RECALL_EARLY: 8
  };

  // Which rule results trigger diagnosis prompt
  const DIAGNOSIS_TRIGGER_STATUSES = [
    "Primary Hypothyroidism — Initiate Treatment",
    "Primary Hypothyroidism — Conservative Start",
    "Primary Hypothyroidism — Pregnant",
    "Subclinical Hypothyroidism — TSH >10",
    "Subclinical Hypothyroidism — Symptomatic",
    "Subclinical Hypothyroidism — Monitor",
    "Subclinical Hypothyroidism — Pregnant",
    "Not Primary Hypothyroidism"
  ];

  function show(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = "";
  }

  function hide(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }

  function showError(message) {
    hide("ha-loading");
    hide("ha-main");
    const errorPanel = document.getElementById("ha-error");
    const errorMsg = document.getElementById("ha-error-msg");
    if (errorMsg) errorMsg.textContent = message;
    if (errorPanel) errorPanel.style.display = "";
  }

  function getPatientUUID() {
    const params = new URLSearchParams(window.location.search);
    const direct = params.get("patientId");
    if (direct && direct.length > 10) return direct;
    if (document.referrer) {
      try {
        const referrerUrl = new URL(document.referrer);
        const fromReferrer = referrerUrl.searchParams.get("patientId");
        if (fromReferrer && fromReferrer.length > 10) return fromReferrer;
      } catch (_) {}
    }
    const fullUrl = decodeURIComponent(window.location.href);
    const uuidMatch = fullUrl.match(
      /patientId=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (uuidMatch) return uuidMatch[1];
    return null;
  }

  async function fetchFromOpenMRS(endpoint) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    if (response.status === 401)
      throw new Error("OpenMRS session expired. Please log in again.");
    if (!response.ok)
      throw new Error(`OpenMRS API error ${response.status}`);
    return response.json();
  }

  async function postToOpenMRS(endpoint, body) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenMRS POST error ${response.status}: ${text}`);
    }
    return response.json();
  }

  async function postToEmrapi(endpoint, body) {
    const response = await fetch(`${EMRAPI_BASE}${endpoint}`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`EmrAPI POST error ${response.status}: ${text}`);
    }
    return response.json();
  }

  async function verifySession() {
    const session = await fetchFromOpenMRS("/session");
    if (!session || !session.authenticated)
      throw new Error("Not authenticated. Please log in to OpenMRS first.");
    return session;
  }

  function obsValue(obs) {
    if (!obs) return null;
    if (typeof obs.value === "number") return obs.value;
    if (typeof obs.value === "object" && obs.value !== null)
      return obs.value.display || obs.value.name || obs.value.uuid || null;
    return obs.value ?? null;
  }

  function obsNumber(obs) {
    const value = obsValue(obs);
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function obsDate(obs) {
    return obs?.obsDatetime || obs?.dateCreated || obs?.dateChanged || null;
  }

  function encounterUuid(obs) {
    return obs?.encounter?.uuid || null;
  }

  function getDateOfTest(obs, dateObsList) {
    const encUuid = encounterUuid(obs);
    if (encUuid) {
      const matchedDate = dateObsList.find(
        dateObs => encounterUuid(dateObs) === encUuid
      );
      if (matchedDate) return obsValue(matchedDate);
    }
    return obsDate(obs);
  }

  function attachDateOfTest(obsList, dateObsList) {
    return (obsList || []).map(obs => ({
      raw: obs,
      value: obsValue(obs),
      number: obsNumber(obs),
      dateOfTest: getDateOfTest(obs, dateObsList)
    }));
  }

  // API returns oldest first — last-write-wins keeps newest
  function latestThree(list) {
    const map = {};
    (list || []).forEach(item => {
      if (item.number === null) return;
      const key = item.dateOfTest ||
        item.raw?.obsDatetime ||
        "unknown";
      map[key] = item; // always overwrite → last (newest) wins
    });
    return Object.values(map)
      .sort((a, b) =>
        new Date(b.dateOfTest || 0) -
        new Date(a.dateOfTest || 0)
      )
      .slice(0, 3);
  }

  function formatDate(dateValue) {
    if (!dateValue) return "No date";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "No date";
    return date.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric"
    });
  }

  function addWeeks(date, weeks) {
    const result = new Date(date);
    result.setDate(result.getDate() + weeks * 7);
    return result;
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function toDateInputValue(date) {
    return date.toISOString().split("T")[0];
  }

  function roundToNearest25(dose) {
    return Math.round(dose / 25) * 25;
  }

  function calculateLevoDose(weightKg) {
    if (!weightKg) return null;
    const low = roundToNearest25(1.5 * weightKg);
    const high = roundToNearest25(1.8 * weightKg);
    const mid = roundToNearest25((1.5 + 1.8) / 2 * weightKg);
    const validDoses = [25, 50, 75, 88, 100, 112, 125, 137, 150, 175, 200, 300];
    const recommended = validDoses.reduce((prev, curr) =>
      Math.abs(curr - mid) < Math.abs(prev - mid) ? curr : prev
    );
    return { low, high, recommended };
  }

  // Determine if rule result should trigger diagnosis prompt
  // Thyroid diagnosis concept UUIDs
  const THYROID_DIAGNOSIS_UUIDS = [
    "952bcc33-d38c-4e99-83f9-c643804bc1fa", // Primary Hypothyroidism
    "df27dd07-06b9-4870-a7f0-962e47b1df78"  // Subclinical Hypothyroidism
  ];

  // Only prompt if patient has no existing thyroid diagnosis
  function shouldPromptDiagnosis(result, activeConditions) {
    const alreadyDiagnosed = (activeConditions || []).some(c =>
      THYROID_DIAGNOSIS_UUIDS.includes(c.concept?.uuid)
    );
    if (alreadyDiagnosed) return false;
    return DIAGNOSIS_TRIGGER_STATUSES.some(s =>
      result.status.includes(s.split(" — ")[0])
    );
  }

  // Determine suggested diagnosis from result status
  function getSuggestedDiagnosis(result) {
    const status = result.status;
    if (status.includes("Primary Hypothyroidism"))
      return "PRIMARY";
    if (status.includes("Subclinical Hypothyroidism"))
      return "SUBCLINICAL";
    if (status.includes("Not Primary Hypothyroidism"))
      return "NOT_PRIMARY";
    return null;
  }

  async function fetchObs(patientUUID, conceptUUID, limit) {
    const data = await fetchFromOpenMRS(
      `/obs?patient=${patientUUID}&concept=${conceptUUID}&limit=${limit || 50}&v=full`
    );
    return data?.results || [];
  }

  async function fetchLatestWeight(patientUUID) {
    try {
      const data = await fetchFromOpenMRS(
        `/obs?patient=${patientUUID}&concept=${CONCEPTS.WEIGHT}&limit=1&v=default`
      );
      const results = data?.results || [];
      if (results.length > 0) return obsNumber(results[0]);
      return null;
    } catch (e) {
      console.warn("[HypothyroidAssist] Could not fetch weight:", e);
      return null;
    }
  }

  async function fetchPatientDemographics(patientUUID) {
    const data = await fetchFromOpenMRS(`/patient/${patientUUID}?v=full`);
    const person = data?.person || {};
    return {
      display: data?.display || "Patient",
      identifier: data?.identifiers?.[0]?.identifier || patientUUID,
      gender: person.gender || "",
      birthdate: person.birthdate || null,
      age: calculateAge(person.birthdate) ?? person.age ?? null
    };
  }

  function calculateAge(birthdate) {
    if (!birthdate) return null;
    const birth = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate()))
      age--;
    return age;
  }

  async function fetchActiveConditions(patientUUID) {
    const response = await fetch(
      `${BASE_URL.replace("/ws/rest/v1", "/ws/rest/emrapi")}/conditionhistory?patientUuid=${patientUUID}`,
      {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" }
      }
    );
    if (!response.ok)
      throw new Error(`Condition history API error ${response.status}`);
    const data = await response.json();
    const activeConditions = [];
    (data || []).forEach(group => {
      (group.conditions || []).forEach(condition => {
        if (condition.status === "ACTIVE" && !condition.voided)
          activeConditions.push(condition);
      });
    });
    return activeConditions;
  }

  async function fetchActiveDrugOrders(patientUUID) {
    try {
      // Fetch ALL orders then filter to active drug orders only
      const data = await fetchFromOpenMRS(
        `/order?patient=${patientUUID}&v=default`
      );
      const orders = data?.results || [];
      const now = new Date();
      return orders.filter(order =>
        order.type === "drugorder" &&
        !order.dateStopped &&
        !order.voided &&
        (!order.autoExpireDate || new Date(order.autoExpireDate) > now)
      );
    } catch (e) {
      console.warn("[HypothyroidAssist] Could not fetch drug orders:", e);
      return [];
    }
  }

  // Check specifically if patient is on levothyroxine
  function isOnLevothyroxine(drugOrders) {
    return (drugOrders || []).some(order =>
      order.concept?.uuid === LEVOTHYROXINE_CONCEPT ||
      order.drug?.concept?.uuid === LEVOTHYROXINE_CONCEPT
    );
  }

  async function saveCondition(patientUUID, conceptInfo) {
    return postToEmrapi("/condition", [
      {
        patientUuid: patientUUID,
        concept: {
          uuid: conceptInfo.uuid,
          name: conceptInfo.name,
          shortName: conceptInfo.shortName || null
        },
        conditionNonCoded: "",
        status: "ACTIVE",
        onSetDate: Date.now(),
        endDate: null,
        endReason: null,
        additionalDetail: null,
        voided: false,
        voidReason: null
      }
    ]);
  }

  async function getOrCreateEncounter(patientUUID, session) {
    const encounter = await postToOpenMRS("/encounter", {
      patient: patientUUID,
      encounterType: "62660d1c-091e-4753-9a08-a6d41712ae51",
      encounterDatetime: new Date().toISOString(),
      location: session?.sessionLocation?.uuid || null
    });
    return encounter.uuid;
  }

  async function placeTestOrder(patientUUID, conceptUUID, session, scheduledDate) {
    const encounterUUID = await getOrCreateEncounter(patientUUID, session);
    const providerUUID = session?.currentProvider?.uuid;
    const orderBody = {
      type: "testorder",
      patient: patientUUID,
      concept: conceptUUID,
      careSetting: OUTPATIENT_CARE_SETTING,
      orderer: providerUUID,
      encounter: encounterUUID,
      action: "NEW",
      urgency: scheduledDate ? "ON_SCHEDULED_DATE" : "ROUTINE",
      orderType: TEST_ORDER_TYPE
    };
    if (scheduledDate) orderBody.scheduledDate = scheduledDate;
    return postToOpenMRS("/order", orderBody);
  }

  async function placeDrugOrder(patientUUID, drugUUID, doseValue, session, previousOrderUUID, previousDrugUUID) {
    const encounterUUID = await getOrCreateEncounter(patientUUID, session);
    const providerUUID = session?.currentProvider?.uuid;

    // If previousOrderUUID provided — discontinue old order first
    if (previousOrderUUID && previousDrugUUID) {
      await postToOpenMRS("/order", {
        type: "drugorder",
        action: "DISCONTINUE",
        previousOrder: previousOrderUUID,
        patient: patientUUID,
        drug: previousDrugUUID,
        concept: LEVOTHYROXINE_CONCEPT,
        careSetting: OUTPATIENT_CARE_SETTING,
        orderer: providerUUID,
        encounter: encounterUUID,
        urgency: "ROUTINE",
        orderType: LEVOTHYROXINE_ORDER_TYPE
      });
    }

    // Place new order
    return postToOpenMRS("/order", {
      type: "drugorder",
      patient: patientUUID,
      drug: drugUUID,
      concept: LEVOTHYROXINE_CONCEPT,
      dose: doseValue,
      doseUnits: "1513AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", // Tablet
      route: ROUTE_ORAL,
      frequency: FREQ_ONCE_DAILY,
      careSetting: OUTPATIENT_CARE_SETTING,
      orderer: providerUUID,
      encounter: encounterUUID,
      action: "NEW",
      urgency: "ROUTINE",
      dosingType: "org.openmrs.SimpleDosingInstructions",
      orderType: LEVOTHYROXINE_ORDER_TYPE,
      quantity: 30.0,
      quantityUnits: "162396AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", // Box
      duration: 90,
      durationUnits: "1072AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", // Days
      numRefills: 0
    });
  }

  function renderActiveConditions(conditions) {
    const el = document.getElementById("ha-active-conditions");
    if (!el) return;
    if (!conditions || conditions.length === 0) {
      el.innerHTML = `<div class="ha-empty-state">Patient has no recorded active condition.</div>`;
      return;
    }
    el.innerHTML = `
      <ul class="ha-condition-items">
        ${conditions.map(condition => {
          const name =
            condition?.concept?.shortName ||
            condition?.concept?.name ||
            condition?.conditionNonCoded ||
            "Unnamed condition";
          return `<li><span class="ha-condition-name">${name}</span></li>`;
        }).join("")}
      </ul>`;
  }

  function renderActiveMedications(drugOrders) {
    const el = document.getElementById("ha-active-medications");
    if (!el) return;
    const active = (drugOrders || []).filter(o =>
      o.type === "drugorder" && !o.dateStopped && !o.voided
    );
    if (!active.length) {
      el.innerHTML = `<div class="ha-empty-state">No active medications on record.</div>`;
      return;
    }
    el.innerHTML = `
      <ul class="ha-condition-items">
        ${active.map(order => {
          const name = order.drug?.display || order.concept?.display || "Unknown drug";
          const dose = order.dose ? `${order.dose} ${order.doseUnits?.display || ""}` : "";
          const freq = order.frequency?.display || "";
          const isLevo = order.concept?.uuid === LEVOTHYROXINE_CONCEPT ||
            order.drug?.concept?.uuid === LEVOTHYROXINE_CONCEPT;
          return `<li>
            <span class="ha-condition-name">
              ${isLevo ? "⚕️ " : ""}${name}
              ${dose ? `<small style="color:#666;font-weight:normal"> — ${dose} ${freq}</small>` : ""}
            </span>
          </li>`;
        }).join("")}
      </ul>`;
  }

  function renderAdditionalQuestions(data) {
    const el = document.getElementById("ha-additional-questions");
    if (!el) return;
    const isFemale = data.gender === "F";
    el.innerHTML = `
      <div class="ha-question-block">
        <label class="ha-question-label">
          Does the patient have symptoms of hypothyroidism?
          (fatigue, weight gain, cold intolerance, constipation, dry skin)
        </label>
        <div class="ha-radio-group">
          <label><input type="radio" name="ha-symptoms" value="yes"> Yes</label>
          <label><input type="radio" name="ha-symptoms" value="no"> No</label>
        </div>
      </div>

      ${isFemale ? `
        <div class="ha-question-block">
          <label class="ha-question-label">Is the patient currently pregnant?</label>
          <div class="ha-radio-group">
            <label><input type="radio" name="ha-pregnant" value="yes"> Yes</label>
            <label><input type="radio" name="ha-pregnant" value="no"> No</label>
          </div>
        </div>
        <div id="ha-trimester-question" class="ha-question-block" style="display:none;">
          <label class="ha-question-label">Which trimester is the patient in?</label>
          <select id="ha-trimester" class="ha-select">
            <option value="">Select trimester</option>
            <option value="1">Trimester 1</option>
            <option value="2">Trimester 2</option>
            <option value="3">Trimester 3</option>
          </select>
        </div>
      ` : ""}

      <div class="ha-question-block">
        <label class="ha-question-label">Does the patient have any cardiac conditions?</label>
        <div class="ha-radio-group">
          <label><input type="radio" name="ha-cardiac-condition" value="yes"> Yes</label>
          <label><input type="radio" name="ha-cardiac-condition" value="no"> No</label>
        </div>
      </div>

      <div class="ha-question-block">
        <label class="ha-question-label">
          Does the patient have symptoms suggestive of myxedema coma?
          (hypothermia, stupor, mental confusion)
        </label>
        <div class="ha-radio-group">
          <label><input type="radio" name="ha-myxedema" value="yes"> Yes</label>
          <label><input type="radio" name="ha-myxedema" value="no"> No</label>
        </div>
      </div>
    `;

    const pregnancyRadios = document.querySelectorAll('input[name="ha-pregnant"]');
    const trimesterQuestion = document.getElementById("ha-trimester-question");
    pregnancyRadios.forEach(radio => {
      radio.addEventListener("change", function () {
        if (!trimesterQuestion) return;
        trimesterQuestion.style.display =
          radio.value === "yes" && radio.checked ? "" : "none";
      });
    });
  }

  function getAdditionalQuestionAnswers() {
    return {
      pregnant: document.querySelector('input[name="ha-pregnant"]:checked')?.value || null,
      trimester: document.getElementById("ha-trimester")?.value || null,
      cardiacCondition: document.querySelector('input[name="ha-cardiac-condition"]:checked')?.value || null,
      symptoms: document.querySelector('input[name="ha-symptoms"]:checked')?.value || null,
      myxedema: document.querySelector('input[name="ha-myxedema"]:checked')?.value || null
    };
  }

  function getRecallWeeks(actions) {
    for (const action of actions) {
      if (RECALL_WEEKS[action]) return RECALL_WEEKS[action];
    }
    return 6;
  }

  // ── DIAGNOSIS PROMPT ─────────────────────────
  function renderDiagnosisPrompt(result, patientUUID, session, data, onProceed) {
    const widget = document.getElementById("ha-recommendation-widget");
    const content = document.getElementById("ha-final-recommendation");
    if (!widget || !content) return;

    const suggestedType = getSuggestedDiagnosis(result);

    // Build diagnosis options based on suggestion
    const diagnosisOptions = [
      {
        value: "PRIMARY",
        label: "Primary Hypothyroidism",
        hint: "TSH elevated, FT4 low — overt hypothyroidism",
        selected: suggestedType === "PRIMARY"
      },
      {
        value: "SUBCLINICAL",
        label: "Subclinical Hypothyroidism",
        hint: "TSH elevated, FT4 normal — mild thyroid dysfunction",
        selected: suggestedType === "SUBCLINICAL"
      },
      {
        value: "NOT_PRIMARY",
        label: "Not Primary Hypothyroidism",
        hint: "Atypical pattern — further evaluation needed",
        selected: suggestedType === "NOT_PRIMARY"
      },
      {
        value: "DEFER",
        label: "Defer — Do not record diagnosis now",
        hint: "Skip and proceed to recommendation",
        selected: false
      }
    ];

    content.innerHTML = `
      <div class="ha-diagnosis-prompt">
        <div class="ha-diagnosis-prompt-title">
          📋 Record Diagnosis
        </div>
        <div class="ha-diagnosis-prompt-desc">
          Lab values suggest <strong>${result.status}</strong>.
          Please confirm the diagnosis to record in the patient record.
        </div>
        <div class="ha-diagnosis-options">
          ${diagnosisOptions.map(opt => `
            <label class="ha-diagnosis-option ${opt.selected ? "ha-diagnosis-option-selected" : ""}">
              <input type="radio"
                     name="ha-diagnosis-choice"
                     value="${opt.value}"
                     ${opt.selected ? "checked" : ""}/>
              <div class="ha-diagnosis-option-content">
                <span class="ha-diagnosis-option-label">${opt.label}</span>
                <span class="ha-diagnosis-option-hint">${opt.hint}</span>
              </div>
            </label>
          `).join("")}
        </div>
        <div class="ha-diagnosis-actions">
          <button class="ha-action-btn ha-btn-primary" id="ha-btn-confirm-diagnosis">
            Confirm &amp; Proceed to Recommendation
          </button>
          <span class="ha-action-status" id="ha-status-diagnosis"></span>
        </div>
      </div>
    `;

    widget.style.display = "";

    // Handle diagnosis radio selection styling
    const radioInputs = document.querySelectorAll('input[name="ha-diagnosis-choice"]');
    radioInputs.forEach(radio => {
      radio.addEventListener("change", function () {
        document.querySelectorAll(".ha-diagnosis-option").forEach(el => {
          el.classList.remove("ha-diagnosis-option-selected");
        });
        this.closest(".ha-diagnosis-option").classList.add("ha-diagnosis-option-selected");
      });
    });

    // Handle confirm button
    const btnConfirm = document.getElementById("ha-btn-confirm-diagnosis");
    if (btnConfirm) {
      btnConfirm.addEventListener("click", async function () {
        const selected = document.querySelector('input[name="ha-diagnosis-choice"]:checked')?.value;
        const statusEl = document.getElementById("ha-status-diagnosis");

        if (!selected) {
          if (statusEl) statusEl.textContent = "Please select a diagnosis option.";
          return;
        }

        btnConfirm.disabled = true;
        btnConfirm.textContent = "Saving...";

        try {
          if (selected !== "DEFER") {
            const conceptInfo = selected === "PRIMARY"
              ? DIAGNOSIS_CONCEPTS.PRIMARY
              : selected === "SUBCLINICAL"
                ? DIAGNOSIS_CONCEPTS.SUBCLINICAL
                : null;

            if (conceptInfo) {
              await saveCondition(patientUUID, conceptInfo);
              if (statusEl)
                statusEl.textContent = `✓ ${conceptInfo.name} recorded as active condition.`;
            } else {
              if (statusEl)
                statusEl.textContent = "✓ Diagnosis deferred — not recorded.";
            }
          } else {
            if (statusEl)
              statusEl.textContent = "✓ Proceeding without recording diagnosis.";
          }

          // Short delay then show recommendation
          setTimeout(() => {
            onProceed();
          }, 800);

        } catch (e) {
          btnConfirm.disabled = false;
          btnConfirm.textContent = "Confirm & Proceed to Recommendation";
          if (statusEl) statusEl.textContent = "Failed to save: " + e.message;
          console.error("[HypothyroidAssist] Condition save failed:", e);
        }
      });
    }
  }

  // ── ACTION BUTTONS ───────────────────────────
  function renderActionButtons(result, patientUUID, session, weightKg, pregnant, activeDrugOrders) {
    const actionsEl = document.getElementById("ha-actions");
    if (!actionsEl) return;

    const actions = result.actions || [];
    if (actions.length === 0) {
      actionsEl.innerHTML = "";
      return;
    }

    const defaultWeeks = getRecallWeeks(actions);
    const defaultRecallDate = addWeeks(new Date(), defaultWeeks);
    const defaultLabDate = addDays(defaultRecallDate, -1);

    const needsOrderTSH = actions.includes("ORDER_TSH");
    const needsOrderFT4 = actions.includes("ORDER_FT4");
    const needsRecall = actions.some(a => a.startsWith("SCHEDULE_RECALL"));
    const needsTreatment = actions.includes("START_TREATMENT") ||
      actions.includes("CONSIDER_TREATMENT");
    const needsAdjustDose = actions.includes("ADJUST_DOSE");
    const needsReferral = actions.includes("REFER_ENDOCRINOLOGY") ||
      actions.includes("REFER_ENDOCRINOLOGY_URGENT");

    const doseInfo = (needsTreatment && weightKg)
      ? calculateLevoDose(weightKg) : null;

    // Calculate adjusted dose from current levothyroxine order
    const isIncrease = result.status.toLowerCase().includes("elevat") ||
      result.status.toLowerCase().includes("suppressed — dose reduction") === false &&
      result.status.toLowerCase().includes("suppressed") === false;
    const isDoseReduction = result.message.toLowerCase().includes("decrease dose") ||
      result.message.toLowerCase().includes("reduction");
    const adjustDirection = isDoseReduction ? "decrease" : "increase";
    const adjustNote = isDoseReduction
      ? "Recommendation: Decrease dose by 25 mcg"
      : "Recommendation: Increase dose by 25 mcg";

    // Get current levo dose from active drug orders
    const currentLevoOrder = (activeDrugOrders || []).find(o =>
      o.concept?.uuid === LEVOTHYROXINE_CONCEPT ||
      o.drug?.concept?.uuid === LEVOTHYROXINE_CONCEPT
    );
    const currentDose = currentLevoOrder?.dose || null;
    const validDoses = [25, 50, 75, 88, 100, 112, 125, 137, 150, 175, 200, 300];
    let adjustedDose = currentDose
      ? (isDoseReduction
          ? Math.max(25, currentDose - 25)
          : Math.min(300, currentDose + 25))
      : 50;
    // Round to nearest valid dose
    adjustedDose = validDoses.reduce((prev, curr) =>
      Math.abs(curr - adjustedDose) < Math.abs(prev - adjustedDose) ? curr : prev
    );
    // Find drug UUID for adjusted dose
    const adjustedDrugUUID = LEVO_DRUGS[adjustedDose] || LEVO_DRUGS[50];

    // For pregnant patients recall needs both TSH and FT4
    const recallLabLabel = pregnant
      ? "🧪 Schedule TSH + FT4 Lab (Day Before Recall)"
      : "🧪 Schedule TSH Lab (Day Before Recall)";

    actionsEl.innerHTML = `
      <div class="ha-actions-panel">
        <div class="ha-actions-title">Recommended Actions</div>

        ${needsOrderTSH ? `
          <div class="ha-action-row ha-recall-row">
            <div class="ha-recall-label">📋 Order TSH Test</div>
            <div class="ha-recall-controls">
              <label class="ha-recall-weeks-label">
                <input type="radio" name="ha-tsh-urgency" value="routine" checked/>
                Order now (Routine)
              </label>
              <label class="ha-recall-weeks-label">
                <input type="radio" name="ha-tsh-urgency" value="scheduled"/>
                Schedule for date:
              </label>
              <input type="date" id="ha-tsh-scheduled-date"
                     class="ha-recall-date-input"
                     value="${toDateInputValue(new Date())}"
                     style="display:none;"/>
            </div>
            <button class="ha-action-btn ha-btn-primary" id="ha-btn-order-tsh">
              Place TSH Order
            </button>
            <span class="ha-action-status" id="ha-status-tsh"></span>
          </div>
        ` : ""}

        ${needsOrderFT4 ? `
          <div class="ha-action-row ha-recall-row">
            <div class="ha-recall-label">📋 Order Free T4 Test</div>
            <div class="ha-recall-controls">
              <label class="ha-recall-weeks-label">
                <input type="radio" name="ha-ft4-urgency" value="routine" checked/>
                Order now (Routine)
              </label>
              <label class="ha-recall-weeks-label">
                <input type="radio" name="ha-ft4-urgency" value="scheduled"/>
                Schedule for date:
              </label>
              <input type="date" id="ha-ft4-scheduled-date"
                     class="ha-recall-date-input"
                     value="${toDateInputValue(new Date())}"
                     style="display:none;"/>
            </div>
            <button class="ha-action-btn ha-btn-primary" id="ha-btn-order-ft4">
              Place FT4 Order
            </button>
            <span class="ha-action-status" id="ha-status-ft4"></span>
          </div>
        ` : ""}

        ${needsTreatment ? `
          <div class="ha-action-row ha-drug-order-row">
            <div class="ha-drug-order-label">
              💊 Levothyroxine Order
              ${doseInfo ? `
                <span class="ha-dose-hint">
                  Recommended: ${doseInfo.low}–${doseInfo.high} mcg/day
                  (based on weight ${weightKg} kg)
                </span>
              ` : `<span class="ha-dose-hint">Weight not recorded — enter dose manually</span>`}
            </div>
            <div class="ha-drug-order-controls">
              <label class="ha-drug-label">
                Select formulation:
                <select id="ha-levo-drug" class="ha-select">
                  <option value="d58202d4-2219-489a-be30-18f32b8998d5" ${doseInfo?.recommended === 25 ? "selected" : ""}>Levothyroxine 25 mcg</option>
                  <option value="9bca6cb5-ffc8-4552-a2d5-ff28929741a5" ${doseInfo?.recommended === 50 ? "selected" : ""}>Levothyroxine 50 mcg</option>
                  <option value="8d2910f4-4811-4ea1-8b65-9c627ba9b985" ${doseInfo?.recommended === 75 ? "selected" : ""}>Levothyroxine 75 mcg</option>
                  <option value="2720163d-58b8-4d10-b700-b792c2bc940c" ${doseInfo?.recommended === 88 ? "selected" : ""}>Levothyroxine 88 mcg</option>
                  <option value="e068566f-4f36-445c-9516-2d7cf5572ab5" ${doseInfo?.recommended === 100 ? "selected" : ""}>Levothyroxine 100 mcg</option>
                  <option value="cfca7d01-c7ce-4fa4-9969-627c100f5607" ${doseInfo?.recommended === 112 ? "selected" : ""}>Levothyroxine 112 mcg</option>
                  <option value="165edfc1-e90a-4642-9112-ac58c497abc9" ${doseInfo?.recommended === 125 ? "selected" : ""}>Levothyroxine 125 mcg</option>
                  <option value="7ad278c7-aa35-46ba-8b82-84d48c300f92" ${doseInfo?.recommended === 137 ? "selected" : ""}>Levothyroxine 137 mcg</option>
                  <option value="065278f6-ed8d-4450-8e55-29884c86c24e" ${doseInfo?.recommended === 150 ? "selected" : ""}>Levothyroxine 150 mcg</option>
                  <option value="021800e0-d18a-4548-bf6d-11819c940789" ${doseInfo?.recommended === 175 ? "selected" : ""}>Levothyroxine 175 mcg</option>
                  <option value="acad7878-13e6-4f6e-b702-f68aeb6f8881" ${doseInfo?.recommended === 200 ? "selected" : ""}>Levothyroxine 200 mcg</option>
                  <option value="e386ebc4-7e26-4f5f-9a73-78094b491442" ${doseInfo?.recommended === 300 ? "selected" : ""}>Levothyroxine 300 mcg</option>
                </select>
              </label>
              <label class="ha-drug-label">
                Dose (mcg):
                <input type="number" id="ha-levo-dose"
                       class="ha-recall-weeks-input"
                       min="12.5" max="200" step="12.5"
                       value="${doseInfo?.recommended || 50}"/>
              </label>
            </div>
            <button class="ha-action-btn ha-btn-primary" id="ha-btn-order-levo">
              Place Levothyroxine Order
            </button>
            <span class="ha-action-status" id="ha-status-levo"></span>
          </div>
        ` : ""}

        ${needsAdjustDose ? `
          <div class="ha-action-row ha-drug-order-row">
            <div class="ha-drug-order-label">
              💊 Adjust Levothyroxine Dose
              <span class="ha-dose-hint">
                ${adjustNote}
                ${currentDose
                  ? ` (current: ${currentDose} mcg → recommended: ${adjustedDose} mcg)`
                  : " — no current dose on record, enter manually"}
              </span>
            </div>
            <div class="ha-drug-order-controls">
              <label class="ha-drug-label">
                Select formulation:
                <select id="ha-adjust-drug" class="ha-select">
                  <option value="d58202d4-2219-489a-be30-18f32b8998d5" ${adjustedDose === 25 ? "selected" : ""}>Levothyroxine 25 mcg</option>
                  <option value="9bca6cb5-ffc8-4552-a2d5-ff28929741a5" ${adjustedDose === 50 ? "selected" : ""}>Levothyroxine 50 mcg</option>
                  <option value="8d2910f4-4811-4ea1-8b65-9c627ba9b985" ${adjustedDose === 75 ? "selected" : ""}>Levothyroxine 75 mcg</option>
                  <option value="2720163d-58b8-4d10-b700-b792c2bc940c" ${adjustedDose === 88 ? "selected" : ""}>Levothyroxine 88 mcg</option>
                  <option value="e068566f-4f36-445c-9516-2d7cf5572ab5" ${adjustedDose === 100 ? "selected" : ""}>Levothyroxine 100 mcg</option>
                  <option value="cfca7d01-c7ce-4fa4-9969-627c100f5607" ${adjustedDose === 112 ? "selected" : ""}>Levothyroxine 112 mcg</option>
                  <option value="165edfc1-e90a-4642-9112-ac58c497abc9" ${adjustedDose === 125 ? "selected" : ""}>Levothyroxine 125 mcg</option>
                  <option value="7ad278c7-aa35-46ba-8b82-84d48c300f92" ${adjustedDose === 137 ? "selected" : ""}>Levothyroxine 137 mcg</option>
                  <option value="065278f6-ed8d-4450-8e55-29884c86c24e" ${adjustedDose === 150 ? "selected" : ""}>Levothyroxine 150 mcg</option>
                  <option value="021800e0-d18a-4548-bf6d-11819c940789" ${adjustedDose === 175 ? "selected" : ""}>Levothyroxine 175 mcg</option>
                  <option value="acad7878-13e6-4f6e-b702-f68aeb6f8881" ${adjustedDose === 200 ? "selected" : ""}>Levothyroxine 200 mcg</option>
                  <option value="e386ebc4-7e26-4f5f-9a73-78094b491442" ${adjustedDose === 300 ? "selected" : ""}>Levothyroxine 300 mcg</option>
                </select>
              </label>
              <label class="ha-drug-label">
                Dose (mcg):
                <input type="number" id="ha-adjust-dose"
                       class="ha-recall-weeks-input"
                       min="12.5" max="200" step="12.5"
                       value="${adjustedDose}"/>
              </label>
            </div>
            <button class="ha-action-btn ha-btn-primary" id="ha-btn-adjust-levo">
              Place Adjusted Dose Order
            </button>
            <span class="ha-action-status" id="ha-status-adjust-levo"></span>
          </div>
        ` : ""}

        ${needsReferral ? `
          <div class="ha-action-row ha-referral-note">
            🏥 <strong>Refer to Endocrinologist</strong>
            — Please arrange referral before next visit.
          </div>
        ` : ""}

        ${needsRecall ? `
          <div class="ha-action-row ha-recall-row">
            <div class="ha-recall-label">📅 Schedule Recall Visit</div>
            <div class="ha-recall-controls">
              <label class="ha-recall-weeks-label">
                Weeks from today:
                <input type="number" id="ha-recall-weeks"
                       class="ha-recall-weeks-input"
                       min="1" max="52" value="${defaultWeeks}"/>
              </label>
              <label class="ha-recall-date-label">
                Recall Date:
                <input type="date" id="ha-recall-date"
                       class="ha-recall-date-input"
                       value="${toDateInputValue(defaultRecallDate)}"/>
              </label>
            </div>
            <button class="ha-action-btn ha-btn-primary" id="ha-btn-schedule-recall">
              Confirm Recall Date
            </button>
            <span class="ha-action-status" id="ha-status-recall"></span>
          </div>

          <div class="ha-action-row ha-lab-recall-row" id="ha-lab-before-recall" style="display:none;">
            <div class="ha-recall-label">${recallLabLabel}</div>
            <div class="ha-recall-controls">
              <label class="ha-recall-date-label">
                Lab Date:
                <input type="date" id="ha-lab-date"
                       class="ha-recall-date-input"
                       value="${toDateInputValue(defaultLabDate)}"/>
              </label>
            </div>
            <button class="ha-action-btn ha-btn-primary" id="ha-btn-order-recall-tsh">
              Place Lab Order(s) for Lab Date
            </button>
            <span class="ha-action-status" id="ha-status-recall-tsh"></span>
          </div>
        ` : ""}
      </div>
    `;

    // TSH order
    const btnTSH = document.getElementById("ha-btn-order-tsh");
    if (btnTSH) {
      document.querySelectorAll('input[name="ha-tsh-urgency"]').forEach(radio => {
        radio.addEventListener("change", function () {
          const datePicker = document.getElementById("ha-tsh-scheduled-date");
          if (datePicker)
            datePicker.style.display = this.value === "scheduled" ? "" : "none";
        });
      });

      btnTSH.addEventListener("click", async function () {
        const urgency = document.querySelector('input[name="ha-tsh-urgency"]:checked')?.value;
        const scheduledDate = urgency === "scheduled"
          ? new Date(document.getElementById("ha-tsh-scheduled-date")?.value).toISOString()
          : null;
        const statusEl = document.getElementById("ha-status-tsh");
        btnTSH.disabled = true;
        btnTSH.textContent = "Placing order...";
        try {
          await placeTestOrder(patientUUID, TSH_ORDER_CONCEPT, session, scheduledDate);
          btnTSH.textContent = "✓ TSH Ordered";
          btnTSH.className = "ha-action-btn ha-btn-success";
          if (statusEl) statusEl.textContent = urgency === "scheduled"
            ? `TSH order scheduled for ${new Date(scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
            : "TSH test order placed successfully.";
        } catch (e) {
          btnTSH.disabled = false;
          btnTSH.textContent = "Place TSH Order";
          if (statusEl) statusEl.textContent = "Failed: " + e.message;
        }
      });
    }

    // FT4 order
    const btnFT4 = document.getElementById("ha-btn-order-ft4");
    if (btnFT4) {
      document.querySelectorAll('input[name="ha-ft4-urgency"]').forEach(radio => {
        radio.addEventListener("change", function () {
          const datePicker = document.getElementById("ha-ft4-scheduled-date");
          if (datePicker)
            datePicker.style.display = this.value === "scheduled" ? "" : "none";
        });
      });

      btnFT4.addEventListener("click", async function () {
        const urgency = document.querySelector('input[name="ha-ft4-urgency"]:checked')?.value;
        const scheduledDate = urgency === "scheduled"
          ? new Date(document.getElementById("ha-ft4-scheduled-date")?.value).toISOString()
          : null;
        const statusEl = document.getElementById("ha-status-ft4");
        btnFT4.disabled = true;
        btnFT4.textContent = "Placing order...";
        try {
          await placeTestOrder(patientUUID, FT4_ORDER_CONCEPT, session, scheduledDate);
          btnFT4.textContent = "✓ FT4 Ordered";
          btnFT4.className = "ha-action-btn ha-btn-success";
          if (statusEl) statusEl.textContent = urgency === "scheduled"
            ? `FT4 order scheduled for ${new Date(scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
            : "Free T4 test order placed successfully.";
        } catch (e) {
          btnFT4.disabled = false;
          btnFT4.textContent = "Place FT4 Order";
          if (statusEl) statusEl.textContent = "Failed: " + e.message;
        }
      });
    }

    // Levothyroxine order
    const btnLevo = document.getElementById("ha-btn-order-levo");
    if (btnLevo) {
      btnLevo.addEventListener("click", async function () {
        const drugUUID = document.getElementById("ha-levo-drug")?.value;
        const doseValue = parseFloat(document.getElementById("ha-levo-dose")?.value);
        const statusEl = document.getElementById("ha-status-levo");
        if (!drugUUID || !doseValue) {
          if (statusEl) statusEl.textContent = "Please select formulation and dose.";
          return;
        }
        btnLevo.disabled = true;
        btnLevo.textContent = "Placing order...";
        try {
          await placeDrugOrder(patientUUID, drugUUID, doseValue, session);
          btnLevo.textContent = "✓ Levothyroxine Ordered";
          btnLevo.className = "ha-action-btn ha-btn-success";
          if (statusEl) statusEl.textContent =
            `Levothyroxine ${doseValue} mcg once daily ordered successfully.`;
        } catch (e) {
          btnLevo.disabled = false;
          btnLevo.textContent = "Place Levothyroxine Order";
          if (statusEl) statusEl.textContent = "Failed: " + e.message;
        }
      });

      // Sync drug dropdown with dose input
      const drugSelect = document.getElementById("ha-levo-drug");
      const doseInput = document.getElementById("ha-levo-dose");
      if (drugSelect && doseInput) {
        drugSelect.addEventListener("change", function () {
          const strengthMap = {
            "d58202d4-2219-489a-be30-18f32b8998d5": 25,
            "9bca6cb5-ffc8-4552-a2d5-ff28929741a5": 50,
            "8d2910f4-4811-4ea1-8b65-9c627ba9b985": 75,
            "2720163d-58b8-4d10-b700-b792c2bc940c": 88,
            "e068566f-4f36-445c-9516-2d7cf5572ab5": 100,
            "cfca7d01-c7ce-4fa4-9969-627c100f5607": 112,
            "165edfc1-e90a-4642-9112-ac58c497abc9": 125,
            "7ad278c7-aa35-46ba-8b82-84d48c300f92": 137,
            "065278f6-ed8d-4450-8e55-29884c86c24e": 150,
            "021800e0-d18a-4548-bf6d-11819c940789": 175,
            "acad7878-13e6-4f6e-b702-f68aeb6f8881": 200,
            "e386ebc4-7e26-4f5f-9a73-78094b491442": 300
          };
          doseInput.value = strengthMap[this.value] || 50;
        });
      }
    }

    // Adjust dose order
    const btnAdjustLevo = document.getElementById("ha-btn-adjust-levo");
    if (btnAdjustLevo) {
      btnAdjustLevo.addEventListener("click", async function () {
        const drugUUID = document.getElementById("ha-adjust-drug")?.value;
        const doseValue = parseFloat(document.getElementById("ha-adjust-dose")?.value);
        const statusEl = document.getElementById("ha-status-adjust-levo");
        if (!drugUUID || !doseValue) {
          if (statusEl) statusEl.textContent = "Please select formulation and dose.";
          return;
        }
        btnAdjustLevo.disabled = true;
        btnAdjustLevo.textContent = "Placing order...";
        try {
          await placeDrugOrder(patientUUID, drugUUID, doseValue, session);
          btnAdjustLevo.textContent = "✓ Adjusted Dose Ordered";
          btnAdjustLevo.className = "ha-action-btn ha-btn-success";
          if (statusEl) statusEl.textContent =
            `Levothyroxine ${doseValue} mcg once daily ordered successfully.`;
        } catch (e) {
          btnAdjustLevo.disabled = false;
          btnAdjustLevo.textContent = "Place Adjusted Dose Order";
          if (statusEl) statusEl.textContent = "Failed: " + e.message;
        }
      });

      // Sync drug dropdown with dose input
      const adjustDrugSelect = document.getElementById("ha-adjust-drug");
      const adjustDoseInput = document.getElementById("ha-adjust-dose");
      if (adjustDrugSelect && adjustDoseInput) {
        adjustDrugSelect.addEventListener("change", function () {
          const strengthMap = {
            "d58202d4-2219-489a-be30-18f32b8998d5": 25,
            "9bca6cb5-ffc8-4552-a2d5-ff28929741a5": 50,
            "8d2910f4-4811-4ea1-8b65-9c627ba9b985": 75,
            "2720163d-58b8-4d10-b700-b792c2bc940c": 88,
            "e068566f-4f36-445c-9516-2d7cf5572ab5": 100,
            "cfca7d01-c7ce-4fa4-9969-627c100f5607": 112,
            "165edfc1-e90a-4642-9112-ac58c497abc9": 125,
            "7ad278c7-aa35-46ba-8b82-84d48c300f92": 137,
            "065278f6-ed8d-4450-8e55-29884c86c24e": 150,
            "021800e0-d18a-4548-bf6d-11819c940789": 175,
            "acad7878-13e6-4f6e-b702-f68aeb6f8881": 200,
            "e386ebc4-7e26-4f5f-9a73-78094b491442": 300
          };
          adjustDoseInput.value = strengthMap[this.value] || 50;
        });
      }
    }

    // Recall weeks <-> date sync
    const weeksInput = document.getElementById("ha-recall-weeks");
    const dateInput = document.getElementById("ha-recall-date");
    const labDateInput = document.getElementById("ha-lab-date");
    if (weeksInput && dateInput) {
      weeksInput.addEventListener("input", function () {
        const weeks = parseInt(this.value) || 6;
        const newRecallDate = addWeeks(new Date(), weeks);
        dateInput.value = toDateInputValue(newRecallDate);
        if (labDateInput)
          labDateInput.value = toDateInputValue(addDays(newRecallDate, -1));
      });
      dateInput.addEventListener("change", function () {
        const selected = new Date(this.value);
        const today = new Date();
        const diffWeeks = Math.round((selected - today) / (7 * 24 * 60 * 60 * 1000));
        weeksInput.value = Math.max(1, diffWeeks);
        if (labDateInput)
          labDateInput.value = toDateInputValue(addDays(selected, -1));
      });
    }

    // Recall confirm
    const btnRecall = document.getElementById("ha-btn-schedule-recall");
    if (btnRecall) {
      btnRecall.addEventListener("click", function () {
        const dateVal = document.getElementById("ha-recall-date")?.value;
        const weeksVal = document.getElementById("ha-recall-weeks")?.value;
        const statusEl = document.getElementById("ha-status-recall");
        const labSection = document.getElementById("ha-lab-before-recall");
        if (!dateVal) {
          if (statusEl) statusEl.textContent = "Please select a recall date.";
          return;
        }
        const formatted = new Date(dateVal).toLocaleDateString("en-US", {
          weekday: "long", year: "numeric", month: "long", day: "numeric"
        });
        btnRecall.disabled = true;
        btnRecall.textContent = "✓ Recall Scheduled";
        btnRecall.className = "ha-action-btn ha-btn-success";
        if (statusEl)
          statusEl.textContent = `Recall scheduled for ${formatted} (${weeksVal} weeks from today).`;
        if (labSection) labSection.style.display = "";
      });
    }

    // Lab order for day before recall
    const btnRecallLab = document.getElementById("ha-btn-order-recall-tsh");
    if (btnRecallLab) {
      btnRecallLab.addEventListener("click", async function () {
        const labDateVal = document.getElementById("ha-lab-date")?.value;
        const statusEl = document.getElementById("ha-status-recall-tsh");
        if (!labDateVal) {
          if (statusEl) statusEl.textContent = "Please select a lab date.";
          return;
        }
        btnRecallLab.disabled = true;
        btnRecallLab.textContent = "Placing order(s)...";
        const scheduledISO = new Date(labDateVal).toISOString();
        try {
          await placeTestOrder(patientUUID, TSH_ORDER_CONCEPT, session, scheduledISO);
          if (pregnant) {
            await placeTestOrder(patientUUID, FT4_ORDER_CONCEPT, session, scheduledISO);
          }
          const formatted = new Date(labDateVal).toLocaleDateString("en-US", {
            weekday: "long", year: "numeric", month: "long", day: "numeric"
          });
          btnRecallLab.textContent = pregnant ? "✓ TSH + FT4 Orders Placed" : "✓ TSH Order Placed";
          btnRecallLab.className = "ha-action-btn ha-btn-success";
          if (statusEl)
            statusEl.textContent = pregnant
              ? `TSH + FT4 orders scheduled for ${formatted}.`
              : `TSH order scheduled for ${formatted} — results will be ready for recall visit.`;
        } catch (e) {
          btnRecallLab.disabled = false;
          btnRecallLab.textContent = "Place Lab Order(s) for Lab Date";
          if (statusEl) statusEl.textContent = "Failed: " + e.message;
        }
      });
    }
  }

  function showRecommendation(result, patientUUID, session, data, answers) {
    const content = document.getElementById("ha-final-recommendation");
    if (content) content.innerHTML = `<p>${result.message}</p>`;

    const banner = document.getElementById("ha-status-banner");
    if (banner) banner.className = `ha-status-banner status-${result.color}`;
    const statusText = document.getElementById("ha-status-text");
    if (statusText) statusText.textContent = result.status;
    const statusIcon = document.getElementById("ha-status-icon");
    if (statusIcon) statusIcon.textContent = result.color === "green" ? "✓" : "!";

    const pregnant = answers.pregnant === "yes";
    renderActionButtons(result, patientUUID, session, data.weightKg, pregnant, data.activeDrugOrders);
  }

  function setupRecommendationButton(data, session) {
    const button = document.getElementById("ha-get-recommendation-btn");
    const widget = document.getElementById("ha-recommendation-widget");
    const content = document.getElementById("ha-final-recommendation");
    if (!button || !widget || !content) return;

    button.addEventListener("click", function () {
      const answers = getAdditionalQuestionAnswers();
      if (!answers.symptoms) {
        alert("Please answer whether the patient has symptoms of hypothyroidism.");
        return;
      }
      if (!answers.cardiacCondition) {
        alert("Please answer whether the patient has any cardiac conditions.");
        return;
      }
      if (!answers.myxedema) {
        alert("Please answer whether the patient has symptoms suggestive of myxedema coma.");
        return;
      }

      const result = getRecommendation(data, answers);
      button.style.display = "none";
      widget.style.display = "";
      // Re-render charts with pregnancy context applied
      renderCharts(data, answers);

      // Check if diagnosis prompt needed
      if (shouldPromptDiagnosis(result, data.activeConditions)) {
        renderDiagnosisPrompt(result, currentPatientUUID, session, data, () => {
          // After diagnosis confirmed — show recommendation
          showRecommendation(result, currentPatientUUID, session, data, answers);
        });
      } else {
        // No diagnosis prompt needed — show recommendation directly
        showRecommendation(result, currentPatientUUID, session, data, answers);
      }
    });
  }

  function filterSixMonths(list) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    return (list || []).filter(item => {
      const d = new Date(item.dateOfTest || item.raw?.obsDatetime || 0);
      return d >= cutoff;
    });
  }

  async function loadData(patientUUID) {
    // Run sequentially to identify which call causes 500
    const demographics = await fetchPatientDemographics(patientUUID);
    const tshRaw = await fetchObs(patientUUID, CONCEPTS.TSH, 20);
    const ft4Raw = await fetchObs(patientUUID, CONCEPTS.FREE_T4, 20);
    const dateOfTestRaw = await fetchObs(patientUUID, CONCEPTS.DATE_OF_TEST, 20);
    const activeConditions = await fetchActiveConditions(patientUUID);
    const activeDrugOrders = await fetchActiveDrugOrders(patientUUID);
    const weightKg = await fetchLatestWeight(patientUUID);

    const tshWithDates = attachDateOfTest(tshRaw, dateOfTestRaw);
    const ft4WithDates = attachDateOfTest(ft4Raw, dateOfTestRaw);

    // tsh/ft4 → latest only for rule engine
    const tshLatest = latestThree(tshWithDates);
    const ft4Latest = latestThree(ft4WithDates);

    // tshAll/ft4All → last 3 unique dates for table
    // sixMonth → all points for charts
    const tshAllMap = {};
    tshWithDates.forEach(item => {
      if (item.number === null) return;
      const key = item.dateOfTest || item.raw?.obsDatetime || "unknown";
      tshAllMap[key] = item;
    });
    const ft4AllMap = {};
    ft4WithDates.forEach(item => {
      if (item.number === null) return;
      const key = item.dateOfTest || item.raw?.obsDatetime || "unknown";
      ft4AllMap[key] = item;
    });

    const tshAll = Object.values(tshAllMap)
      .sort((a, b) => new Date(b.dateOfTest || 0) - new Date(a.dateOfTest || 0))
      .slice(0, 3);
    const ft4All = Object.values(ft4AllMap)
      .sort((a, b) => new Date(b.dateOfTest || 0) - new Date(a.dateOfTest || 0))
      .slice(0, 3);

    const tshSixMonths = filterSixMonths(Object.values(tshAllMap))
      .sort((a, b) => new Date(a.dateOfTest || 0) - new Date(b.dateOfTest || 0));
    const ft4SixMonths = filterSixMonths(Object.values(ft4AllMap))
      .sort((a, b) => new Date(a.dateOfTest || 0) - new Date(b.dateOfTest || 0));

    return {
      demographics,
      gender: demographics.gender,
      age: demographics.age,
      patientIdentifier: demographics.identifier,
      tsh: tshLatest,       // for rule engine
      ft4: ft4Latest,       // for rule engine
      tshAll,               // for observations table
      ft4All,               // for observations table
      tshSixMonths,         // for TSH chart
      ft4SixMonths,         // for FT4 chart
      activeConditions,
      activeDrugOrders,
      onLevothyroxine: isOnLevothyroxine(activeDrugOrders),
      hasThyroidDiagnosis: (activeConditions || []).some(c =>
        [
          "952bcc33-d38c-4e99-83f9-c643804bc1fa",
          "df27dd07-06b9-4870-a7f0-962e47b1df78"
        ].includes(c.concept?.uuid)
      ),
      weightKg
    };
  }

  function buildObservationRows(tshList, ft4List) {
    // Show last 3 TSH and last 3 FT4 independently
    // Row per date — show even if only one value exists
    const map = {};
    (tshList || []).slice(0, 3).forEach(o => {
      const key = o.dateOfTest || "unknown";
      if (!map[key]) map[key] = { date: key };
      map[key].tsh = o.number;
    });
    (ft4List || []).slice(0, 3).forEach(o => {
      const key = o.dateOfTest || "unknown";
      if (!map[key]) map[key] = { date: key };
      map[key].ft4 = o.number;
    });
    return Object.values(map)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function renderObservationsTable(data) {
    const el = document.getElementById("ha-values");
    const rows = buildObservationRows(data.tshAll, data.ft4All);
    if (!rows.length) { el.innerHTML = "No observations available"; return; }
    el.innerHTML = `
      <table class="ha-obs-table">
        <thead>
          <tr><th>Date</th><th>TSH (mIU/L)</th><th>FT4 (ng/dL)</th></tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr class="${i === 0 ? "latest-row" : ""}">
              <td>${formatDate(r.date)}</td>
              <td>${r.tsh ?? "-"}</td>
              <td>${r.ft4 ?? "-"}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
  }

  function renderLineChart(config) {
    const canvas = document.getElementById(config.canvasId);
    if (!canvas) return null;
    // oldest → left (near y-axis), latest → right
    const sorted = (config.list || []).slice();

    // Point colors: red if outside normal range, green if inside
    const pointColors = sorted.map(item => {
      const v = item.number;
      if (v === null || v === undefined) return "#94a3b8";
      if (v < config.rangeLow || v > config.rangeHigh) return "#dc2626"; // red
      return "#16a34a"; // green
    });

    return new Chart(canvas, {
      type: "line",
      data: {
        labels: sorted.map(item => formatDate(item.dateOfTest)),
        datasets: [{
          label: config.label,
          data: sorted.map(item => item.number),
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          borderColor: "#64748b",
          tension: 0.3,
          fill: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = ctx.parsed.y;
                const inRange = v >= config.rangeLow && v <= config.rangeHigh;
                const flag = inRange ? "✓" : "⚠ Outside normal range";
                return `${config.label}: ${v} ${config.unit}  ${flag}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            title: { display: true, text: config.unit, font: { size: 10 } },
            afterDataLimits: scale => {
              scale.max = Math.max(scale.max, config.rangeHigh + config.rangePadding);
              scale.min = Math.max(0, Math.min(scale.min, config.rangeLow - config.rangePadding));
            }
          },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      },
      plugins: [{
        id: `${config.canvasId}-normal-range`,
        beforeDraw: chart => {
          const ctx = chart.ctx;
          const yScale = chart.scales.y;
          const xScale = chart.scales.x;
          if (!yScale || !xScale) return;
          const yTop = yScale.getPixelForValue(config.rangeHigh);
          const yBottom = yScale.getPixelForValue(config.rangeLow);
          ctx.save();
          ctx.fillStyle = "rgba(22, 163, 74, 0.10)";
          ctx.fillRect(xScale.left, yTop, xScale.right - xScale.left, yBottom - yTop);
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = "rgba(22, 163, 74, 0.65)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(xScale.left, yTop); ctx.lineTo(xScale.right, yTop); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(xScale.left, yBottom); ctx.lineTo(xScale.right, yBottom); ctx.stroke();
          ctx.restore();
        }
      }]
    });
  }

  function renderCharts(data, answers) {
    show("ha-chart-container");
    show("ha-ft4-chart-container");

    // Compute trimester-specific ranges
    const pregnant = answers?.pregnant === "yes";
    const trimester = parseInt(answers?.trimester) || null;

    let tshLow = 0.4, tshHigh = 4.5;
    let ft4Low = 0.9, ft4High = 1.7;

    if (pregnant && trimester === 1) {
      tshLow = 0.1; tshHigh = 2.5;
      ft4Low = 0.8; ft4High = 1.53;
    } else if (pregnant && trimester === 2) {
      tshLow = 0.2; tshHigh = 3.0;
      ft4Low = 0.7; ft4High = 1.20;
    } else if (pregnant && trimester === 3) {
      tshLow = 0.3; tshHigh = 3.0;
      ft4Low = 0.7; ft4High = 1.20;
    }

    const tshLabel = pregnant && trimester
      ? `Target: ${tshLow}–${tshHigh} mIU/L (T${trimester}, last 6 months)`
      : "Target: 0.4–4.5 mIU/L (last 6 months)";
    const ft4Label = pregnant && trimester
      ? `Target: ${ft4Low}–${ft4High} ng/dL (T${trimester}, last 6 months)`
      : "Target: 0.9–1.7 ng/dL (last 6 months)";

    const tshRangeLabel = document.getElementById("ha-chart-range-label");
    if (tshRangeLabel) tshRangeLabel.textContent = tshLabel;
    const ft4RangeLabel = document.getElementById("ha-ft4-chart-range-label");
    if (ft4RangeLabel) ft4RangeLabel.textContent = ft4Label;

    if (tshChartInstance) tshChartInstance.destroy();
    if (ft4ChartInstance) ft4ChartInstance.destroy();

    tshChartInstance = renderLineChart({
      canvasId: "ha-tsh-chart", list: data.tshSixMonths, label: "TSH",
      unit: "mIU/L", rangeLow: tshLow, rangeHigh: tshHigh, rangePadding: 0.5
    });
    ft4ChartInstance = renderLineChart({
      canvasId: "ha-ft4-chart", list: data.ft4SixMonths, label: "FT4",
      unit: "ng/dL", rangeLow: ft4Low, rangeHigh: ft4High, rangePadding: 0.3
    });
  }

  async function init() {
    try {
      const patientUUID = getPatientUUID();
      if (!patientUUID)
        throw new Error("No patient context found. Please open this app from a patient chart.");

      currentPatientUUID = patientUUID;
      const session = await verifySession();
      const data = await loadData(patientUUID);
      currentData = data;

      const patientName = document.getElementById("ha-patient-name");
      const patientDetails = document.getElementById("ha-patient-details");
      const patientId = document.getElementById("ha-patient-id");

      if (patientName) patientName.textContent = data.demographics.display || "Patient";
      if (patientDetails) {
        const genderText = data.gender === "F" ? "Female" : data.gender === "M" ? "Male" : "";
        patientDetails.textContent = `${genderText} ${data.age ?? "?"} year(s)`;
      }
      if (patientId) patientId.textContent = data.patientIdentifier || patientUUID;

      renderObservationsTable(data);
      renderActiveConditions(data.activeConditions);
      renderActiveMedications(data.activeDrugOrders);
      renderAdditionalQuestions(data);
      renderCharts(data, {});
      setupRecommendationButton(data, session);

      const actions = document.getElementById("ha-actions");
      if (actions) actions.innerHTML = "";

      hide("ha-loading");
      show("ha-main");
    } catch (error) {
      console.error("[HypothyroidAssist]", error);
      showError(error.message || "Unable to load thyroid data.");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
