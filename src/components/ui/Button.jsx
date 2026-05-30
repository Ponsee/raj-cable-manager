// Consistent button used across the whole app — now backed by MUI.
// Keeps the same `variant` names (primary/secondary/danger/ghost) so every
// existing caller works unchanged.
import MuiButton from "@mui/material/Button";

const MAP = {
  primary: { variant: "contained", color: "primary" },
  secondary: { variant: "outlined", color: "inherit" },
  danger: { variant: "contained", color: "error" },
  ghost: { variant: "text", color: "inherit" },
};

export default function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}) {
  const m = MAP[variant] || MAP.primary;
  return (
    <MuiButton
      variant={m.variant}
      color={m.color}
      className={className}
      disableRipple={false}
      {...props}
    >
      {children}
    </MuiButton>
  );
}
