// Reuse formatters across rows without changing locale or timezone semantics.
const defaultDate = new Intl.DateTimeFormat(undefined);
const utcDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const utcDateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
});

function format(formatter: Intl.DateTimeFormat, value: Date) {
  // Date#toLocale* returns this string for invalid dates; Intl#format throws.
  return Number.isNaN(value.getTime()) ? "Invalid Date" : formatter.format(value);
}

export const formatDefaultDate = (value: Date) => format(defaultDate, value);
export const formatUtcDate = (value: Date) => format(utcDate, value);
export const formatUtcDateTime = (value: Date) => format(utcDateTime, value);
