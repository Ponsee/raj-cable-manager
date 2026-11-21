// Moving ONE modem unit between stock and a customer, with the right stock entry
// for tracked products. (Products that don't track units, and units with no
// product, just change the unit and leave stock alone.)
import { supabase } from "./supabase";
import { throwDb } from "./dbErrors";
import { addStockTransaction } from "./productsService";
import { getTrackedIds, takeUnitsOut, revertOutByTx } from "./modemStockService";
import { issueModem, markReturned, createModem } from "./modemsService";
import { STOCK_TYPES, MODEM_OWNERSHIP, MODEM_STATUS } from "../constants";
import { todayISO } from "../utils/ftu";

// Combine a date with the current time so same-day rows keep their order.
function stamp(date) {
  if (!date) return undefined;
  const n = new Date();
  const d = new Date(date);
  d.setHours(n.getHours(), n.getMinutes(), n.getSeconds(), n.getMilliseconds());
  return d.toISOString();
}

// Give an in-stock unit to a customer's line.
//   ownership "ftu"      -> free: a "usage" stock entry, no income
//   ownership "customer" -> sold: a "sale" stock entry (+ income when sellPrice > 0)
// options: { sellPrice, paymentMethod, date, customerName, incomeless, incomeCategory }
//   incomeless: record the sale's stock entry but NO income (used when the money is
//   booked another way, e.g. a part-payment on the Pending list).
export async function issueUnit(modem, connectionId, ownership, options = {}) {
  const tracked = modem.product_id ? await getTrackedIds([modem.product_id]) : new Set();
  if (!tracked.has(modem.product_id)) return issueModem(modem.id, connectionId, ownership);
  if (!connectionId) throw new Error("Pick the customer's connection.");

  // Re-check first: the list on screen may be stale, and a stock entry shouldn't be
  // saved for a unit someone else already took.
  const { data: fresh, error: e0 } = await supabase
    .from("modems")
    .select("status")
    .eq("id", modem.id)
    .single();
  throwDb(e0);
  if (fresh?.status !== MODEM_STATUS.IN_STOCK)
    throw new Error("That modem is no longer in stock. Pick another unit.");

  const sold = ownership === MODEM_OWNERSHIP.CUSTOMER;
  const price = sold ? Number(options.sellPrice) || 0 : 0;
  const who = options.customerName ? ` — ${options.customerName}` : "";
  const createdAt = stamp(options.date);
  const unitOpts = { unitIds: [modem.id], connectionId, ownership };
  const row = {
    product_id: modem.product_id,
    type: price > 0 ? STOCK_TYPES.SALE : STOCK_TYPES.USAGE,
    quantity: 1,
    price_per_unit: price,
    total_amount: price,
    note: sold ? `Modem sold${who}` : `Free-to-use modem${who}`,
    ...(createdAt ? { created_at: createdAt } : {}),
  };

  if (price > 0 && options.incomeless) {
    // Stock entry only; the money goes through the Pending list.
    const { data, error } = await supabase
      .from("stock_transactions")
      .insert([row])
      .select("id, product_id, type, quantity")
      .single();
    throwDb(error);
    await takeUnitsOut(data, unitOpts);
    return data;
  }

  return addStockTransaction(row, {
    productName: modem.product?.name,
    incomeCategory: options.incomeCategory || "Modem Sale",
    incomeNote: `${modem.product?.name || "Modem"}${who}`,
    paymentMethod: options.paymentMethod,
    units: unitOpts,
    connectionId,
  });
}

// Undo issueUnit(): put the unit back in stock and drop the stock entry (and the sale
// income, if there was one) it made.
export async function undoIssueUnit(unit, result) {
  if (result?.type) {
    await revertOutByTx(result.id);
    await supabase.from("income").delete().eq("stock_tx_id", result.id);
    await supabase.from("stock_transactions").delete().eq("id", result.id);
  } else {
    await supabase
      .from("modems")
      .update({ status: MODEM_STATUS.IN_STOCK, connection_id: null, issued_on: null })
      .eq("id", unit.id);
  }
}

// An FTU modem was collected: back to stock (+1 for tracked products).
export async function returnUnitToStock(modem) {
  const tracked = modem.product_id ? await getTrackedIds([modem.product_id]) : new Set();
  if (!tracked.has(modem.product_id)) return markReturned(modem.id);

  const { error: e1 } = await supabase.from("stock_transactions").insert([
    {
      product_id: modem.product_id,
      type: STOCK_TYPES.RETURN,
      quantity: 1,
      price_per_unit: 0,
      total_amount: 0,
      note: "Free-to-use modem collected",
    },
  ]);
  throwDb(e1);
  return markReturned(modem.id);
}

// "+ Add modem" on the Modems page. A tracked product is a real stock-in (an
// opening-stock entry of 1, so stock and units both go up); anything else is just a
// unit on the list.
export async function addModemToStock({ productId, productName, serial_no, mac_address }) {
  const tracked = productId ? await getTrackedIds([productId]) : new Set();
  if (productId && tracked.has(productId)) {
    return addStockTransaction(
      {
        product_id: productId,
        type: STOCK_TYPES.OPENING,
        quantity: 1,
        price_per_unit: 0,
        total_amount: 0,
        note: "Modem added",
        created_at: stamp(todayISO()),
      },
      { productName, units: { details: [{ serial_no, mac_address }] } }
    );
  }
  return createModem({
    status: MODEM_STATUS.IN_STOCK,
    ownership: MODEM_OWNERSHIP.FTU,
    product_id: productId,
    serial_no,
    mac_address,
  });
}
