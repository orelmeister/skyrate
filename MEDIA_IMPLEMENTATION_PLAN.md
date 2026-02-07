# SkyRate AI — V3 Media Implementation Plan

> **Date:** Feb 7, 2026  
> **Status:** DRAFT — Awaiting approval before any code changes  
> **Goal:** Replace all placeholder text logos ("S") and emoji icons with V3 generated assets across the entire site

---

## Current State (Screenshots Taken)

| Page | Logo | Icons | Background | Issues |
|------|------|-------|------------|--------|
| Homepage | Text "S" + "SkyRate.AI" | Emojis (⏰📉🎯🔍🤖📊⚡) | Plain CSS gradient | No brand imagery at all |
| Sign-in | Text "S SkyRate AI" | None | Purple left panel | No logo image, no illustration |
| Sign-up | Same as sign-in | None | Same | Same |
| Vendor Portal | Text "S" sidebar | Emojis (📊🏫📈🎯🔎📋⚙️) | White | Generic, no brand feel |
| Consultant Portal | Text "S" sidebar | Emojis | White | Same |
| Footer | Text "S SkyRate.AI" | None | Dark slate | No logo image |

**`frontend/public/` does not exist yet** — no static assets served.

---

## V3 Asset Inventory (23 files + 1 master logo)

### Logos
| File | Size | Use |
|------|------|-----|
| `logo_horizontal.png` (V1 master) | 901 KB | Primary header/footer logo |
| `logo_icon_v3.png` | 99 KB | Favicon, mobile header, collapsed sidebar |
| `logo_dark_v3.png` | 249 KB | Dark backgrounds (footer, hero overlay) |
| `logo_white_v3.png` | 657 KB | Alternative on light backgrounds |

### Icons (8)
| File | Size | Replaces |
|------|------|----------|
| `icon_dashboard_v3.png` | 945 KB | 📊 Dashboard |
| `icon_school_v3.png` | 689 KB | 🏫 My Entities, 🔍 School Search |
| `icon_funding_v3.png` | 729 KB | 📈 FRN Status |
| `icon_vendor_v3.png` | 997 KB | 🎯 Form 470, 🏢 Vendor features |
| `icon_consultant_v3.png` | 999 KB | 📋 Consultant features |
| `icon_appeal_v3.png` | 964 KB | Appeal sections |
| `icon_ai_v3.png` | 782 KB | 🤖 AI features |
| `icon_notification_v3.png` | 1013 KB | 🔔 Notification bell |

### Backgrounds (4)
| File | Size | Use |
|------|------|-----|
| `bg_hero_v3.png` | 914 KB | Homepage hero section |
| `bg_gradient_v3.png` | 921 KB | Auth pages (sign-in/sign-up) |
| `bg_network_v3.png` | 979 KB | Features section / stats |
| `bg_data_v3.png` | 1103 KB | Dashboard header / data sections |

### Illustrations (5)
| File | Size | Use |
|------|------|-----|
| `illus_erate_v3.png` | 784 KB | Homepage "E-Rate Funding is Getting Harder" section |
| `illus_consultant_v3.png` | 1073 KB | "For Consultants" section + consultant portal |
| `illus_vendor_v3.png` | 1177 KB | "For Vendors" section + vendor portal |
| `illus_success_v3.png` | 983 KB | Success stats section / CTA |
| `illus_ai_v3.png` | 193 KB | AI features section |

### Marketing / SEO (3)
| File | Size | Use |
|------|------|-----|
| `og_image_v3.png` | 996 KB | `<meta og:image>` for social sharing |
| `social_linkedin_v3.png` | 312 KB | LinkedIn share asset |
| `social_twitter_v3.png` | 206 KB | Twitter/X share asset |

---

## Implementation Phases

### Phase 1 — Asset Setup & Optimization
**Files created:** directory structure only, no code changes

```
frontend/public/
├── images/
│   ├── logos/
│   │   ├── logo-horizontal.png    ← master (from V1)
│   │   ├── logo-icon.png          ← favicon source
│   │   ├── logo-dark.png          ← dark bg variant
│   │   └── logo-white.png         ← light variant
│   ├── icons/
│   │   ├── dashboard.png
│   │   ├── school.png
│   │   ├── funding.png
│   │   ├── vendor.png
│   │   ├── consultant.png
│   │   ├── appeal.png
│   │   ├── ai.png
│   │   └── notification.png
│   ├── backgrounds/
│   │   ├── hero.png
│   │   ├── gradient.png
│   │   ├── network.png
│   │   └── data.png
│   ├── illustrations/
│   │   ├── erate.png
│   │   ├── consultant.png
│   │   ├── vendor.png
│   │   ├── success.png
│   │   └── ai.png
│   └── marketing/
│       ├── og-image.png
│       ├── linkedin.png
│       └── twitter.png
├── favicon.ico              ← generated from logo-icon.png
└── apple-touch-icon.png     ← generated from logo-icon.png
```

**Optimization step:** All icons (689–1013 KB) are oversized for nav icons. Resize to 64×64px before copying (will drop to ~5–15 KB each). Backgrounds resize to max 1920px wide. Illustrations to max 800px wide. Use sharp/squoosh CLI.

**Estimated total after optimization:** ~1.5 MB (down from ~16 MB raw)

---

### Phase 2 — Reusable Components (2 new files)

**`frontend/components/brand/Logo.tsx`**
```
Props: variant (horizontal|icon|dark|white), size (sm|md|lg|xl), className
Uses next/image for automatic WebP + lazy loading
Renders appropriate logo file based on variant
Default: horizontal, md
```

**`frontend/components/brand/NavIcon.tsx`**
```
Props: name (dashboard|school|funding|vendor|consultant|appeal|ai|notification), size, className
Maps name → /images/icons/{name}.png
Uses next/image with fixed dimensions (24×24 default)
Fallback: renders emoji if image fails to load
```

---

### Phase 3 — Layout & Meta (`layout.tsx`)
- Add `favicon.ico` link
- Add `apple-touch-icon` link
- Add `og:image` → `/images/marketing/og-image.png`
- Add `twitter:image` → `/images/marketing/twitter.png`

**Files changed:** `frontend/app/layout.tsx` (metadata object only)

---

### Phase 4 — Homepage (`page.tsx`)

| Section | Change |
|---------|--------|
| **Header nav** | Replace `<div>S</div> SkyRate.AI` → `<Logo variant="horizontal" size="md" />` |
| **Hero** | Add `bg_hero_v3.png` as background image behind gradient overlay |
| **Pain points** | Add `illus_erate_v3.png` beside "E-Rate Funding is Getting Harder" |
| **Features grid** | Replace emoji icons (🔍🤖📊⚡) → `<NavIcon name="school|ai|funding|dashboard" />` |
| **Consultant section** | Add `illus_consultant_v3.png` in the left/right panel |
| **Vendor section** | Add `illus_vendor_v3.png` in the left/right panel |
| **Stats bar** | Add `bg_network_v3.png` as section background |
| **CTA section** | Add `illus_success_v3.png` |
| **Footer** | Replace text logo → `<Logo variant="dark" size="sm" />` |

**Files changed:** `frontend/app/page.tsx`

---

### Phase 5 — Auth Pages

**`frontend/app/sign-in/page.tsx`**
- Left panel: Replace text "S SkyRate AI" → `<Logo variant="white" size="lg" />`
- Left panel: Add `bg_gradient_v3.png` as background behind purple overlay
- Left panel: Add `illus_ai_v3.png` below the tagline text

**`frontend/app/sign-up/page.tsx`**
- Same changes as sign-in

**Files changed:** 2 files

---

### Phase 6 — Portal Sidebars & Nav

**`frontend/app/vendor/page.tsx`**
- Sidebar header: Replace `<div>S</div> SkyRate AI` → `<Logo variant="icon" size="sm" />` + text
- Nav items: Replace all emojis with `<NavIcon />`:
  - 📊 → `<NavIcon name="dashboard" />`
  - 🏫 → `<NavIcon name="school" />`
  - 📈 → `<NavIcon name="funding" />`
  - 🎯 → `<NavIcon name="vendor" />`
  - 🔎 → `<NavIcon name="school" />`
  - 📋 → `<NavIcon name="consultant" />`
  - ⚙️ → keep as-is (settings gear emoji is fine)
- Notification bell: Replace with `<NavIcon name="notification" />`

**`frontend/app/consultant/page.tsx`**
- Same sidebar pattern as vendor
- Nav icons mapped appropriately

**`frontend/app/dashboard/page.tsx`**
- Same sidebar/header treatment if applicable

**Files changed:** 3 files

---

### Phase 7 — Performance & Polish

1. **next.config.js** — Add image domain config if needed
2. **Verify** all `next/image` usage has proper `width`/`height` or `fill` props
3. **Lighthouse audit** — Ensure no LCP regression from large images
4. **Responsive check** — Logo sizes for mobile vs desktop
5. **Dark mode** — Logo variant switching if dark mode is added later

**Files changed:** `next.config.js` (minor)

---

## File Change Summary

| Phase | Files Changed | New Files | Risk |
|-------|--------------|-----------|------|
| 1 — Assets | 0 | 24 images + favicon | None (just files) |
| 2 — Components | 0 | 2 (Logo.tsx, NavIcon.tsx) | Low |
| 3 — Layout | 1 (layout.tsx) | 0 | Low (metadata only) |
| 4 — Homepage | 1 (page.tsx) | 0 | Medium (largest page) |
| 5 — Auth | 2 (sign-in, sign-up) | 0 | Low |
| 6 — Portals | 3 (vendor, consultant, dashboard) | 0 | Medium |
| 7 — Config | 1 (next.config.js) | 0 | Low |

**Total: 8 existing files modified, 26 new files created**

---

## Execution Order (Priority)

1. ✅ Phase 1 — copy + optimize assets (no risk, prerequisite for all)
2. ✅ Phase 2 — Logo + NavIcon components (enables all other phases)
3. ✅ Phase 3 — Layout meta (instant SEO/social win)
4. ✅ Phase 4 — Homepage (highest visibility page)
5. ✅ Phase 5 — Auth pages (first impression for new users)
6. ✅ Phase 6 — Portals (logged-in experience)
7. ✅ Phase 7 — Performance audit

**Estimated implementation time:** ~30–45 min (mostly Phase 4 + 6)

---

## ⚠️ Key Decisions Needed

1. **Icon sizing** — Should nav icons be 24×24 or 20×20 px?
2. **Background opacity** — Hero/auth backgrounds: full image or with gradient overlay?
3. **Logo in sidebar** — Icon-only or horizontal logo in collapsed state?
4. **Image optimization** — Use build-time sharp optimization or pre-optimize before commit?

---

## Not In Scope

- No new pages created
- No backend changes
- No routing changes
- No functionality changes
- No color palette changes (keeping existing Tailwind classes)
- Marketing assets (linkedin, twitter PNGs) just deployed to public/ for future use
