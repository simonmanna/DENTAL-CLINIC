/**
 * Optional time-of-day bounds for a report's date range.
 *
 * The start time narrows the first day and the end time the last day (the
 * backend treats the end time as inclusive of its whole minute). Each box is
 * disabled until its date is picked, since a time without a date is ignored.
 */
export function ReportTimeRange({
  startTime,
  endTime,
  hasStartDate,
  hasEndDate,
  onChange,
  inputClassName,
}: {
  startTime: string;
  endTime: string;
  hasStartDate: boolean;
  hasEndDate: boolean;
  onChange: (patch: { startTime?: string; endTime?: string }) => void;
  inputClassName: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        Time
      </label>
      <div className="flex items-center gap-1">
        <input
          type="time"
          value={startTime}
          disabled={!hasStartDate}
          onChange={(e) => onChange({ startTime: e.target.value })}
          aria-label="From time"
          title={hasStartDate ? "From time (optional)" : "Pick a From date first"}
          className={`${inputClassName} w-28 disabled:opacity-50`}
        />
        <span className="text-muted-foreground/60 text-xs">–</span>
        <input
          type="time"
          value={endTime}
          disabled={!hasEndDate}
          onChange={(e) => onChange({ endTime: e.target.value })}
          aria-label="To time"
          title={hasEndDate ? "To time (optional)" : "Pick a To date first"}
          className={`${inputClassName} w-28 disabled:opacity-50`}
        />
      </div>
    </div>
  );
}
