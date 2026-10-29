// Saves the rows ticked in the Import wizard: customer (created once, reused for
// later rows of the same customer), the connection, and a modem record if the
// row has one. One row failing doesn't stop the rest; failures are returned so
// they can be downloaded, fixed and re-imported (already-saved rows are then
// skipped as duplicates).
import { createCustomer } from "./customersService";
import { createConnection } from "./connectionsService";
import { setLineModem } from "./modemsService";

export async function runImport(rows, { provider, onProgress } = {}) {
  const tempToId = new Map(); // sheet customer (temp id) -> saved customer id
  const failed = [];
  let connections = 0;
  let customers = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let note = "";
    try {
      let customerId = r.customerRef?.id;
      if (!customerId) {
        customerId = tempToId.get(r.customerRef?.temp);
        if (!customerId) {
          const c = await createCustomer(r.customer);
          customerId = c.id;
          tempToId.set(r.customerRef?.temp, c.id);
          customers += 1;
        }
      }
      const conn = await createConnection({
        customerId,
        provider,
        values: r.conn.values,
        installedOn: r.conn.installedOn || null,
        planAmount: r.conn.planAmount === "" ? null : r.conn.planAmount,
        status: r.conn.status,
        lastRechargeOn: r.conn.lastRechargeOn || null,
      });
      connections += 1;
      if (r.modem) {
        note = "Connection saved, but the modem was not set: ";
        await setLineModem(conn.id, r.modem.kind, {
          mac_address: r.modem.mac,
          serial_no: r.modem.serial,
        });
      }
    } catch (e) {
      failed.push({ n: r.n, raw: r.raw, error: note + e.message });
    }
    onProgress?.(i + 1, rows.length);
  }
  return { connections, customers, failed };
}
