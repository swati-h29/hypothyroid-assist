// rules.js
// HypothyroidAssist Clinical Decision Support Rules
// All clinical rule logic is contained here.
// No DOM manipulation. Pure input/output functions.

function getRecommendation(data, answers) {

  const age = data.age;
  const latestTSH = data.tsh[0]?.number ?? null;
  const latestFT4 = data.ft4[0]?.number ?? null;
  const allTSH = data.tsh.map(t => t.number);

  const pregnant = answers.pregnant === "yes";
  const trimester = parseInt(answers.trimester) || null;
  const cardiac = answers.cardiacCondition === "yes";
  const symptoms = answers.symptoms === "yes";
  const myxedema = answers.myxedema === "yes";
  const onLevothyroxine = data.onLevothyroxine === true;
  // Use confirmed diagnosis to drive category selection
  // not just whether patient is on levothyroxine
  const hasThyroidDiagnosis = data.hasThyroidDiagnosis === true;

  // ── Trimester-specific TSH reference ranges ────
  // Only applies when patient is pregnant
  // Non-pregnant: standard 0.4–4.5 used throughout
  let tshLow = 0.4;
  let tshHigh = 4.5;
  if (pregnant && trimester === 1) {
    tshLow = 0.1;
    tshHigh = 2.5;
  } else if (pregnant && trimester === 2) {
    tshLow = 0.2;
    tshHigh = 3.0;
  } else if (pregnant && trimester === 3) {
    tshLow = 0.3;
    tshHigh = 3.0;
  }

  // ── MYXEDEMA EMERGENCY SCREEN ─────────────────
  // Must be checked first before any other rule
  if (myxedema) {
    return {
      status: "EMERGENCY — Possible Myxedema Coma",
      color: "red",
      message:
        "Patient presents with symptoms suggestive " +
        "of myxedema coma (hypothermia, stupor, " +
        "mental confusion). This is a medical " +
        "emergency. Do not proceed with routine " +
        "assessment. Transfer to emergency care " +
        "immediately.",
      actions: []
    };
  }

  // ── CATEGORY 4 — Known Thyroid Diagnosis ─────
  // Patient has confirmed thyroid diagnosis
  // → monitoring and dose adjustment rules apply
  // → onLevothyroxine used within for dose logic

  if (hasThyroidDiagnosis) {

    if (latestTSH === null) {
      return {
        status: "Monitoring Required — No TSH on Record",
        color: "amber",
        message:
          "Patient has a thyroid diagnosis but no TSH " +
          "result is available. Order TSH to assess " +
          "current thyroid status.",
        actions: ["ORDER_TSH"]
      };
    }

    // ── Not on levothyroxine — initiate treatment ──
    // Patient has diagnosis but no active medication
    if (!onLevothyroxine) {
      if (latestTSH > 4.5) {
        if (age < 60 && !cardiac && !pregnant) {
          return {
            status: "Diagnosis Confirmed — Initiate Treatment",
            color: "red",
            message:
              `TSH is ${latestTSH} mIU/L. Patient has ` +
              "confirmed hypothyroidism but is not on " +
              "medication. Start levothyroxine at " +
              "1.5–1.8 mcg/kg/day. Recall in 6–8 weeks.",
            actions: ["START_TREATMENT", "SCHEDULE_RECALL_6_8WK"]
          };
        }
        if ((age >= 60 || cardiac) && !pregnant) {
          return {
            status: "Diagnosis Confirmed — Conservative Treatment Start",
            color: "red",
            message:
              `TSH is ${latestTSH} mIU/L. Patient has ` +
              "confirmed hypothyroidism but is not on " +
              "medication. Patient is aged ≥60 or has " +
              "cardiac condition. Start levothyroxine " +
              "conservatively at 12.5–50 mcg/day. " +
              "Recall in 3–4 weeks.",
            actions: ["START_TREATMENT", "SCHEDULE_RECALL_3_4WK"]
          };
        }
        if (pregnant) {
          return {
            status: `Diagnosis Confirmed — Initiate Treatment (Pregnant T${trimester})`,
            color: "red",
            message:
              `TSH is ${latestTSH} mIU/L during ` +
              `Trimester ${trimester || "unknown"} ` +
              `(normal: ${tshLow}–${tshHigh} mIU/L). ` +
              "Patient has confirmed hypothyroidism but " +
              "is not on medication. Start levothyroxine " +
              "immediately. Refer to endocrinologist. " +
              "Recall in 6–8 weeks.",
            actions: [
              "START_TREATMENT",
              "REFER_ENDOCRINOLOGY",
              "SCHEDULE_RECALL_6_8WK"
            ]
          };
        }
      }
      if (latestTSH >= 0.4 && latestTSH <= 4.5) {
        return {
          status: "Diagnosis Confirmed — TSH Normal, Not on Medication",
          color: "amber",
          message:
            `TSH is ${latestTSH} mIU/L — within normal ` +
            "range. Patient has hypothyroidism diagnosis " +
            "but is not currently on medication. " +
            "Clinical review recommended. Recall in 3 months.",
          actions: ["SCHEDULE_RECALL_3MO"]
        };
      }
      if (latestTSH < 0.4) {
        return {
          status: "Diagnosis Confirmed — TSH Suppressed, Not on Medication",
          color: "amber",
          message:
            `TSH is ${latestTSH} mIU/L — below normal ` +
            "range. Patient has hypothyroidism diagnosis " +
            "but is not on medication. TSH suppression " +
            "without medication is unusual. " +
            "Refer to endocrinology for evaluation.",
          actions: ["REFER_ENDOCRINOLOGY"]
        };
      }
    }

    // ── Rule 3a — Pregnant patient on levothyroxine
    // Uses trimester-specific TSH ranges
    if (pregnant && trimester) {

      if (latestTSH < tshLow) {
        return {
          status: `Pregnant — TSH Suppressed (T${trimester}: <${tshLow})`,
          color: "amber",
          message:
            `TSH is ${latestTSH} mIU/L during ` +
            `Trimester ${trimester} ` +
            `(normal: ${tshLow}–${tshHigh} mIU/L). ` +
            "TSH is below the trimester-specific range. " +
            "Decrease levothyroxine dose by 12.5–25 mcg. " +
            "Refer to endocrinologist. " +
            "Recall in 6–8 weeks.",
          actions: [
            "ADJUST_DOSE",
            "REFER_ENDOCRINOLOGY",
            "SCHEDULE_RECALL_6_8WK"
          ]
        };
      }

      if (latestTSH > tshHigh && latestTSH <= tshHigh + 2.0) {
        return {
          status: `Pregnant — TSH Mildly Elevated (T${trimester}: >${tshHigh})`,
          color: "red",
          message:
            `TSH is ${latestTSH} mIU/L during ` +
            `Trimester ${trimester} ` +
            `(normal: ${tshLow}–${tshHigh} mIU/L). ` +
            "Increase levothyroxine dose by " +
            "25–50 mcg per day. " +
            "Refer to endocrinologist. " +
            "Recall in 6–8 weeks.",
          actions: [
            "ADJUST_DOSE",
            "REFER_ENDOCRINOLOGY",
            "SCHEDULE_RECALL_6_8WK"
          ]
        };
      }

      if (latestTSH > tshHigh + 2.0 && latestTSH <= tshHigh + 7.0) {
        return {
          status: `Pregnant — TSH Severely Elevated (T${trimester}: >${tshHigh + 2.0})`,
          color: "red",
          message:
            `TSH is ${latestTSH} mIU/L during ` +
            `Trimester ${trimester} ` +
            `(normal: ${tshLow}–${tshHigh} mIU/L). ` +
            "Increase levothyroxine dose by " +
            "50–75 mcg per day. " +
            "Refer to endocrinologist. " +
            "Recall in 6–8 weeks.",
          actions: [
            "ADJUST_DOSE",
            "REFER_ENDOCRINOLOGY",
            "SCHEDULE_RECALL_6_8WK"
          ]
        };
      }

      if (latestTSH > tshHigh + 7.0) {
        return {
          status: `Pregnant — TSH Critically Elevated (T${trimester}: >${tshHigh + 7.0})`,
          color: "red",
          message:
            `TSH is ${latestTSH} mIU/L during ` +
            `Trimester ${trimester} ` +
            `(normal: ${tshLow}–${tshHigh} mIU/L). ` +
            "Increase levothyroxine dose by " +
            "75–100 mcg per day. " +
            "Refer to endocrinologist. " +
            "Recall in 6–8 weeks.",
          actions: [
            "ADJUST_DOSE",
            "REFER_ENDOCRINOLOGY",
            "SCHEDULE_RECALL_6_8WK"
          ]
        };
      }

      // TSH within trimester-specific range
      return {
        status: `Pregnant — TSH Within Range (T${trimester}: ${tshLow}–${tshHigh})`,
        color: "green",
        message:
          `TSH is ${latestTSH} mIU/L during ` +
          `Trimester ${trimester} ` +
          `(normal: ${tshLow}–${tshHigh} mIU/L). ` +
          "Continue current levothyroxine dose. " +
          "Recall in 6–8 weeks.",
        actions: ["SCHEDULE_RECALL_6_8WK"]
      };
    }

    // ── Branch A — age < 60, no cardiac, not pregnant
    // Uses standard TSH ranges (tshLow=0.4, tshHigh=4.5 for non-pregnant)
    if (age < 60 && !cardiac && !pregnant) {

      if (latestTSH < tshLow) {
        return {
          status: "TSH Suppressed — Dose Reduction Needed",
          color: "amber",
          message:
            `TSH is ${latestTSH} mIU/L — below ` +
            "normal range. Decrease dose by " +
            "12.5–25 mcg. Recall in 6–8 weeks.",
          actions: [
            "ADJUST_DOSE",
            "SCHEDULE_RECALL_6_8WK"
          ]
        };
      }

      if (latestTSH >= tshLow && latestTSH <= tshHigh) {
        if (!symptoms) {
          return {
            status: "TSH Normal — Well Controlled",
            color: "green",
            message:
              `TSH is ${latestTSH} mIU/L — within ` +
              "normal range. Patient has no symptoms. " +
              "Continue current dose. " +
              "Recall in 12 months.",
            actions: ["SCHEDULE_RECALL_12MO"]
          };
        } else {
          return {
            status: "TSH Normal — Symptoms Present",
            color: "amber",
            message:
              `TSH is ${latestTSH} mIU/L — within ` +
              "normal range but patient has symptoms. " +
              "Continue current dose. " +
              "Recall in less than 12 months for " +
              "clinical review.",
            actions: ["SCHEDULE_RECALL_EARLY"]
          };
        }
      }

      if (latestTSH > tshHigh) {
        const allElevated =
          allTSH.length >= 3 &&
          allTSH.every(t => t > tshHigh);

        if (allElevated) {
          return {
            status: "TSH Persistently Elevated — Referral",
            color: "red",
            message:
              `TSH is ${latestTSH} mIU/L. All three ` +
              `recent TSH values are above ${tshHigh} mIU/L ` +
              "despite treatment. Refer to " +
              "endocrinology for further management.",
            actions: [
              "REFER_ENDOCRINOLOGY",
              "SCHEDULE_RECALL_6_8WK"
            ]
          };
        }

        return {
          status: "TSH Elevated — Review Adherence",
          color: "amber",
          message:
            `TSH is ${latestTSH} mIU/L — above ` +
            "normal range. Review medication " +
            "adherence. If adherent, increase dose " +
            "by 12.5–25 mcg. Recall in 6–8 weeks.",
          actions: [
            "REVIEW_ADHERENCE",
            "ADJUST_DOSE",
            "SCHEDULE_RECALL_6_8WK"
          ]
        };
      }
    }

    // ── Branch B — age >= 60 OR cardiac, not pregnant
    if ((age >= 60 || cardiac) && !pregnant) {

      if (latestTSH >= tshLow && latestTSH <= tshHigh) {
        return {
          status: "TSH Normal — Well Controlled",
          color: "green",
          message:
            `TSH is ${latestTSH} mIU/L — within ` +
            "normal range. Continue current dose. " +
            "Recall in 12 months.",
          actions: ["SCHEDULE_RECALL_12MO"]
        };
      }

      if (latestTSH > tshHigh) {
        return {
          status: "TSH Elevated — Conservative Increase",
          color: "amber",
          message:
            `TSH is ${latestTSH} mIU/L. Patient is ` +
            "aged ≥60 or has cardiac condition. " +
            "Increase dose conservatively by 25 mcg. " +
            "Recall in 3–4 weeks.",
          actions: [
            "ADJUST_DOSE",
            "SCHEDULE_RECALL_3_4WK"
          ]
        };
      }

      if (latestTSH < tshLow) {
        return {
          status: "TSH Suppressed — Dose Reduction Needed",
          color: "amber",
          message:
            `TSH is ${latestTSH} mIU/L — below ` +
            "normal range. Decrease dose by 25 mcg. " +
            "Recall in 3–4 weeks.",
          actions: [
            "ADJUST_DOSE",
            "SCHEDULE_RECALL_3_4WK"
          ]
        };
      }
    }
  }

  // ── CATEGORY 1 — No TSH on record ─────────────
  if (latestTSH === null) {
    return {
      status: "No TSH on Record",
      color: "gray",
      message:
        "No thyroid function tests found for this " +
        "patient. Order TSH to begin assessment.",
      actions: ["ORDER_TSH"]
    };
  }

  // ── CATEGORY 2 — TSH available, no FT4 ────────
  if (latestTSH !== null && latestFT4 === null) {

    if (latestTSH >= tshLow && latestTSH <= tshHigh) {
      return {
        status: "TSH Within Normal Range",
        color: "green",
        message:
          `TSH is ${latestTSH} mIU/L — within ` +
          "normal range. No further thyroid workup " +
          "needed at this time.",
        actions: []
      };
    }

    if (latestTSH < tshLow) {
      return {
        status: "TSH Below Normal — Evaluate for Hyperthyroidism",
        color: "amber",
        message:
          `TSH is ${latestTSH} mIU/L — below normal ` +
          "range. This may indicate hyperthyroidism or " +
          "overtreatment. Evaluate clinically. " +
          "No further lab workup needed at this time.",
        actions: []
      };
    }

    if (latestTSH > tshHigh) {
      return {
        status: "TSH Elevated — FT4 Needed",
        color: "amber",
        message:
          `TSH is ${latestTSH} mIU/L — elevated. ` +
          "Order FT4 to confirm thyroid status " +
          "before initiating treatment.",
        actions: ["ORDER_FT4"]
      };
    }
  }

  // ── CATEGORY 3 — TSH + FT4 available ──────────
  if (latestTSH !== null && latestFT4 !== null) {

    if (latestTSH >= tshLow && latestTSH <= tshHigh) {
      return {
        status: "TSH Within Normal Range",
        color: "green",
        message:
          `TSH is ${latestTSH} mIU/L and FT4 is ` +
          `${latestFT4} ng/dL. No thyroid disorder ` +
          "detected at this time.",
        actions: []
      };
    }

    if (latestTSH > tshHigh) {

      // Determine FT4 reference range
      let ft4Low = 0.9;
      let ft4High = 1.7;

      if (pregnant && trimester === 1) {
        ft4Low = 0.8;
        ft4High = 1.53;
      } else if (
        pregnant &&
        (trimester === 2 || trimester === 3)
      ) {
        ft4Low = 0.7;
        ft4High = 1.20;
      }

      // Primary overt hypothyroidism — FT4 low
      if (latestFT4 < ft4Low) {

        // Pregnant — Rule 3 initial treatment
        if (pregnant) {
          return {
            status: "Primary Hypothyroidism — Pregnant",
            color: "red",
            message:
              `TSH is ${latestTSH} mIU/L and FT4 ` +
              `is ${latestFT4} ng/dL — consistent ` +
              "with primary hypothyroidism in " +
              `Trimester ${trimester}. ` +
              "Start levothyroxine. Increase dose " +
              "by 30% or prescribe 9 doses per week. " +
              "Refer to endocrinologist. " +
              "Recall in 6–8 weeks.",
            actions: [
              "START_TREATMENT",
              "REFER_ENDOCRINOLOGY",
              "SCHEDULE_RECALL_6_8WK"
            ]
          };
        }

        // Branch A — age < 60, no cardiac, not pregnant
        if (age < 60 && !cardiac && !pregnant) {
          return {
            status:
              "Primary Hypothyroidism — Initiate Treatment",
            color: "red",
            message:
              `TSH is ${latestTSH} mIU/L and FT4 ` +
              `is ${latestFT4} ng/dL — consistent ` +
              "with primary overt hypothyroidism. " +
              "Start levothyroxine at " +
              "1.5–1.8 mcg/kg/day. " +
              "Recall in 6–8 weeks.",
            actions: [
              "START_TREATMENT",
              "SCHEDULE_RECALL_6_8WK"
            ]
          };
        }

        // Branch B — age >= 60 or cardiac, not pregnant
        if ((age >= 60 || cardiac) && !pregnant) {
          return {
            status:
              "Primary Hypothyroidism — Conservative Start",
            color: "red",
            message:
              `TSH is ${latestTSH} mIU/L and FT4 ` +
              `is ${latestFT4} ng/dL — consistent ` +
              "with primary overt hypothyroidism. " +
              "Patient is aged ≥60 or has cardiac " +
              "condition. Start levothyroxine " +
              "conservatively at 12.5–50 mcg/day. " +
              "Recall in 3–4 weeks.",
            actions: [
              "START_TREATMENT",
              "SCHEDULE_RECALL_3_4WK"
            ]
          };
        }
      }
      // Subclinical hypothyroidism — FT4 normal
      if (latestFT4 >= ft4Low && latestFT4 <= ft4High) {

        // Pregnant → always 6-8 week recall
        if (pregnant) {
          return {
            status: "Subclinical Hypothyroidism — Pregnant",
            color: "amber",
            message:
              `TSH is ${latestTSH} mIU/L and FT4 is ` +
              `${latestFT4} ng/dL — subclinical ` +
              "hypothyroidism during pregnancy. " +
              "Monitor closely. Recall in 6–8 weeks.",
            actions: ["SCHEDULE_RECALL_6_8WK"]
          };
        }

        if (latestTSH > tshHigh + 5.5) {
          return {
            status: "Subclinical Hypothyroidism — TSH >10",
            color: "amber",
            message:
              `TSH is ${latestTSH} mIU/L and FT4 ` +
              `is ${latestFT4} ng/dL — subclinical ` +
              "hypothyroidism with TSH above 10. " +
              "Consider initiating levothyroxine. " +
              "Recall in 3 months.",
            actions: [
              "CONSIDER_TREATMENT",
              "SCHEDULE_RECALL_3MO"
            ]
          };
        }

        if (symptoms) {
          return {
            status:
              "Subclinical Hypothyroidism — Symptomatic",
            color: "amber",
            message:
              `TSH is ${latestTSH} mIU/L and FT4 ` +
              `is ${latestFT4} ng/dL — subclinical ` +
              "hypothyroidism with symptoms present. " +
              "Consider a 6-month trial of " +
              "levothyroxine. Recall in 3 months.",
            actions: [
              "CONSIDER_TREATMENT",
              "SCHEDULE_RECALL_3MO"
            ]
          };
        }

        return {
          status: "Subclinical Hypothyroidism — Monitor",
          color: "amber",
          message:
            `TSH is ${latestTSH} mIU/L and FT4 ` +
            `is ${latestFT4} ng/dL — subclinical ` +
            "hypothyroidism. No treatment required " +
            "at this time. Repeat TSH in 3 months.",
          actions: ["SCHEDULE_RECALL_3MO"]
        };
      }

      // FT4 above normal — not primary hypothyroidism
      if (latestFT4 > ft4High) {
        return {
          status: "Not Primary Hypothyroidism",
          color: "blue",
          message:
            `TSH is ${latestTSH} mIU/L and FT4 ` +
            `is ${latestFT4} ng/dL. Elevated TSH ` +
            "with normal or high FT4 is not " +
            "consistent with primary hypothyroidism. " +
            "Refer to endocrinology.",
          actions: ["REFER_ENDOCRINOLOGY"]
        };
      }
    }
  }

  return {
    status: "Review Required",
    color: "gray",
    message:
      "Unable to classify thyroid status based on " +
      "available data. Please review results clinically.",
    actions: []
  };
}
