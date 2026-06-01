// Consistent button used across the whole app — backed by MUI.
// Keeps the same `variant` names (primary/secondary/danger/ghost). Pass
// `loading` to show a spinner + disable the button while an action runs.
import MuiButton from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";

const MAP = {
  primary: { variant: "contained", color: "primary" },
  secondary: { variant: "outlined", color: "inherit" },
  danger: { variant: "contained", color: "error" },
  ghost: { variant: "text", color: "inherit" },
};

export default function Button({
  variant = "primary",
  className = "",
  loading = false,
  disabled = false,
  children,
  ...props
}) {
  const m = MAP[variant] || MAP.primary;
  return (
    <MuiButton
      variant={m.variant}
      color={m.color}
      className={className}
      disabled={disabled || loading}
      startIcon={
        loading ? <CircularProgress size={16} color="inherit" /> : undefined
      }
      {...props}
    >
      {children}
    </MuiButton>
  );
}
