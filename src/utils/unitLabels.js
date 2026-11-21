import { normalizeMac } from "./ftu";

export const unitLabel = (u) =>
  [u.mac_address, u.serial_no && `S/N ${u.serial_no}`].filter(Boolean).join(" · ") ||
  "Unit (no MAC / serial yet)";

// Check the per-unit rows; returns an error message or null.
export function checkUnitRows(rows) {
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const mac = normalizeMac(rows[i]?.mac_address);
    if (mac === null) return `Unit ${i + 1}: that isn't a valid MAC address.`;
    if (mac) {
      if (seen.has(mac)) return `Unit ${i + 1}: this MAC is entered twice.`;
      seen.add(mac);
    }
  }
  return null;
}
