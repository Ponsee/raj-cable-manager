import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import InputAdornment from "@mui/material/InputAdornment";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ProviderFieldInputs from "../customers/ProviderFieldInputs";
import { providerDefaults } from "../../utils/ftu";
import { unitOptionLabel } from "../../utils/newInternet";
import { newInternetTotals } from "../../services/newInternetService";
import { formatCurrency } from "../../utils/format";

const money = {
  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
};

// The New Internet entry: customer + provider details + plan / install + modem.
// `refs` = { loading, customers, providers, units } loaded by the Add Income popup.
export default function NewInternetFields({ line, onChange, refs }) {
  const provider = refs.providers.find((p) => p.id === (line.providerId || refs.providers[0]?.id));
  const fields = provider?.fields || [];
  // The provider's defaults (e.g. BSNL password) show until the person types over them.
  const values = { ...providerDefaults(fields), ...line.values };
  const nc = line.newCustomer;
  const setNew = (k, v) => onChange({ newCustomer: { ...nc, [k]: v } });
  const { plan, install, modem, total } = newInternetTotals(line);

  const customerOptions = refs.customers.map((c) => ({
    id: c.id,
    label: `${c.name}${c.phone ? ` · ${c.phone}` : ""}`,
  }));
  const unit = refs.units.find((u) => u.id === line.unitId) || null;

  return (
    <div className="space-y-3">
      {refs.error && <p className="text-xs text-red-600">Couldn't load customers / providers: {refs.error}</p>}
      {/* 1. Customer */}
      <div className="space-y-2 rounded-lg bg-gray-50 p-2">
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          color="primary"
          value={line.customerMode}
          onChange={(_e, v) => v && onChange({ customerMode: v })}
        >
          <ToggleButton value="existing" sx={{ textTransform: "none" }}>Existing customer</ToggleButton>
          <ToggleButton value="new" sx={{ textTransform: "none" }}>+ New customer</ToggleButton>
        </ToggleButtonGroup>
        {line.customerMode === "existing" ? (
          <Autocomplete
            size="small"
            options={customerOptions}
            loading={refs.loading}
            value={customerOptions.find((o) => o.id === line.customerId) || null}
            onChange={(_e, o) => onChange({ customerId: o?.id || "" })}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => <TextField {...params} label="Customer (search name or phone)" />}
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <TextField label="Name *" size="small" value={nc.name} onChange={(e) => setNew("name", e.target.value)} />
            <TextField label="Phone *" size="small" value={nc.phone} onChange={(e) => setNew("phone", e.target.value)} />
            <TextField label="Email" size="small" value={nc.email} onChange={(e) => setNew("email", e.target.value)} />
            <TextField label="Address" size="small" value={nc.address} onChange={(e) => setNew("address", e.target.value)} />
          </div>
        )}
      </div>

      {/* 2. Provider + its fields */}
      <TextField
        select
        label="Provider"
        size="small"
        value={provider?.id || ""}
        onChange={(e) => {
          const p = refs.providers.find((x) => x.id === e.target.value);
          onChange({ providerId: e.target.value, values: providerDefaults(p?.fields) });
        }}
        fullWidth
      >
        {refs.providers.map((p) => (
          <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
        ))}
      </TextField>
      {provider && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ProviderFieldInputs
            fields={fields}
            values={values}
            onChange={(k, v) => onChange({ values: { ...values, [k]: v } })}
          />
        </div>
      )}

      {/* 3. Dates + amounts */}
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Install date" type="date" size="small" value={line.installedOn}
          onChange={(e) => onChange({ installedOn: e.target.value })} InputLabelProps={{ shrink: true }} />
        <TextField label="First recharge date" type="date" size="small" value={line.firstRecharge}
          onChange={(e) => onChange({ firstRecharge: e.target.value })} InputLabelProps={{ shrink: true }} />
        <TextField label="Plan amount (0 if free)" type="number" size="small" value={line.planAmount}
          onChange={(e) => onChange({ planAmount: e.target.value })} inputProps={{ min: 0, step: "any" }} InputProps={money} />
        <TextField label="Install charge (0 if free)" type="number" size="small" value={line.installCharge}
          onChange={(e) => onChange({ installCharge: e.target.value })} inputProps={{ min: 0, step: "any" }} InputProps={money} />
      </div>

      {/* 4. Modem */}
      <div className="space-y-2 rounded-lg bg-gray-50 p-2">
        <p className="text-sm font-medium text-gray-700">Modem</p>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          color="primary"
          value={line.modemKind}
          onChange={(_e, v) => v && onChange({ modemKind: v })}
        >
          <ToggleButton value="ftu" sx={{ textTransform: "none" }}>FTU (ours)</ToggleButton>
          <ToggleButton value="bought" sx={{ textTransform: "none" }}>Customer bought</ToggleButton>
          <ToggleButton value="own" sx={{ textTransform: "none" }}>Own modem</ToggleButton>
        </ToggleButtonGroup>

        {(line.modemKind === "ftu" || line.modemKind === "bought") && (
          <>
            <Autocomplete
              size="small"
              options={refs.units}
              loading={refs.loading}
              value={unit}
              onChange={(_e, u) => onChange({ unitId: u?.id || "" })}
              getOptionLabel={unitOptionLabel}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="No modem units in stock"
              renderInput={(params) => <TextField {...params} label="Modem unit in stock (search MAC / serial)" />}
            />
            {!refs.loading && refs.units.length === 0 && (
              <p className="text-xs text-amber-700">
                No modem units are in stock. Switch on "Track each unit" for the modem product, or add
                one on the Modems page. Or choose "Own modem".
              </p>
            )}
          </>
        )}
        {line.modemKind === "bought" && (
          <TextField label="Selling price of the modem (0 if free)" type="number" size="small" value={line.sellPrice}
            onChange={(e) => onChange({ sellPrice: e.target.value })} inputProps={{ min: 0, step: "any" }} InputProps={money} />
        )}
        {line.modemKind === "own" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <TextField label="Modem MAC (optional)" size="small" value={line.ownMac}
              onChange={(e) => onChange({ ownMac: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" />
            <TextField label="Serial (optional)" size="small" value={line.ownSerial}
              onChange={(e) => onChange({ ownSerial: e.target.value })} />
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="space-y-1 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
        <div className="flex justify-between"><span>Plan</span><span>{formatCurrency(plan)}</span></div>
        <div className="flex justify-between"><span>Install charge</span><span>{formatCurrency(install)}</span></div>
        {line.modemKind === "bought" && (
          <div className="flex justify-between"><span>Modem</span><span>{formatCurrency(modem)}</span></div>
        )}
        <div className="flex justify-between border-t border-green-200 pt-1 font-semibold">
          <span>Total income</span><span>{formatCurrency(total)}</span>
        </div>
        {total === 0 && (
          <p className="text-xs text-green-700">Nothing to charge — the customer and connection are saved with no income entry.</p>
        )}
      </div>
    </div>
  );
}
