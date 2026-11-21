// Income -> New Internet: ONE entry creates the customer (if new), the connection
// with the provider's details, the modem (FTU / sold from stock / the customer's
// own) and the income. If a later step fails, the earlier ones are undone so a
// customer is never left without a connection, or a modem assigned to nobody.
import { supabase } from "./supabase";
import { createCustomer } from "./customersService";
import { createConnection, deleteConnection } from "./connectionsService";
import { setLineModem } from "./modemsService";
import { issueUnit } from "./modemFlowService";
import { addEntry } from "./financeService";
import { addPending } from "./pendingService";
import { revertOutByTx } from "./modemStockService";
import { normalizeMac } from "../utils/ftu";
import { CONNECTION_STATUS, MODEM_OWNERSHIP, MODEM_STATUS } from "../constants";

export const NEW_INTERNET_CATEGORY = "New Internet";

const num = (v) => (v === "" || v == null ? 0 : Number(v) || 0);

// The money for a line: plan + install charge + (modem price when we sell one).
export function newInternetTotals(line) {
  const plan = num(line.planAmount);
  const install = num(line.installCharge);
  const modem = line.modemKind === "bought" ? num(line.sellPrice) : 0;
  return { plan, install, modem, total: plan + install + modem };
}

// line: the form values (see NewInternetFields). ctx: { date, provider, customerName, unit }
//   provider: the provider row (id + fields); unit: the chosen in-stock modem unit (ftu / bought).
export async function saveNewInternet(line, { date, provider, customerName, unit }) {
  const undo = []; // run newest-first if something fails
  const { plan, install, modem: modemPrice, total } = newInternetTotals(line);
  const noteSuffix = line.note?.trim() ? ` (${line.note.trim()})` : "";
  const who = customerName || "Customer";

  try {
    // 1. Customer
    let customerId = line.customerId;
    if (line.customerMode === "new") {
      const c = await createCustomer(line.newCustomer);
      customerId = c.id;
      undo.push(() => supabase.from("customers").delete().eq("id", c.id));
    }

    // 2. Connection (provider details, install date, first recharge date)
    const conn = await createConnection({
      customerId,
      provider,
      values: line.values || {},
      installedOn: line.installedOn || null,
      planAmount: line.planAmount === "" ? null : line.planAmount,
      status: CONNECTION_STATUS.ACTIVE,
      lastRechargeOn: line.firstRecharge || null,
    });
    undo.push(() => deleteConnection(conn.id));

    // 3. Modem
    if (line.modemKind === "own") {
      const mac = normalizeMac(line.ownMac);
      if (mac === null) throw new Error("Enter a valid MAC address for the customer's modem.");
      await setLineModem(conn.id, "customer", { mac_address: mac, serial_no: line.ownSerial });
    } else if (line.modemKind === "ftu" || line.modemKind === "bought") {
      if (!unit) throw new Error("Pick the modem unit.");
      const sold = line.modemKind === "bought";
      const res = await issueUnit(
        unit,
        conn.id,
        sold ? MODEM_OWNERSHIP.CUSTOMER : MODEM_OWNERSHIP.FTU,
        {
          sellPrice: modemPrice,
          paymentMethod: line.paymentMethod,
          customerName: who,
          date,
          incomeCategory: NEW_INTERNET_CATEGORY,
          incomeless: !!line.pending, // the money goes through Pending instead
        }
      );
      if (res?.type) {
        // A stock entry was made: undo = put the unit back, drop the sale income + entry.
        undo.push(async () => {
          await revertOutByTx(res.id);
          await supabase.from("income").delete().eq("stock_tx_id", res.id);
          await supabase.from("stock_transactions").delete().eq("id", res.id);
        });
      } else {
        // A unit with no tracked product: only the unit changed.
        undo.push(() =>
          supabase
            .from("modems")
            .update({ status: MODEM_STATUS.IN_STOCK, connection_id: null, issued_on: null })
            .eq("id", unit.id)
        );
        if (sold && modemPrice > 0 && !line.pending) {
          const inc = await addEntry("income", {
            amount: modemPrice,
            category: NEW_INTERNET_CATEGORY,
            note: `Modem sold — ${who}${noteSuffix}`,
            date,
            paymentMethod: line.paymentMethod,
            connectionId: conn.id,
          });
          undo.push(() => supabase.from("income").delete().eq("id", inc.id));
        }
      }
    }

    // 4. Money
    if (line.pending) {
      // Part payment: only what was paid now is income; the balance goes to Pending.
      await addPending({
        customerName: who,
        description: `New Internet — ${provider.name}${noteSuffix}`,
        category: NEW_INTERNET_CATEGORY,
        total,
        paidNow: line.paidNow,
        paymentMethod: line.paymentMethod,
        date,
        connectionId: conn.id,
      });
    } else {
      const rows = [
        [plan, `${provider.name} plan — ${who}${noteSuffix}`],
        [install, `${provider.name} install charge — ${who}${noteSuffix}`],
      ];
      for (const [amount, note] of rows) {
        if (!(amount > 0)) continue;
        const inc = await addEntry("income", {
          amount,
          category: NEW_INTERNET_CATEGORY,
          note,
          date,
          paymentMethod: line.paymentMethod,
          connectionId: conn.id,
        });
        undo.push(() => supabase.from("income").delete().eq("id", inc.id));
      }
    }

    return { customerId, connectionId: conn.id };
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
