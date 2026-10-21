// Group a Form 470's "Services Requested" by the piece of equipment instead of
// listing every USAC line separately (Ari 2026-10-21): a vendor looking at a
// firewall request wants maintenance and managed-broadband for that same
// firewall shown right next to it, not three rows apart.
//
// Pure + dependency-free so it can be unit-tested with plain node/tsx.

export type ServiceRole = "equipment" | "maintenance" | "mibs" | "connectivity" | "voice" | "other";

export interface RawServiceLine {
  service_category?: string | null;
  service_type?: string | null;
  function?: string | null;
  manufacturer?: string | null;
  quantity?: string | null;
  unit?: string | null;
  min_capacity?: string | null;
  max_capacity?: string | null;
  installation_required?: string | null;
}

export interface NormalizedServiceLine {
  role: ServiceRole;
  roleLabel: string;
  equipmentKey: string;
  equipmentLabel: string;
  category: string;
  quantity: string;
  unit: string;
  manufacturer: string;
  speed: string;
  installation: boolean;
  raw: RawServiceLine;
}

export interface ServiceGroup {
  key: string;
  label: string;
  category: string;
  /** "17 Each" — the quantity of the thing being bought, when known. */
  quantityLabel: string;
  /** One slot per role so the UI can show a present/not-requested indicator. */
  roles: Partial<Record<ServiceRole, NormalizedServiceLine[]>>;
  lines: NormalizedServiceLine[];
}

export const ROLE_LABELS: Record<ServiceRole, string> = {
  equipment: "Equipment",
  maintenance: "Basic Maintenance",
  mibs: "Managed Broadband (MIBS)",
  connectivity: "Internet / Data Transmission",
  voice: "Voice",
  other: "Other",
};

/** Roles shown as the three at-a-glance slots on a Category 2 equipment card. */
export const CATEGORY_TWO_ROLES: ServiceRole[] = ["equipment", "maintenance", "mibs"];

const CATEGORY_ONE_KEY = "category-1-connectivity";
const CATEGORY_ONE_LABEL = "Internet and WAN";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function classifyServiceRole(serviceType?: string | null): ServiceRole {
  const t = clean(serviceType).toLowerCase();
  if (!t) return "other";
  if (t.includes("basic maintenance") || t.includes("bmic")) return "maintenance";
  if (t.includes("managed internal broadband") || t.includes("mibs") || t.includes("mbs")) return "mibs";
  if (t.includes("internal connections")) return "equipment";
  if (t.includes("voice")) return "voice";
  if (t.includes("data transmission") || t.includes("internet access")) return "connectivity";
  return "other";
}

// USAC appends boilerplate to the function name ("Firewall Service, Components,
// And Necessary Software And Licenses"). Strip it so the equipment-only line
// and its maintenance line normalise to the same key.
const FUNCTION_NOISE = [
  /\s*,?\s*and necessary software and licenses\b/gi,
  /\s*,?\s*and necessary software\b/gi,
  /\s*,?\s*and related components\b/gi,
  /\s*,?\s*service,?\s*components,?\b/gi,
  /\s*,?\s*service and components\b/gi,
  /\s*,?\s*and components\b/gi,
  /\s+service\b/gi,
];

const EQUIPMENT_MATCHERS: Array<{ key: string; label: string; test: RegExp }> = [
  { key: "wireless-controllers", label: "Wireless Controllers", test: /wireless controller|wlan controller/ },
  { key: "wireless-access-points", label: "Wireless Access Points", test: /access point/ },
  { key: "switches", label: "Switches", test: /switch/ },
  { key: "firewall", label: "Firewall", test: /firewall/ },
  { key: "routers", label: "Routers", test: /router/ },
  { key: "racks", label: "Racks", test: /rack/ },
  { key: "ups", label: "UPS / Battery Backup", test: /uninterruptible|battery backup|\bups\b/ },
  { key: "cabling", label: "Cabling and Connectors", test: /cabl|connector|antenna|patch panel/ },
  { key: "caching", label: "Caching Servers", test: /caching/ },
  { key: "software-licenses", label: "Software and Licenses", test: /licens|software/ },
];

export function normalizeEquipment(functionText?: string | null): { key: string; label: string } {
  const original = clean(functionText);
  let text = original;
  for (const noise of FUNCTION_NOISE) text = text.replace(noise, " ");
  text = text.replace(/\s+/g, " ").replace(/[\s,]+$/, "").trim();
  const probe = (text || original).toLowerCase();

  for (const m of EQUIPMENT_MATCHERS) {
    if (m.test.test(probe)) return { key: m.key, label: m.label };
  }
  const label = text || original || "Other";
  return { key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other", label };
}

function speedOf(line: RawServiceLine): string {
  const min = clean(line.min_capacity);
  const max = clean(line.max_capacity);
  if (min && max && min !== max) return `${min} - ${max}`;
  return min || max || "";
}

export function normalizeServiceLine(line: RawServiceLine): NormalizedServiceLine {
  const role = classifyServiceRole(line.service_type);
  const isCategoryOne = role === "connectivity" || role === "voice";
  const equipment = isCategoryOne
    ? { key: CATEGORY_ONE_KEY, label: CATEGORY_ONE_LABEL }
    : normalizeEquipment(line.function);

  return {
    role,
    roleLabel: ROLE_LABELS[role],
    equipmentKey: equipment.key,
    equipmentLabel: equipment.label,
    category: clean(line.service_category) || (isCategoryOne ? "Category 1" : "Category 2"),
    quantity: clean(line.quantity),
    unit: clean(line.unit),
    manufacturer: clean(line.manufacturer),
    speed: speedOf(line),
    installation: /^(yes|y|true|1)$/i.test(clean(line.installation_required)),
    raw: line,
  };
}

/**
 * Group Form 470 service lines by the equipment they refer to, preserving the
 * order each piece of equipment first appears. Category 1 lines collapse into a
 * single "Internet and WAN" group.
 */
export function groupServices(lines: RawServiceLine[] | null | undefined): ServiceGroup[] {
  const groups: ServiceGroup[] = [];
  const byKey = new Map<string, ServiceGroup>();

  for (const raw of lines || []) {
    if (!raw) continue;
    const line = normalizeServiceLine(raw);
    let group = byKey.get(line.equipmentKey);
    if (!group) {
      group = {
        key: line.equipmentKey,
        label: line.equipmentLabel,
        category: line.category,
        quantityLabel: "",
        roles: {},
        lines: [],
      };
      byKey.set(line.equipmentKey, group);
      groups.push(group);
    }
    group.lines.push(line);
    (group.roles[line.role] ||= []).push(line);
  }

  for (const group of groups) {
    // Prefer the equipment line's quantity for the card title; otherwise the
    // first line that reports one (a maintenance-only request still has a qty).
    const source = group.roles.equipment?.[0] || group.lines.find((l) => l.quantity);
    if (source?.quantity) {
      group.quantityLabel = [source.quantity, source.unit].filter(Boolean).join(" ");
    }
    if (group.key === CATEGORY_ONE_KEY) group.category = "Category 1";
  }

  return groups;
}
