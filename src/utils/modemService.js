import { SERVICE_OUTCOME } from "../constants";

export const SERVICE_OUTCOME_LABELS = {
  [SERVICE_OUTCOME.WARRANTY_REPLACED]: "Replaced under warranty",
  [SERVICE_OUTCOME.REPAIRED]: "Repaired",
  [SERVICE_OUTCOME.UPGRADE]: "Upgraded to a new model",
  [SERVICE_OUTCOME.KEEP_FTU]: "Customer keeps an FTU modem",
};

const n = (v) => Number(v) || 0;

// What a service has cost / earned so far (from the amounts kept on the unit).
export function serviceCostSummary(svc = {}) {
  const parcel = n(svc.parcel_out_cost) + n(svc.parcel_back_cost);
  const service = n(svc.service_cost);
  const upgrade = n(svc.upgrade_cost);
  const paid = n(svc.customer_paid);
  return { parcel, service, upgrade, spent: parcel + service + upgrade, paid, net: paid - (parcel + service + upgrade) };
}
