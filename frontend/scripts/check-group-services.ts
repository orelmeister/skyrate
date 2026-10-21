// Standalone check for lib/groupServices.ts using the 7 real USAC service lines
// from Form 470 #270000162 (American Dream Charter School Ii) that Ari walked
// through on the 2026-10-21 call.
//
// Run from skyrate.ai/frontend:
//   npx tsc lib/groupServices.ts scripts/check-group-services.ts --outDir .tmp-check --module commonjs --target es2020 --moduleResolution node
//   node .tmp-check/scripts/check-group-services.js

import { groupServices, type RawServiceLine } from "../lib/groupServices";

const LINES: RawServiceLine[] = [
  { service_category: "Category 2", service_type: "Internal Connections", function: "Wireless Access Points And Necessary Software And Licenses", quantity: "17", unit: "Each", manufacturer: "Juniper Networks Or Equivalent" },
  { service_category: "Category 2", service_type: "Basic Maintenance Of Internal Connections", function: "Firewall Service And Components", quantity: "1", unit: "Each", manufacturer: "No Preference" },
  { service_category: "Category 1", service_type: "Data Transmission And/Or Internet Access", function: "Internet Access And Data Transmission Service", quantity: "1", unit: "Each", min_capacity: "500 Mbps", max_capacity: "999 Mbps" },
  { service_category: "Category 2", service_type: "Basic Maintenance Of Internal Connections", function: "Wireless Access Points", quantity: "17", unit: "Each", manufacturer: "No Preference" },
  { service_category: "Category 2", service_type: "Internal Connections", function: "Switches And Necessary Software And Licenses", quantity: "3", unit: "Each", manufacturer: "Juniper Networks Or Equivalent" },
  { service_category: "Category 2", service_type: "Internal Connections", function: "Firewall Service, Components, And Necessary Software And Licenses", quantity: "1", unit: "Each", manufacturer: "Meraki Or Equivalent" },
  { service_category: "Category 2", service_type: "Basic Maintenance Of Internal Connections", function: "Switches", quantity: "3", unit: "Each", manufacturer: "No Preference" },
];

const EXPECTED: Record<string, { label: string; roles: string[]; quantityLabel: string }> = {
  "wireless-access-points": { label: "Wireless Access Points", roles: ["equipment", "maintenance"], quantityLabel: "17 Each" },
  firewall: { label: "Firewall", roles: ["equipment", "maintenance"], quantityLabel: "1 Each" },
  switches: { label: "Switches", roles: ["equipment", "maintenance"], quantityLabel: "3 Each" },
  "category-1-connectivity": { label: "Internet and WAN", roles: ["connectivity"], quantityLabel: "1 Each" },
};

const groups = groupServices(LINES);
let failures = 0;

function check(name: string, ok: boolean, detail: string) {
  if (!ok) failures += 1;
  console.log(`[${ok ? "OK" : "FAIL"}] ${name} ${detail}`);
}

check("group count", groups.length === 4, `got ${groups.length}, want 4`);
check(
  "every line kept",
  groups.reduce((n, g) => n + g.lines.length, 0) === LINES.length,
  `got ${groups.reduce((n, g) => n + g.lines.length, 0)}, want ${LINES.length}`,
);

for (const [key, want] of Object.entries(EXPECTED)) {
  const g = groups.find((x) => x.key === key);
  if (!g) {
    check(key, false, "group missing");
    continue;
  }
  const roles = Object.keys(g.roles).sort();
  check(
    key,
    g.label === want.label &&
      g.quantityLabel === want.quantityLabel &&
      roles.join(",") === [...want.roles].sort().join(","),
    `label="${g.label}" qty="${g.quantityLabel}" roles=[${roles.join(",")}]`,
  );
}

const c1 = groups.find((g) => g.key === "category-1-connectivity");
check("category 1 speed", c1?.lines[0]?.speed === "500 Mbps - 999 Mbps", `speed="${c1?.lines[0]?.speed}"`);

const wap = groups.find((g) => g.key === "wireless-access-points");
check(
  "equipment manufacturer preserved",
  wap?.roles.equipment?.[0]?.manufacturer === "Juniper Networks Or Equivalent",
  `manufacturer="${wap?.roles.equipment?.[0]?.manufacturer}"`,
);

console.log("RESULT:", failures === 0 ? "PASS" : `FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
