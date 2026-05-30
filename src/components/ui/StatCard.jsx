// A single dashboard metric card with an icon chip and colored accent.
// Now backed by MUI Paper; same props: label, value, icon, accent, onClick, children.
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const accents = {
  green: { bg: "#dcfce7", fg: "#15803d" },
  red: { bg: "#fee2e2", fg: "#b91c1c" },
  blue: { bg: "#dbeafe", fg: "#1d4ed8" },
  amber: { bg: "#fef3c7", fg: "#b45309" },
  indigo: { bg: "#e0e7ff", fg: "#4338ca" },
  purple: { bg: "#f3e8ff", fg: "#7e22ce" },
  orange: { bg: "#ffedd5", fg: "#c2410c" },
};

export default function StatCard({
  label,
  value,
  icon,
  accent = "indigo",
  onClick,
  children,
}) {
  const a = accents[accent] || accents.indigo;
  const clickable = !!onClick;

  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      component={clickable ? "button" : "div"}
      type={clickable ? "button" : undefined}
      sx={{
        width: "100%",
        textAlign: "left",
        p: 2.5,
        borderRadius: 3,
        cursor: clickable ? "pointer" : "default",
        transition: "box-shadow .2s",
        ...(clickable && { "&:hover": { boxShadow: 3 } }),
        // reset native button look when used as a button
        font: "inherit",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
          {label}
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 36,
            width: 36,
            borderRadius: 2,
            fontSize: "1.125rem",
            bgcolor: a.bg,
            color: a.fg,
          }}
        >
          {icon}
        </Box>
      </Box>
      <Typography sx={{ mt: 1.5, fontSize: "1.5rem", fontWeight: 700, color: "text.primary" }}>
        {value}
      </Typography>
      {children}
    </Paper>
  );
}
