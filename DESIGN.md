# Fine Design System

## 1. Direction

Fine is a quiet native workspace: a light glass navigation rail beside a
single uninterrupted white terminal canvas. The memorable moment is the
material boundary itself — translucent navigation ends at one hairline, then
the conversation becomes pure paper.

Fine preserves session identities, resume behavior, model choices and terminal
output. Presentation and metadata scheduling stay separate from the child CLI.

## 2. Color and material

- `canvas`: system white (`NSColor.textBackgroundColor`)
- `ink`: system label color; terminal ANSI uses the role palette below
- `secondaryInk`: system secondary label color
- `divider`: black at 7% opacity
- `hoverFill`: black at 4% opacity
- `selectedFill`: white at 62% opacity
- `selectedRim`: white at 72% opacity
- `controlFill`: black at 5% opacity
- `controlActive`: system label color
- `sidebarMaterial`: SwiftUI `.ultraThinMaterial`
- `glassSheenTop`: white at 30% opacity
- `glassSheenMiddle`: white at 10% opacity
- `glassTintBottom`: cool system window gray at 8% opacity
- `glassEdge`: black at 8% opacity

Outside the new-conversation home, glass is restricted to the sidebar. It uses native material over a truly
transparent window, a restrained top-left luminance veil, and a one-point
refractive edge beside the workspace. It uses no outer drop shadow. The
terminal never uses blur, tint, or translucent text. The home composer stays
clear system Liquid Glass (macOS 26+), tinted per theme (October 2026): night
`#090B13` at 62% on dark, milk white at 55% on paper. The earlier 12% tint let
the placeholder vanish into city lights; an opaque card read better but lost the
glass, so only the tint deepened. The suggestion pills use the same glass and
tint. Older systems get the same colour over ultra-thin material; Reduce
Transparency makes it solid.

## 3. Typography

- UI body: SF Pro system, 13 pt, medium
- Section label: SF Pro system, 10 pt, semibold, +0.25 tracking
- Home eyebrow: 12 pt with a breathing cyan signal dot, above the title
- Home title: Pretendard Regular, 30–38 pt, -1.4 tracking; the last word carries a
  pale cyan → lavender gradient (deep teal → violet on paper). Words resolve
  from a 10 pt blur one by one (70 ms stagger, critically damped) when the line changes
- Home prompt: Pretendard Regular 16 pt; captions Pretendard 11.5 pt
- Machine voice (key hints, Latin-only chips, timers): SF Mono 11–12 pt. Labels
  containing Hangul use Pretendard instead — monospaced fonts have no Hangul,
  and the fallback kept monospaced spaces, so words drifted apart
- Prompt: SF Pro system, 16 pt, regular
- Metadata: SF Pro system, 10 pt, medium, tabular where numeric
- Terminal: libghostty (Menlo 13 with the system Hangul fallback) and the role-based ANSI palette
- Terminal status: SF Mono, 10 pt, medium

Korean text must remain legible without artificial uppercase transformation.

## 4. Geometry and spacing

- Base unit: 4 pt
- Sidebar width: 248 pt
- Window split gap: 0 pt
- Divider: 0 pt in layout; the sidebar draws its edge inward
- Sidebar content inset: 12 pt
- Row height: 36 pt minimum
- Row radius: 8 pt
- Compact control radius: 7 pt
- Home composer radius: 22 pt
- Home content width: 720 pt maximum; 24–48 pt adaptive outer inset
- Titlebar clearance: 40 pt
- Terminal content inset: 12 pt block, 16 pt inline
- Terminal status rail: 20 pt above an 8 pt bottom inset
- Claude footer crop: one terminal row, replaced by the Fine status rail
- Model switch popover: 330 pt wide, 16 pt internal padding
- Home model picker: 500 pt wide, 320 pt high; 128 pt provider rail,
  fixed header, and one internally scrolling model list

The app owns one fixed-height shell. Sidebar lists own their vertical scroll;
the terminal owns the remaining workspace. The white workspace remains
edge-to-edge, while terminal glyphs sit inside a quiet reading inset.

## 5. Reusable primitives and states

### `FineSplitShell`

Two columns with no gap: `GlassSidebar` at 248 pt, a one-point divider, and
`WhiteWorkspace` filling the rest.

States: home, live terminal, terminal error.

### `GlassSidebar`

Native ultra-thin material extending behind the transparent titlebar. A
three-stop luminance veil gives the glass visible depth without obscuring the
wallpaper, and the right edge draws a one-point inner boundary without taking
layout width. It contains the new-conversation action, open sessions, and
recent transcripts. Harness marks use 12 pt glyphs inside 15 pt slots.

States: normal, hover, selected, drop target.
Open conversations support local drag ordering with a subtle target outline;
reordering saves once at drop and preserves selection and the existing PTY.
VoiceOver provides move-up and move-down actions. Long names stay on one line.

### `SidebarRow`

Unboxed at rest. Hover uses `hoverFill`; selected uses `selectedFill` plus the
single-pixel `selectedRim`. Close controls appear only on hover or selection.

### `WorkspaceComposer`

One restrained white input surface with a hairline border. Model, effort,
proxy, and send controls live on the same lower baseline. No floating card
shadow and no decorative hero icon.

States: empty, focused, ready, loading catalog, router offline.

### `CompactControl`

Text-first rounded rectangle with `controlFill`, 7 pt radius, 25 pt height.
Hover increases fill slightly; active state uses ink.

### `HarnessControl`

A three-segment control at the head of the composer row: Claude, Codex, or OpenCode.
It decides which command the terminal runs and which catalog the model picker
shows. Codex launches its stock CLI without the Claude router. All harnesses
use their explicit permission-skip launch option. Switching resets the model to
that harness's default.

### `ModelPickerPanel`

A compact two-level selector instead of a single long menu. The fixed top
segment separates connected/plan models from free-tier models and disappears
when a catalog has only one tier. A narrow provider rail groups Claude, Codex,
Kimi, Gemini, Alibaba, OpenRouter, and NVIDIA explicitly; only the selected
provider's models scroll in the detail pane. Alibaba Free belongs to the free
segment, while Alibaba Plan remains in the connected segment. OpenCode shows a
single OpenCode rail entry with whatever `opencode.json` whitelists. Codex uses
its installed model catalog and persists an explicit model/effort selection.

Every catalog starts with "기본 (터미널과 동일)": no model or effort flag, no
router. That option is the terminal's plain `ccv -y`, `codex`, or `opencode`.

The panel is presented as an in-window overlay (`FineOverlay`), never as an
`NSPopover`. Two crash reports (2026-09-02, 2026-09-03) showed SwiftUI opening
the popover inside `NSHostingView.layout()`, where AppKit rebuilt the window
ordering group and a ViewBridge `NSRemoteView` observer threw. An overlay
inside the existing window cannot reach that path. The scrim is 6% black,
the card uses the workspace fill with the glass edge stroke, a 22 pt shadow,
and dismisses on scrim click or Escape.

States: connected tab, free tab, provider selected, model selected, empty
provider, default option, keyboard focus.

### `WhiteTerminal`

Edge-to-edge xterm surface (white / neutral #1e1e1e). The 16 ANSI slots are
painted by role, not by name, because Claude's `*-ansi` themes emit 97 for
emphasis, 37 for secondary text, 94 for inline code and links, 91 for its
accent, and 31/33/34/36 for syntax: so light mode maps 97 to near-black and 37
to gray. Accents are a few calm glamour-like hues (claude-mods' glamour-dark was
the reference; nothing is injected into the agent). One palette serves every
harness, with a 4.5:1 minimum contrast so Codex's truecolor (dark-tuned)
highlighting stays legible in light mode. ANSI 100 remains the submitted-prompt
surface. Sessions drop an inherited NO_COLOR. `TerminalColorCaptureTests`
(FINE_CAPTURE=1) renders real captured Claude/Codex screens in both themes.
The glyph grid uses the terminal content inset so prompts do not touch the
window edge. Fine clips Claude Code's final built-in hint row and replaces it
with a compact status rail showing the session's actual provider/model and
effort; this avoids adding a second status row. OpenCode sessions crop nothing:
that TUI draws its own input and status rows at the bottom. The status rail is interactive:
hover adds only a subtle neutral fill, and click opens a compact native model
and effort picker. Applying a selection resumes the same transcript with the
new configuration rather than creating an unrelated conversation.

States: loading/blank, interactive, resumed, error.

## 6. Motion and interaction

- Session selection: immediate; terminal views are never animated through reparenting
- Hover: opacity/fill only, 120–160 ms equivalent
- Buttons: no scale, bounce, shimmer, or perpetual animation
- Home panorama: a fixed 160 × 72 character grid. Values change at 8 fps as the
  mountain scene travels through the cells, with a seamless 180-second loop
- Cache the tiny glyph atlas and update only changed character cells. Keep one
  960 × 720 RGBA frame buffer (2.6 MiB) plus the current display image; no video
  decoder, browser engine, translating layer, or per-frame SwiftUI state
- Pause the panorama when its window is occluded/minimized, in Low Power Mode,
  or with Reduce Motion; Reduce Transparency removes the decorative layer
- Reduced-motion users receive the same layout with no essential motion loss
- Every icon button keeps a tooltip and a minimum 24 pt target

## 7. Accessibility constraints

- Text and terminal content target WCAG AA contrast on white
- Selection is communicated by fill and weight, not color alone
- Open rows have a small running-state dot and no harness mark or leading bubble.
  Recent rows retain their trailing harness mark. Open rows receive native mouse
  events across their full 37 pt height, including padding, for selection and drag.
  A single selection block slides between rows with WorkspaceManager's 0.3 s
  critically damped spring. The work area crossfades over 150 ms. Reduce Motion
  disables both. Drag targets mark the boundary above/below a row, and dropping
  inserts there without exchanging the two sessions.
- Keyboard shortcuts and native menu behavior remain unchanged
- Focusable controls use native focus handling
- Korean labels must not truncate before the close/status affordances

## 8. Accepted debt and replacement triggers

- The sidebar material uses the system compositor rather than a custom
  refraction shader. Replace only if macOS changes native material rendering or
  the sidebar becomes unreadable over common wallpapers.
- The terminal is libghostty (shared with sm through `../GhosttyTerminal`), not an
  xterm web view. The web view cost one WebKit process per tab (about 650 MB for
  seven tabs, 2026-10-31). The package is a path dependency, so Fine builds only on
  a machine that has `../GhosttyTerminal` with its framework built; decide a public
  build route (prebuilt framework in releases) before the next public release.
- Sessions run through an interactive login shell (`zsh -ilc`) so that a
  Finder-launched Fine sees the same `~/.zshrc` environment as a terminal:
  provider keys, `~/.opencode/bin` ahead of Homebrew, and the same `ccv`. The
  shell `exec`s the agent, so nothing interactive lingers. Replace with a
  captured environment snapshot only if shell startup ever becomes visible.


## New-conversation home (September 2026)

Light and dark mode each remember their own background: all 15 ascii.rest landscapes,
a small Aurora window, the user's photo, or a plain surface. Light defaults
to the forest; dark keeps the existing photo (including the user's Overdose
artwork). Images stay outside the repository.

Panoramas sit at the top of the workspace and fade into the theme's base colour
using the same mask and lower gradient as the original dark album composition.
ASCII panoramas take min(62% of width, 90% of height) with proportional cover
scaling; the artwork mask holds full strength to 60% and the page fade starts at
70% of the window, so the scene reads behind the glass composer. Home text picks
white/black from the median luminance under it (the gap color of a dot field)
and carries a soft wide halo instead of a hard outline. The bottom-right glass
chip names the current background and credits ascii.rest.

When the home background is a full-window scene (artwork mode), the scene is
window-level: it bleeds under the sidebar (`homeArtworkBleed`) and stays alive
behind conversation tabs (`homeInBackground` hides only the home content). The
sidebar becomes a veil over it (base 55%/60% plus a faint even lift, no sheen),
and the scene page blurs the sidebar band itself (`#sidebar-blur`, 6px) so one
renderer animates both sides with no material tint. Behind a conversation the
whole scene blurs (10px) and the terminal draws on a 60% black glass with a
transparent xterm background and the dark role palette (`TerminalPalette.overArtwork`).
The composer is clear glass with a faint tint; legibility comes from text that
inverts with the measured luminance behind it plus an opposite-colour halo, not
from a heavier tint. Composer controls take their surface from the glass's
scheme (`fineControlSurface`), not the window's. Small Aurora, plain, and Reduce
Transparency keep the opaque terminal and desktop-glass sidebar.

The sidebar collapses (toggle beside the appearance toggle, ⌃⌘S). It is one view
moved by offset: collapsed it slides off the leading edge; a 6pt hot zone on the
left edge brings it over the workspace (same veil, light shadow, and the
terminal and its black glass are cleared beneath it); pinning from there only
moves the workspace. Clicking empty home background enters a viewing mode: the
greeting, composer, chip and sidebar fade away and the scene stays; any click
or key brings them back (the key is consumed) and refocuses the composer. The white/blue radial
glow behind the composer is removed; only the artwork mask and lower fade remain. The small Aurora option preserves a complete
2:1 scene between the greeting and composer, in either theme. The original
200 × 100 grids, palettes and 15 fps motion are unchanged. Reduce Transparency
removes decorative artwork. The input remains a light surface in light mode.

The bottom-right background button and View → Home Background open an in-window
picker with independent light/dark choices. Command–Left/Right on the home cycles
available backgrounds on key release; holding either chord for 0.5 seconds opens
the picker without changing the current background. Repeat events are consumed,
and losing window focus cancels the pending press. Plain arrow keys and terminal
line-navigation chords remain untouched. Command–Up/Down select the previous/next
conversation using the same shared navigation path as the existing CLI.

The unmodified TypeScript scene and canvas renderer are vendored under
`Sources/Fine/Scenes/ascii-rest/` with the MIT license and pinned commit/hashes.
A small lifecycle adapter is bundled with `bun build Sources/Fine/Scenes/scene.ts
--target browser --format iife --outfile Sources/Fine/Scenes/scene.js`. Normal
Swift builds use the checked-in JavaScript and need no JavaScript toolchain or
network access. A nonpersistent WKWebView loads only local files, with a CSP
blocking network requests. Native visibility, Reduce Motion and Low Power Mode
pause playback; resuming continues from the same scene time. The artwork never
accepts pointer input. A single live WebView survives selection changes. The next
scene renders before a 220 ms ease-out crossfade releases the previous pixels.
Interrupting a fade starts from the composited presentation, not an old target;
only two canvas layers exist, and only the current scene animates. Scene clocks
survive switching away and back. Reduced Motion switches without the fade.

Picker tiles use bundled static PNGs generated from the original canvas with
`swift scripts/generate-scene-previews.swift Sources/Fine/Scenes`. No live WebViews
are created by the picker. Arrow keys follow its three-column grid, Return closes
it, Escape dismisses, and focus returns to the composer. Changing the picker mode
also changes the visible app mode, so preview and saved choice stay consistent.

Headline, note and caption choose the stronger black/white contrast against their
actual screen region: image crop, artwork mask, theme scrim, and lower fade are
included. Scene first frames provide stable lighting estimates; photos use their
actual pixels. A small text shadow separates glyphs from the halftone pattern
without restoring the removed white/blue bloom.

The headline and supporting sentence are centered above the composer. The
composer remains bounded at 720 pt, with 22 pt text insets and a visible focus
rim. Model controls use 30 pt height and the send button uses a 34 pt target.
Harness selection moves onto its own row when the controls' ideal widths no
longer fit. Session context sits below the composer, outside the control row.
Short windows scroll the composition vertically; long prompts scroll within
the native multiline field after eight lines. Existing selection persistence,
model discovery, submission, terminal sessions, and sidebar styling are retained.

Reduce Transparency removes the decorative ASCII layers and makes the composer
opaque. Decorative drawing ignores hits and is hidden from accessibility.
The model picker retains its existing in-window overlay to avoid the AppKit
popover crash path. HomePresentationTests render minimum, normal, and wide
workspace sizes plus a long-input state to
`.build/home-design-review/` for visual inspection.


## Home direction (October 27, 2026)

Reference: the "kurage" ASCII home. Every ASCII scene is dots on black, so a
workspace with a panorama behind it is night-based in both themes: the page
base, fade, scrim and composer are dark even when the app is light. The light
theme's ivory fade under a night scene had split the screen in two and turned
the conversation tab's black glass muddy at the bottom. Paper remains for plain
and small-window backgrounds.

Home text keeps the theme's ink. It no longer flips black/white from sampled
luminance, which split one sentence into differently lit words. Legibility comes
from a faint, wide ellipse of the page base colour blurred 30 pt behind each text
block — just enough to quiet the dots, never a visible plate.

Below the composer, outlined pills offer `/찾기` and up to three recent
conversations that are not already open (click resumes). Controls are outlined
pills (9 pt radius, 32 pt high), the find action is a ghost icon, the right
edge shows `↩ 보내기 · ⌥↩ 줄바꿈` and an outlined ↗ send square that fills
with ink once there is text. A static hairline grid (28 pt, 3.5% white) sits over
night scenes, masked by the same fade.

Sidebar status dots speak only when something differs: breathing cyan while
working, amber when the agent waits on you, red on error, a hollow ring when the
process stopped. A running, quiet tab shows no dot.

Recent times are the last exchanged message, not the file modification time:
resuming a Claude transcript appends bookkeeping records, and Codex bumps
`updated_at` on resume, so restarting Fine had stamped every open conversation
"just now". Claude uses the last user/assistant `timestamp`; Codex uses `recency_at`.

## Mixed-harness recent conversations

Recent rows share one chronological list across Claude, Codex, and OpenCode.
The text begins at the row inset; a relative timestamp and a 15 pt monochrome
vector logo sit at the right edge. Each logo occupies a fixed 18 pt slot, so
long titles truncate before the metadata. The native button exposes both title
and harness to accessibility and shows them in its tooltip. Template assets
follow the interface ink; no brand colors or raster images are used.

## 9. Resource budget and demand loading

- Recent conversations initially publish 30 rows. The lazy list requests the next
  30 at its end; one extra record determines whether another page exists.
- Claude transcript bodies are read only for the requested window of titles and
  explicitly open older sessions. Unchanged files read zero body bytes; append
  updates read only new bytes in 64 KiB chunks. Cache only short titles, file
  identity/offsets, and an unfinished line capped at 256 KiB. Oversized tool
  records are skipped and large completed-line buffers are released.
- Transcript discovery still enumerates filename/mtime metadata for sorting.
  The first read of a requested transcript scans the file to preserve its latest
  summary. If first-page I/O becomes material, replace this with a persistent
  title index; do not silently drop older summary records.
- Native Codex/OpenCode queries use read-only SQLite cursors and stop after the
  requested number of valid titles, including past placeholder/empty titles.
- Coalesce overlapping recent scans. Pause periodic file/database and model
  catalog refreshes while all Fine windows are hidden; unresolved session IDs
  may still be detected so restoration remains reliable.
- Hidden terminal output crosses the WebKit bridge at 100 ms intervals. Visible
  typing echoes remain immediate; active redraws keep existing 8 ms coalescing
  and cursor/IME transaction guards. No CLI output is discarded. Large one-off
  output buffers are released after delivery, and unchanged layouts skip refit.
- Keep xterm's existing bounded scrollback and render only the selected terminal.
  The CLI owns transcript loading; Fine does not load a second message history.

## Model selection polish

Harness and model controls share a 30 pt height. A moving selection surface
connects harness changes; picker presentation uses a restrained fade and scale.
Single-provider catalogs omit the provider rail, large catalogs offer search,
and model labels wrap to two lines. The composer uses a borderless glass surface.
Reduce Motion removes decorative movement.

Codex runtime resume identity follows the unique writable rollout in the PTY process
group (including npm's native child). Read-only history and overlapping writers
never replace the saved identity. This also updates the next relaunch after
`/resume` or a fork. The existing metadata timer performs this bounded local
lookup; if its cost becomes material, replace lsof with native process-FD queries.
