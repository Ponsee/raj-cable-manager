// Turn raw Postgres / PostgREST errors into messages a person can act on.
// Unknown errors are returned unchanged.
export function friendlyDbError(error) {
  if (!error) return error;
  const text = `${error.message || ""} ${error.details || ""}`;
  if (error.code === "23505") {
    if (/uq_modems_mac/.test(text)) return new Error("That MAC address is already on another modem.");
    if (/uq_modems_serial/.test(text)) return new Error("That serial number is already on another modem.");
    if (/uq_modems_one_per_line/.test(text))
      return new Error("This connection already has a modem. Return or remove it first.");
    if (/providers_name_key/.test(text)) return new Error("A provider with that name already exists.");
  }
  if (error.code === "23503" && /modems_connection_id/.test(text))
    return new Error("A modem is still on this connection. Return or remove the modem first.");
  if (error.code === "23514" && /mac_address/.test(text))
    return new Error("Enter a valid MAC address (e.g. AA:BB:CC:DD:EE:FF).");
  if (error.code === "42P01" || /relation .* does not exist/.test(text))
    return new Error("The customer tables are missing. Run the 2026-10-29 migration in Supabase first.");
  return error;
}

// Throw the friendly version of a Supabase error (no-op when there's none).
export function throwDb(error) {
  if (error) throw friendlyDbError(error);
}
