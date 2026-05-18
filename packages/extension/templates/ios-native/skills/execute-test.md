---
name: execute-test
description: Generate a TEST-SCRIPT for human testers running UAT on a TestFlight build of the iOS native app. Plain-language scenarios with concrete device steps.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Script for Epic $0

You are the **QA Engineer (QA)** agent — a senior iOS test practitioner.
Load your full persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `execute-test`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read the epic: `docs/sdlc/epics/$0/$0.md`
2. Read the PRD: `docs/sdlc/epics/$0/PRD.md` — acceptance criteria drive scenarios
3. Read the template: `docs/sdlc/epics/$0/TEST-SCRIPT.md` or `docs/sdlc/templates/TEST-SCRIPT-TEMPLATE.md`
4. Fill the test script with the sections below, adapted to the iOS surface(s) in scope

## Test Script Contents

### Prerequisites

| Item | Value |
|------|-------|
| TestFlight build number | (e.g. v1.4.2 (842)) |
| Test account email | (provided per tester) |
| Test account password | (Keychain note / 1Password vault link) |
| Device | iPhone 15 / iPhone SE / iPad / Vision Pro (assigned per tester) |
| iOS version | iOS 17.x / 16.x / 18.x |
| Network | Wi-Fi (test SSID) / Cellular / Airplane Mode (per scenario) |
| Locale | en-US (default) / additional per scenario |
| Time zone | (if relevant) |
| Feature flags | Remote config keys + expected values |
| Clean install required? | yes / no |

### Pre-test Setup
1. Install the TestFlight build (TestFlight app → "<App Name>" → Install / Update)
2. Tap "Settings → General → Software Update" and verify iOS version
3. If clean install required: delete the existing app first (long-press → Remove App → Delete)
4. Sign in with the provided test account when prompted
5. Grant requested permissions per scenario (or deny — depending on which scenario you're running)

### Scenarios (derived from acceptance criteria)

For **each AC** in the PRD, write a scenario:
- **What we're testing** (one sentence, plain language)
- **Step-by-step actions** a non-technical tester can follow
- **Expected result** per step
- **Screenshot / screen recording** where it helps
- Traceability: note the AC ID this scenario covers

Example scenario:

```
### Scenario S-01 — Sign in with email (covers {{EPIC_KEY}}-AC01)

What we're testing: a returning user can sign in using their email + password
and reach the home screen.

Prereq: Clean install of build 842. Wi-Fi connected. Test account
`tester+s01@example.com` exists.

Steps:
1. Tap the "<App Name>" icon on the Home Screen.
   Expected: The launch screen appears, then the "Welcome Back" screen with
   blue "Sign in" and outlined "Create account" buttons.
2. Tap the blue "Sign in" button (centered, lower third of the screen).
   Expected: A new screen titled "Sign in" appears with two text fields
   ("Email", "Password") and a blue "Continue" button.
3. Tap the "Email" field. Type `tester+s01@example.com`.
   Expected: The email appears in the field. The keyboard shows the
   "@" key prominently (email keyboard).
4. Tap the "Password" field. Type `TestPassword!2024`.
   Expected: The characters are masked with dots. A small eye icon at the
   right of the field is visible.
5. Tap the blue "Continue" button at the bottom.
   Expected: A short loading indicator (spinning circle) appears, then
   within 3 seconds the home screen appears titled "<App Name>" with the
   user's avatar in the top-right corner.

Screenshot: Capture the home screen with the avatar visible.
```

Rules for steps:
- One action per step
- Reference exact UI elements: "the blue Save button at the bottom of the screen", "the icon in the top-right showing a gear"
- No jargon, no code, no "tap the CTA"
- Every step has a concrete expected result
- Include exact text fields, button labels, and screen titles — what the tester literally sees

### Edge-Case Scenarios (run at least these on iOS)

Pick the ones that apply:

- **Offline** — Settings → Airplane Mode ON → repeat happy path; expect graceful error message, retry option
- **Slow network** — Settings → Developer → Network Link Conditioner → "3G" → repeat happy path; expect loading indicators, no UI freeze
- **Permission denied** — When the app requests Camera / Photos / Location / Notifications, tap "Don't Allow" → confirm app explains why it's needed and offers Settings link
- **Permission changed mid-session** — Grant initially, then Settings.app → app → toggle off → return to app; confirm graceful handling
- **Background → Foreground** — Mid-flow, swipe up to Home, wait 30s, reopen the app; confirm state is preserved or restored gracefully
- **Kill & Relaunch** — Swipe up + hold, swipe app away, relaunch; confirm sign-in persists (or correctly prompts)
- **Low Power Mode** — Settings → Battery → Low Power Mode ON → confirm app still functions (background tasks may be deferred)
- **Dynamic Type AX5** — Settings → Accessibility → Display & Text Size → Larger Text → max slider → confirm no text truncation, no overlapping
- **VoiceOver** — Settings → Accessibility → VoiceOver ON → navigate the flow with single-tap to select, double-tap to activate; confirm every element announces meaningfully
- **Dark mode** — Settings → Display & Brightness → Dark → confirm colors and contrast remain WCAG AA
- **RTL locale** (if supported) — Settings → General → Language & Region → set to Arabic / Hebrew → confirm layout flips correctly, text is right-aligned

### Regression Quick Check
- [ ] App launches in < 3 seconds on iPhone 15
- [ ] Sign in / sign out works
- [ ] Primary core flow completes end-to-end
- [ ] Push notification tap opens the correct deep-linked screen
- [ ] No new crash dialogs

### Verdict Section

| Scenario | Pass / Fail | Build | Device | iOS | Tester | Notes |
|----------|-------------|-------|--------|-----|--------|-------|
| S-01 | ⬜ | 842 | iPhone 15 | 17.4 | | |
| S-02 | ⬜ | 842 | iPhone SE | 16.7 | | |

**Defect log**:

| Bug ID | Severity | Title | Scenario | Screenshot / Recording | Ticket |
|--------|----------|-------|----------|------------------------|--------|
|        | P0–P3    |       |          |                        |        |

**Sign-off**: tester name, date, device, iOS version, verdict (Pass / Pass-with-issues / Fail)

## Rules

- Write for someone who has **never seen the code or Xcode**
- Steps must be concrete and unambiguous — exact button labels, exact screen titles
- Every step has an expected result — no "see that it works"
- Screenshots / screen recordings called out where the visual check matters
- Scenarios are independently runnable — no "continue from previous scenario" unless explicit
- Always state the TestFlight build number being tested

## Output

Write the completed test script to `docs/sdlc/epics/$0/TEST-SCRIPT.md`.
