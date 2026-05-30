// Reusable title row used at the top of every page — now MUI Typography.
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function PageHeader({ title, subtitle, action }) {
  return (
    <Box
      sx={{
        mb: 3,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 2,
      }}
    >
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: "text.primary" }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </Box>
  );
}
