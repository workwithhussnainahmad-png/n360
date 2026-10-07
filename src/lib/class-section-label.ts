export function displaySectionName(sectionName: string | null | undefined) {
  const value = sectionName?.trim() || "";
  return /^whole\s+class$/i.test(value) ? "" : value;
}

export function formatClassSection(
  className: string | null | undefined,
  sectionName: string | null | undefined,
  separator = " - ",
) {
  const classValue = className?.trim() || "";
  const sectionValue = displaySectionName(sectionName);
  if (!classValue) return sectionValue;
  return sectionValue ? `${classValue}${separator}${sectionValue}` : classValue;
}
