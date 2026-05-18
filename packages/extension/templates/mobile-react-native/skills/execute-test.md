---
name: execute-test
description: Generate a TEST-SCRIPT for human testers on iOS and Android React Native builds. Plain-language UAT scenarios derived from PRD ACs, covering happy path, offline, permission, push, deep link, lifecycle, and RTL scenarios.
argument-hint: "<{{EPIC_PREFIX}}-XXXX>"
---

# Test Script for Epic $0

You are the **QA Engineer (QA)** agent — a senior RN test practitioner.
Load your full persona from `.claude/agents/qa.md` before starting.

## Step 0: Pipeline Gate Check
Read and execute `.claude/skills/_gate-check.md`. This skill = phase `execute-test`, epic = `$0`. If gate fails → STOP.

## Steps

1. Read epic: `docs/sdlc/epics/$0/$0.md`
2. Read PRD: `docs/sdlc/epics/$0/PRD.md` — ACs drive scenarios
3. Read template: `docs/sdlc/epics/$0/TEST-SCRIPT.md` or `docs/sdlc/templates/TEST-SCRIPT-TEMPLATE.md`
4. Fill with the sections below.

## Test Script Contents

### Prerequisites

| Item | Value |
|------|-------|
| iOS build | TestFlight build `1.4.0 (42)` — link in TestFlight |
| Android build | Play Console internal track `1.4.0 (42)` — opt-in link |
| OTA channel | `staging` (verify `Updates.runtimeVersion` matches `1.4.0`) |
| Test account 1 | `qa-new@example.com` / `pw-qa-new` (new install, no data) |
| Test account 2 | `qa-existing@example.com` / `pw-qa-existing` (existing user, 50 items) |
| Push payload | Sandbox APNs / FCM sender ready; sample payload in appendix |
| Deep link | `https://app.example.com/items/<id>` and `myapp://items/<id>` |
| Device list | iPhone SE 3 (iOS 15.7), iPhone 14 (iOS 17.4), Pixel 6a (Android 13), Samsung A53 (Android 13) |
| Locale | `en` (primary), `ar` (RTL spot check), `vi` (translation spot check) |
| Network | Wi-Fi + cellular + Network Link Conditioner "3G" profile + airplane mode |

### Scenarios (derived from ACs)

For **every AC**, write a scenario like this. **One action per step. Every step has an expected result.**

---

#### Scenario `$0-S01` — Sign in with email (covers `$0-AC01`)

**Platform**: iOS + Android
**What we're testing**: A registered user signs in with email + password and lands on the Home tab.

**Steps**:
1. Open the app from a cold start (force-quit first).
   **Expected**: Splash screen shows for ≤ 2 s, then the Welcome screen appears with "Sign in" button.
2. Tap the **Sign in** button (centered, blue background, white "Sign in" text).
   **Expected**: Sign-in screen appears with **Email** and **Password** fields, **Forgot password?** link, **Sign in** button (disabled).
3. Type `qa-existing@example.com` into the **Email** field.
   **Expected**: Email field shows the typed value; **Sign in** button still disabled (password empty).
4. Type `pw-qa-existing` into the **Password** field.
   **Expected**: Password field shows masked dots; **Sign in** button enables (blue).
5. Tap **Sign in**.
   **Expected**: Loading spinner over the button for ≤ 2 s, then app transitions to **Home** tab. Top bar shows "Welcome back, QA".

**Pass**: All expected matched.
**Fail**: Any expected diverges — capture screenshot/screen recording.

---

#### Scenario `$0-S02` — Sign in offline (covers `$0-AC01` offline branch)

**Platform**: iOS + Android
**What we're testing**: With no network, the sign-in attempt shows a clear offline message and does not crash.

**Steps**:
1. Enable Airplane mode (Control Center on iOS, Quick Settings on Android).
2. Open the app from cold start.
   **Expected**: Welcome screen appears; offline banner (yellow strip with "No internet connection") shows at the top.
3. Tap **Sign in**, enter `qa-existing@example.com` and `pw-qa-existing`, tap **Sign in**.
   **Expected**: Error toast/banner reads "No internet connection. Reconnect and try again." App does not crash. **Sign in** button re-enables.
4. Disable Airplane mode.
   **Expected**: Offline banner disappears within 5 s.

---

#### Scenario `$0-S03` — Push notification opens deep link (cold start) (covers `$0-AC02`)

**Platform**: iOS + Android
**What we're testing**: A push notification tapped from cold start opens the specific item screen.

**Steps**:
1. Force-quit the app (swipe up on iOS, square button + swipe on Android).
2. From the test console, send the sample push payload targeting `qa-existing@example.com` with `data.itemId="item-42"`.
   **Expected**: Push notification appears on lock screen / notification shade within 30 s, with title "Item updated" and body "Your favorite item changed".
3. Tap the notification.
   **Expected**: App cold-starts; Splash ≤ 2 s; then **Item Detail** screen for item-42 appears (title "Item 42"). No "Home" intermediate visible.

---

#### Scenario `$0-S04` — Permission deny → recovery (covers `$0-AC04`)

**Platform**: iOS + Android
**What we're testing**: A user who denies notifications can re-enable later via Settings deep link from inside the app.

**Steps**:
1. Fresh install (delete + reinstall).
2. Sign in as `qa-new@example.com`.
3. On the onboarding step "Enable notifications", tap **Don't allow** (iOS) / **Don't allow** (Android).
   **Expected**: Onboarding continues without crashing; "Enable notifications later" message visible.
4. Navigate to **Settings → Notifications** inside the app.
   **Expected**: Toggle "Enable notifications" is OFF, helper text reads "Enable in system settings".
5. Tap **Open system settings**.
   **Expected**: System Settings opens at the app's notification preferences.
6. Enable notifications in system settings; return to the app.
   **Expected**: App's **Settings → Notifications** toggle now reads ON within 5 s.

---

(Continue with one scenario per AC.)

### Edge-Case Scenarios (at minimum)

- **Offline cold start**: app launches, cached data shows, banner displays
- **Backgrounded mid-form**: data preserved on resume (MMKV draft)
- **Force-kill + relaunch**: returns to last screen (state restoration)
- **Push while logged out**: deferred deep link; after login, navigates to target
- **Deep link with invalid id**: lands on fallback screen, not crash
- **Slow network (3G)**: skeleton loaders display, no infinite spinner
- **RTL locale (Arabic)**: change device language to `ar`, restart app; verify layout mirrored, icons flipped where appropriate
- **Large font (Dynamic Type AX5 on iOS / 200% on Android)**: no text clipped, no overlap
- **Low memory**: trigger via dev menu; verify no crash and data resumes
- **OTA mid-flight**: simulate OTA update applied after backgrounded; verify smooth resume

### Regression Quick Check

- [ ] Sign in (email + biometric)
- [ ] Sign out
- [ ] Cold start to first screen ≤ 2 s
- [ ] Push tap (cold + warm)
- [ ] Deep link (cold + warm, universal/app + custom scheme)
- [ ] Top-level navigation (Tabs + Stack)
- [ ] Theme switch (light/dark)
- [ ] Locale switch
- [ ] Offline → online sync

### Device / OS Coverage

| Platform | Device | OS | Tester | Result |
|----------|--------|----|--------|--------|
| iOS | iPhone SE 3 | 15.x | | ⬜ |
| iOS | iPhone 14 | 17.x | | ⬜ |
| Android | Pixel 6a | 13 | | ⬜ |
| Android | Samsung A53 | 13 | | ⬜ |

### Verdict / Sign-off

- Pass: all P1 scenarios pass on all P1 devices, no P0/P1 defects open
- Tester name, date, environment, build, verdict
- Defect log: severity, screenshot, ticket reference

## Rules

- Write for someone who has **never seen the code**
- One action per step; concrete UI element copy (exact button text, exact screen name)
- Every step has a concrete expected result — no "see that it works"
- Screenshots/screen recordings for visual checks
- Scenarios are independently runnable — no "continue from previous"
- Specify platform tag (`[iOS]`, `[Android]`, `[Both]`) on every scenario where behavior diverges

## Output

Write to `docs/sdlc/epics/$0/TEST-SCRIPT.md`.
