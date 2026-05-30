// Centered popup dialog — now backed by MUI Dialog.
// Same API as before: open, onClose, title, children, size ("md" | "lg").
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

const sizes = {
  md: "sm",
  lg: "md",
};

export default function Modal({ open, onClose, title, children, size = "md" }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={sizes[size] || sizes.md}
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontWeight: 600,
          fontSize: "1.05rem",
        }}
      >
        {title}
        <IconButton onClick={onClose} size="small" aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>{children}</DialogContent>
    </Dialog>
  );
}
