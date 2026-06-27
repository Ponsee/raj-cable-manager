// Pending payments / customer credit. A sale where the customer paid part now
// and owes the rest. We record ONLY the money actually received as income (so
// cash stays accurate) and track the outstanding balance here until it's
// collected. If a product is attached, its stock leaves the shelf in full.
import { supabase } from "./supabase";
import { addEntry } from "./financeService";
import { STOCK_TYPES } from "../constants";

const SALE_INCOME_CATEGORY = "Product sales";

// Combine a chosen date with the current time so same-day rows keep their order.
function stamp(dateStr) {
  if (!dateStr) return undefined;
  const now = new Date();
  const d = new Date(dateStr);
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return d.toISOString();
}

export async function getPending() {
  const { data, error } = await supabase
    .from("pending_payments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    ...r,
    balance: Math.max(0, (Number(r.total_amount) || 0) - (Number(r.paid_amount) || 0)),
  }));
}

// Create a credit sale: record the paid part as income (under `category`), drop
// stock for any products handed over, and store the balance owed.
//   - productId/quantity: single product (used by the standalone modal)
//   - stockLines: [{ product_id, quantity, total_amount }] for multi-product
//     credit sales (used by the Income page for New Cable / New Internet)
//   - category: the income category to book the paid amount under (e.g. the
//     income source label). Defaults to "Product sales".
export async function addPending({
  customerName,
  productId,
  productName,
  quantity,
  stockLines,
  description,
  category,
  total,
  paidNow,
  paymentMethod,
  date = "",
}) {
  const totalAmt = Number(total) || 0;
  const paid = Math.min(Number(paidNow) || 0, totalAmt);
  const createdAt = stamp(date);
  const who = customerName?.trim() || "Customer";
  const item = description?.trim() || productName || "Sale";
  const cat = category || SALE_INCOME_CATEGORY;

  // 1) Record the money actually received now (if any) as income.
  if (paid > 0) {
    await addEntry("income", {
      amount: paid,
      category: cat,
      note: `${item} — ${who} (paid ${paid} of ${totalAmt})`,
      date,
      paymentMethod,
    });
  }

  // 2) Drop stock for the products handed over (no income here — already booked).
  const drops =
    stockLines && stockLines.length
      ? stockLines
      : productId && Number(quantity) > 0
      ? [{ product_id: productId, quantity: Number(quantity) || 0, total_amount: totalAmt }]
      : [];
  if (drops.length) {
    await supabase.from("stock_transactions").insert(
      drops.map((d) => ({
        product_id: d.product_id,
        type: STOCK_TYPES.SALE,
        quantity: Number(d.quantity) || 0,
        price_per_unit: (Number(d.total_amount) || 0) / (Number(d.quantity) || 1),
        total_amount: Number(d.total_amount) || 0,
        note: `Credit sale — ${who}`,
        ...(createdAt ? { created_at: createdAt } : {}),
      }))
    );
  }

  // 3) Track the balance owed.
  const closed = paid >= totalAmt;
  const row = {
    customer_name: who,
    product_id: productId || null,
    description: item,
    category: cat,
    total_amount: totalAmt,
    paid_amount: paid,
    status: closed ? "closed" : "open",
    ...(paymentMethod ? { payment_method: paymentMethod } : {}),
    ...(createdAt ? { created_at: createdAt, ...(closed ? { settled_at: createdAt } : {}) } : {}),
  };
  let { error } = await supabase.from("pending_payments").insert([row]);
  // If the category column isn't there yet (migration not updated), insert without it.
  if (error && /category/.test(error.message || "")) {
    /* eslint-disable no-unused-vars */
    const { category: _c, ...rest } = row;
    /* eslint-enable no-unused-vars */
    ({ error } = await supabase.from("pending_payments").insert([rest]));
  }
  if (error) throw error;
}

// Collect (part of) an outstanding balance: books the money as income and bumps
// the paid amount, closing the record once it's fully paid.
export async function collectPayment({ row, amount, paymentMethod, date = "" }) {
  const balance = Math.max(0, (Number(row.total_amount) || 0) - (Number(row.paid_amount) || 0));
  const pay = Math.min(Number(amount) || 0, balance);
  if (pay <= 0) throw new Error("Enter an amount to collect.");
  const createdAt = stamp(date);

  await addEntry("income", {
    amount: pay,
    category: row.category || SALE_INCOME_CATEGORY,
    note: `${row.description || "Sale"} — ${row.customer_name || "Customer"} (balance collected)`,
    date,
    paymentMethod,
  });

  const newPaid = (Number(row.paid_amount) || 0) + pay;
  const closed = newPaid >= (Number(row.total_amount) || 0);
  const { error } = await supabase
    .from("pending_payments")
    .update({
      paid_amount: newPaid,
      status: closed ? "closed" : "open",
      ...(closed ? { settled_at: createdAt || new Date().toISOString() } : {}),
    })
    .eq("id", row.id);
  if (error) throw error;
}

// Remove a pending record. Does NOT reverse income already booked or restock —
// it just drops the credit note. (Used to clear mistakes.)
export async function deletePending(id) {
  const { error } = await supabase.from("pending_payments").delete().eq("id", id);
  if (error) throw error;
}
