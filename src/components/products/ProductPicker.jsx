// Searchable product dropdown that shows the product image in each option.
// Used wherever you pick a product. Plain "select existing" mode by default.
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";

// Reusable option row: image + name + code/stock line. Reused by add-new pickers.
export function renderProductOption(props, p) {
  const { key, ...rest } = props;
  return (
    <Box
      component="li"
      key={key}
      {...rest}
      sx={{ display: "flex", gap: 1.5, alignItems: "center" }}
    >
      <Avatar
        src={p.image_url || undefined}
        variant="rounded"
        sx={{ width: 34, height: 34, bgcolor: "grey.100", fontSize: 16 }}
      >
        {p.image_url ? null : "📦"}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ fontSize: 14, lineHeight: 1.2 }}>{p.name}</Box>
        <Box sx={{ fontSize: 12, color: "text.secondary" }}>
          {p.code ? `${p.code} · ` : ""}
          {p.stock != null ? `${p.stock} ${p.unit || "in stock"}` : p.unit || ""}
        </Box>
      </Box>
    </Box>
  );
}

export default function ProductPicker({
  products = [],
  value, // product id
  onChange, // (id) => void
  label = "Product",
  size = "small",
  sx,
  disabled = false,
}) {
  return (
    <Autocomplete
      options={products}
      value={products.find((p) => p.id === value) || null}
      onChange={(_e, val) => onChange(val?.id || "")}
      getOptionLabel={(p) =>
        p?.name ? `${p.name}${p.code ? ` (${p.code})` : ""}` : ""
      }
      isOptionEqualToValue={(o, v) => o.id === v.id}
      renderOption={renderProductOption}
      size={size}
      sx={sx}
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder="Search…" />
      )}
    />
  );
}
