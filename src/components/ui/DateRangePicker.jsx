// A single date-range control: one field shows "start – end"; clicking it opens
// a dropdown with quick shortcuts (Last 7 days, This month, ...) on the left and
// a calendar on the right. Built on the FREE @mui/x-date-pickers (no Pro license).
//
// Public API is unchanged: props { start, end, onChange } use plain "YYYY-MM-DD"
// strings, and we still export currentMonthRange() + inRange().
import { useState } from "react";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Popover from "@mui/material/Popover";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { PickerDay } from "@mui/x-date-pickers/PickerDay";

dayjs.extend(isBetween);

const FMT = "YYYY-MM-DD"; // stored / passed-out format
const DISPLAY = "DD/MM/YYYY"; // shown to the user
const toStr = (d) => (d ? d.format(FMT) : "");
const toDay = (s) => (s ? dayjs(s) : null);

// Quick-pick ranges. Each returns { start, end } as strings.
const SHORTCUTS = [
  { label: "Today", get: () => ({ start: toStr(dayjs()), end: toStr(dayjs()) }) },
  {
    label: "Last 7 days",
    get: () => ({ start: toStr(dayjs().subtract(6, "day")), end: toStr(dayjs()) }),
  },
  {
    label: "Last 30 days",
    get: () => ({ start: toStr(dayjs().subtract(29, "day")), end: toStr(dayjs()) }),
  },
  {
    label: "This month",
    get: () => ({ start: toStr(dayjs().startOf("month")), end: toStr(dayjs()) }),
  },
  {
    label: "Last month",
    get: () => {
      const lm = dayjs().subtract(1, "month");
      return { start: toStr(lm.startOf("month")), end: toStr(lm.endOf("month")) };
    },
  },
  {
    label: "This year",
    get: () => ({ start: toStr(dayjs().startOf("year")), end: toStr(dayjs()) }),
  },
];

export default function DateRangePicker({ start, end, onChange }) {
  const [anchorEl, setAnchorEl] = useState(null);
  // While picking, `pending` holds the first clicked day (start of a new range).
  const [pending, setPending] = useState(null);

  const startDay = toDay(start);
  const endDay = toDay(end);
  const open = Boolean(anchorEl);

  const closePopover = () => {
    setAnchorEl(null);
    setPending(null);
  };

  // Text shown in the single field.
  const fieldText =
    startDay && endDay
      ? `${startDay.format(DISPLAY)} – ${endDay.format(DISPLAY)}`
      : startDay
        ? startDay.format(DISPLAY)
        : "";

  const applyShortcut = (range) => {
    onChange(range);
    closePopover();
  };

  // Two-click range selection on the calendar.
  const handleDayPick = (day) => {
    if (!pending) {
      // First click: remember the start, clear any old range visually.
      setPending(day);
    } else {
      const s = day.isBefore(pending) ? day : pending;
      const e = day.isBefore(pending) ? pending : day;
      onChange({ start: toStr(s), end: toStr(e) });
      closePopover();
    }
  };

  // Highlight: committed [start,end] range, OR the single pending day.
  const rangeStart = pending || startDay;
  const rangeEnd = pending ? null : endDay;

  // Custom day cell that shades the in-between days.
  const Day = (dayProps) => {
    const { day, ...other } = dayProps;
    const isStart = rangeStart && day.isSame(rangeStart, "day");
    const isEnd = rangeEnd && day.isSame(rangeEnd, "day");
    const between =
      rangeStart && rangeEnd && day.isBetween(rangeStart, rangeEnd, "day", "()");
    return (
      <PickerDay
        {...other}
        day={day}
        selected={isStart || isEnd}
        sx={
          between
            ? { bgcolor: "primary.light", color: "primary.contrastText", borderRadius: 0 }
            : undefined
        }
      />
    );
  };

  return (
    <>
      <TextField
        size="small"
        label="Date range"
        value={fieldText}
        placeholder={DISPLAY.toUpperCase()}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        inputProps={{ readOnly: true }}
        sx={{ minWidth: 230, cursor: "pointer", bgcolor: "background.paper" }}
        InputProps={{
          sx: { cursor: "pointer" },
          endAdornment: (
            <InputAdornment position="end">
              <CalendarTodayIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
        }}
      />

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={closePopover}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { borderRadius: 3, mt: 0.5 } } }}
      >
        <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" } }}>
          {/* Shortcuts column */}
          <Stack
            spacing={1}
            sx={{ p: 2, minWidth: 150, bgcolor: "action.hover" }}
            justifyContent="flex-start"
          >
            {SHORTCUTS.map((s) => {
              const r = s.get();
              const active = r.start === start && r.end === end;
              return (
                <Chip
                  key={s.label}
                  label={s.label}
                  clickable
                  color={active ? "primary" : "default"}
                  variant={active ? "filled" : "outlined"}
                  onClick={() => applyShortcut(r)}
                />
              );
            })}
            {(start || end) && (
              <Chip
                label="Clear"
                clickable
                variant="outlined"
                onClick={() => applyShortcut({ start: "", end: "" })}
              />
            )}
          </Stack>

          <Divider orientation="vertical" flexItem />

          {/* Calendar */}
          <Box>
            {pending && (
              <Box sx={{ px: 2, pt: 1.5, fontSize: 13, color: "text.secondary" }}>
                Start: {pending.format(DISPLAY)} — now pick the end date
              </Box>
            )}
            <DateCalendar
              value={rangeStart}
              onChange={handleDayPick}
              slots={{ day: Day }}
            />
          </Box>
        </Box>
      </Popover>
    </>
  );
}

// Default range used across the app: 1st of the current month → today.
export function currentMonthRange() {
  return {
    start: dayjs().startOf("month").format(FMT),
    end: dayjs().format(FMT),
  };
}

// Helper: is an ISO timestamp within [start, end]? Empty bounds always pass.
export function inRange(ts, start, end) {
  const d = dayjs(ts).format(FMT);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}
