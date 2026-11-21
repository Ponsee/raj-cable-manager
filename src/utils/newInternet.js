import { todayISO } from "./ftu";

// Blank values for a New Internet line (used when the line is created / source picked).
export const internetDefaults = () => ({
  customerMode: "existing", // "existing" | "new"
  customerId: "",
  newCustomer: { name: "", phone: "", email: "", address: "" },
  providerId: "",
  values: {},
  installedOn: todayISO(),
  planAmount: "",
  installCharge: "",
  modemKind: "own", // "ftu" | "bought" | "own"
  unitId: "",
  sellPrice: "",
  ownMac: "",
  ownSerial: "",
  firstRecharge: todayISO(),
});

export const unitOptionLabel = (u) =>
  [u.product?.name || "Modem", u.mac_address, u.serial_no && `S/N ${u.serial_no}`]
    .filter(Boolean)
    .join(" · ");
