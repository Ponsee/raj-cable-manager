// App-wide MUI theme. Colors match the original Tailwind look (indigo primary)
// so the switch to MUI doesn't change the brand feel.
import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: { main: "#4f46e5" }, // indigo-600
    error: { main: "#ef4444" }, // red-500
    success: { main: "#16a34a" }, // green-600
    background: { default: "#f9fafb" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    // Keep buttons calm and consistent with the old design.
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 10 } },
    },
  },
});

export default theme;
