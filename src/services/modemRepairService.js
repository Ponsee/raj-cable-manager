// Faulty modems. A customer's modem goes to the brand's service centre; the brand's
// answer decides what happens next and what it costs (see doc/FTU_MODEM_TRACKING_PLAN.md §6):
//   warranty_replaced -> brand sends a new unit (only parcel costs)
//   repaired          -> repair cost; the unit goes back to the customer (or to stock)
//   upgrade           -> we pay the brand, the customer pays us (the two can differ)
//   keep_ftu          -> not covered; the customer keeps a free-to-use modem
// Everything about the service lives in modems.service (json). Every multi-step action
// undoes its earlier steps if a later one fails.
import { supabase } from "./supabase";
import { addEntry } from "./financeService";
import { createModem, updateModem } from "./modemsService";
import { issueUnit, returnUnitToStock, undoIssueUnit } from "./modemFlowService";
import { normalizeMac, todayISO } from "../utils/ftu";
import {
  MODEM_OWNERSHIP,
  MODEM_STATUS,
  SERVICE_CATEGORY,
  SERVICE_OUTCOME,
} from "../constants";

const money = (v) => (v === "" || v == null ? 0 : Number(v) || 0);

// Run `work`; if it throws, run the registered undo steps (newest first).
async function transact(work) {
  const undo = [];
  try {
    return await work((fn) => undo.push(fn));
  } catch (err) {
    for (const fn of undo.reverse()) {
      try {
        await fn();
      } catch {
        /* best effort */
      }
    }
    throw err;
  }
}

async function addExpense(undo, { amount, category, note, date, paymentMethod }) {
  if (!(amount > 0)) return null;
  const row = await addEntry("expenses", { amount, category, note, date, paymentMethod });
  undo(() => supabase.from("expenses").delete().eq("id", row.id));
  return row.id;
}

async function getUnit(id) {
  const { data } = await supabase.from("modems").select("*").eq("id", id).maybeSingle();
  return data;
}

async function lineExists(connId) {
  if (!connId) return false;
  const { data } = await supabase.from("connections").select("id").eq("id", connId).maybeSingle();
  return !!data;
}

// The temporary modem given to the customer, if it's still on their line.
async function tempOnLine(svc) {
  if (!svc.temp_unit_id) return null;
  const u = await getUnit(svc.temp_unit_id);
  return u && u.status === MODEM_STATUS.WITH_CUSTOMER && u.connection_id === svc.for_connection_id
    ? u
    : null;
}

const noteTail = (svc) => (svc.claim_no ? ` (claim ${svc.claim_no})` : "");

// ---- 1. Send to service ----
// modem: a unit with a customer (from getModems, so it carries .connection).
// options: { brand, claimNo, parcelOutCost, paymentMethod, date, tempUnit }
//   tempUnit: an in-stock unit to give the customer meanwhile (an FTU stock entry).
export async function sendToService(modem, options = {}) {
  if (modem.status !== MODEM_STATUS.WITH_CUSTOMER || !modem.connection_id)
    throw new Error("Only a modem that is with a customer can be sent to service.");
  const brand = (options.brand || "").trim();
  if (!brand) throw new Error("Enter the brand or service centre.");
  const date = options.date || todayISO();
  const conn = modem.connection;
  const customerName = conn?.customer?.name || "Customer";

  return transact(async (undo) => {
    const svc = {
      brand,
      claim_no: options.claimNo?.trim() || null,
      sent_on: date,
      for_connection_id: modem.connection_id,
      for_customer_id: conn?.customer?.id || null,
      customer_name: customerName,
      provider_name: conn?.provider?.name || null,
      outcome: null,
      parcel_out_cost: money(options.parcelOutCost),
      expense_ids: [],
      temp_unit_id: null,
    };
    const before = {
      status: modem.status,
      connection_id: modem.connection_id,
      service: modem.service ?? null,
    };

    // The unit leaves the customer's line (this also frees the line for a temporary one).
    await updateModem(modem.id, { status: MODEM_STATUS.WITH_SERVICE, connection_id: null, service: svc });
    undo(() => updateModem(modem.id, before));

    if (options.tempUnit) {
      const res = await issueUnit(options.tempUnit, modem.connection_id, MODEM_OWNERSHIP.FTU, {
        customerName,
        date,
      });
      undo(() => undoIssueUnit(options.tempUnit, res));
      svc.temp_unit_id = options.tempUnit.id;
    }

    const eid = await addExpense(undo, {
      amount: svc.parcel_out_cost,
      category: SERVICE_CATEGORY.PARCEL,
      note: `Modem to ${brand} — ${customerName}${noteTail(svc)}`,
      date,
      paymentMethod: options.paymentMethod,
    });
    if (eid) svc.expense_ids.push(eid);

    await updateModem(modem.id, { service: svc });
    return svc;
  });
}

// ---- 2. The brand's answer ----
// result: {
//   outcome, date, paymentMethod, parcelBackCost,
//   serviceCost,                              (repaired)
//   giveBackTo: "customer" | "stock",          (repaired)
//   upgradeCost, customerPaid,                (upgrade)
//   newUnit: { mac_address, serial_no, product_id },  (warranty_replaced / upgrade)
//   stockUnit,                                (keep_ftu when no temporary modem is on the line)
// }
export async function completeService(modem, result) {
  if (modem.status !== MODEM_STATUS.WITH_SERVICE)
    throw new Error("This modem isn't with the service centre.");
  const svc = modem.service || {};
  const connId = svc.for_connection_id;
  const outcome = result.outcome;
  if (!Object.values(SERVICE_OUTCOME).includes(outcome))
    throw new Error("Pick what the brand decided.");
  const date = result.date || todayISO();
  const paymentMethod = result.paymentMethod || "Cash";
  const who = svc.customer_name || "Customer";

  // Check everything we can before changing anything.
  const mac = normalizeMac(result.newUnit?.mac_address);
  if (mac === null) throw new Error("Enter a valid MAC address for the new modem.");
  if (!(await lineExists(connId)))
    throw new Error("The customer's connection no longer exists.");
  const temp = await tempOnLine(svc);
  if (outcome === SERVICE_OUTCOME.KEEP_FTU && !temp && !result.stockUnit)
    throw new Error("Pick the FTU modem the customer will keep.");

  return transact(async (undo) => {
    const ids = [...(svc.expense_ids || [])];
    let incomeId = svc.income_id || null;
    let replacementId = null;

    const cost = async (amount, category, label) => {
      const id = await addExpense(undo, {
        amount: money(amount),
        category,
        note: `${label} — ${who}${noteTail(svc)}`,
        date,
        paymentMethod,
      });
      if (id) ids.push(id);
    };
    // One modem per line: the temporary one goes back to stock before the real one arrives.
    const freeLine = async () => {
      if (!temp) return;
      await returnUnitToStock(temp);
      undo(() => issueUnit(temp, connId, MODEM_OWNERSHIP.FTU, { customerName: who, date }));
    };
    const addUnit = async (fields) => {
      const u = await createModem({
        status: MODEM_STATUS.WITH_CUSTOMER,
        connection_id: connId,
        issued_on: date,
        replaced_modem_id: modem.id,
        mac_address: mac,
        serial_no: result.newUnit?.serial_no,
        ...fields,
      });
      undo(() => supabase.from("modems").delete().eq("id", u.id));
      replacementId = u.id;
    };

    let unitPatch; // what happens to the faulty unit
    if (outcome === SERVICE_OUTCOME.WARRANTY_REPLACED) {
      await cost(result.parcelBackCost, SERVICE_CATEGORY.PARCEL, "Parcel back from brand");
      await freeLine();
      await addUnit({ product_id: modem.product_id, ownership: modem.ownership });
      unitPatch = { status: MODEM_STATUS.LOST, connection_id: null };
    } else if (outcome === SERVICE_OUTCOME.REPAIRED) {
      await cost(result.serviceCost, SERVICE_CATEGORY.SERVICE, "Modem repair");
      await cost(result.parcelBackCost, SERVICE_CATEGORY.PARCEL, "Parcel back from brand");
      if (result.giveBackTo === "stock") {
        await returnUnitToStock(modem); // back on the shelf; the customer keeps the temporary one
        unitPatch = {};
      } else {
        await freeLine();
        unitPatch = {
          status: MODEM_STATUS.WITH_CUSTOMER,
          connection_id: connId,
          issued_on: date,
          notice_sent_on: null,
        };
      }
    } else if (outcome === SERVICE_OUTCOME.UPGRADE) {
      await cost(result.upgradeCost, SERVICE_CATEGORY.UPGRADE, "Modem upgrade");
      await cost(result.parcelBackCost, SERVICE_CATEGORY.PARCEL, "Parcel back from brand");
      const paid = money(result.customerPaid);
      if (paid > 0) {
        const inc = await addEntry("income", {
          amount: paid,
          category: SERVICE_CATEGORY.SALE,
          note: `Modem upgrade — ${who}${noteTail(svc)}`,
          date,
          paymentMethod,
          connectionId: connId,
        });
        undo(() => supabase.from("income").delete().eq("id", inc.id));
        incomeId = inc.id;
      }
      await freeLine();
      await addUnit({
        product_id: result.newUnit?.product_id || modem.product_id,
        ownership: MODEM_OWNERSHIP.CUSTOMER,
      });
      unitPatch = { status: MODEM_STATUS.LOST, connection_id: null };
    } else {
      // keep_ftu: the temporary modem (or a stock unit picked now) stays as the customer's FTU modem.
      await cost(result.parcelBackCost, SERVICE_CATEGORY.PARCEL, "Parcel back from brand");
      if (!temp) {
        const res = await issueUnit(result.stockUnit, connId, MODEM_OWNERSHIP.FTU, {
          customerName: who,
          date,
        });
        undo(() => undoIssueUnit(result.stockUnit, res));
      }
      unitPatch = { status: MODEM_STATUS.LOST, connection_id: null };
    }

    const finished = {
      ...svc,
      outcome,
      warranty: outcome === SERVICE_OUTCOME.WARRANTY_REPLACED,
      completed_on: date,
      parcel_back_cost: money(result.parcelBackCost),
      service_cost: money(result.serviceCost),
      upgrade_cost: money(result.upgradeCost),
      customer_paid: money(result.customerPaid),
      expense_ids: ids,
      income_id: incomeId,
      replacement_unit_id: replacementId,
    };
    await updateModem(modem.id, { ...unitPatch, service: finished });
    return finished;
  });
}

// ---- 3. Sent by mistake: bring it back ----
// Only before the brand has answered. The unit returns to the customer's line (the
// temporary modem goes back to stock) and the parcel expense is removed.
export async function cancelService(modem) {
  const svc = modem.service || {};
  if (modem.status !== MODEM_STATUS.WITH_SERVICE || svc.outcome)
    throw new Error("Only a modem that is still with the service centre can be brought back.");
  if (!(await lineExists(svc.for_connection_id)))
    throw new Error("The customer's connection no longer exists.");
  const temp = await tempOnLine(svc);

  return transact(async (undo) => {
    if (temp) {
      await returnUnitToStock(temp);
      undo(() =>
        issueUnit(temp, svc.for_connection_id, MODEM_OWNERSHIP.FTU, { customerName: svc.customer_name })
      );
    }
    await updateModem(modem.id, {
      status: MODEM_STATUS.WITH_CUSTOMER,
      connection_id: svc.for_connection_id,
      notice_sent_on: null,
      service: null,
    });
    if (svc.expense_ids?.length)
      await supabase.from("expenses").delete().in("id", svc.expense_ids);
  });
}

// Delete the expense / income rows a service created (e.g. entered by mistake).
export async function removeServiceEntries(modem) {
  const svc = modem.service || {};
  if (svc.expense_ids?.length) {
    const { error } = await supabase.from("expenses").delete().in("id", svc.expense_ids);
    if (error) throw error;
  }
  if (svc.income_id) {
    const { error } = await supabase.from("income").delete().eq("id", svc.income_id);
    if (error) throw error;
  }
  await updateModem(modem.id, {
    service: { ...svc, expense_ids: [], income_id: null, entries_removed: true },
  });
}
