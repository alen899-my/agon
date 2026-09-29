# Agon — Stickman Evolution

A landscape obstacle platformer starring one large, animated stickman. Move him directly, jump over traps, punch through walls, and reach the exit. Each completed level increases his strength and visibly grows his shoulders, torso, arms, and legs.

## Run on your computer

Install Node.js 22.12+ (Node 24 works), then open your IDE terminal:

```powershell
cd "D:\New Projects\agon"
npm.cmd install
npm.cmd run dev
```

Open the **Local** URL printed in the terminal, normally **http://localhost:5173**. Keep the terminal running. Source edits update the browser automatically. Press **Ctrl+C** to stop.

Dependencies only need installing on the first run or after dependency changes. For subsequent sessions, run `npm.cmd run dev` from the project folder. On macOS/Linux, use `npm` instead of `npm.cmd` and your own project path. The `.cmd` form avoids PowerShell's `npm.ps1` execution-policy error. If Node/npm is not recognized after installation, reopen your terminal.

## Play on your phone

1. Connect your phone and computer to the same Wi-Fi network.
2. Start Vite with LAN access:

   ```powershell
   npm.cmd run dev -- --host 0.0.0.0
   ```

3. On your phone, open the **Network** URL printed by Vite, such as `http://192.168.1.10:5173`. Use your computer's actual address; `localhost` on your phone refers to the phone itself. If access is blocked, allow Node.js through the computer's firewall on your private network.
4. Rotate the phone into **landscape**, then tap **LET'S GO**.
5. Hold **Left/Right** with one thumb and tap **Jump** or hold **Punch** with the other.

Portrait mode shows a rotation prompt and suspends the run. Fullscreen is optional. The fullscreen button requests landscape orientation where supported; otherwise rotate manually and disable your phone's rotation lock. Browser support varies, especially on iOS; fullscreen is not required to play.

## Controls

| Action | Computer | Phone / on-screen buttons |
| --- | --- | --- |
| Move | A / D or left / right arrows | Hold Left / Right |
| Jump | Space, W, or up arrow | Tap Jump |
| Punch | Hold J or X | Hold Punch |
| Pause / resume | P, Escape, or Pause button | Pause / Resume |
| Fullscreen | Fullscreen button | Fullscreen button, when available |
| Theme | Day / Night button | Day / Night button |

The character accelerates and brakes smoothly. Jump is a fresh-press action: release before jumping again. A small jump buffer and coyote-time window make edge jumps forgiving. Punches repeat while held and have a cooldown. Inputs clear on pause, orientation changes, focus loss, and respawn, so release and press again after an interruption.

## Rules and progression

- **Goal:** reach the outlined exit gate at the right end of the course.
- **Spikes:** jump over the high-contrast triangles.
- **Moving saws:** watch their vertical movement and time your crossing.
- **Crushers:** wait for the overhead block to retract; a high-contrast block and exclamation mark indicate the warning/drop window.
- **Pits:** take a running jump across the gaps.
- **Breakable walls:** hold Punch at close range, or jump onto/over them.
- **Health:** start with three hearts. A trap hit or a fall costs one heart and returns you to the last checkpoint. Brief invulnerability protects the respawn.
- **Checkpoints:** pass the flag while grounded to secure a safe restart location. Losing all hearts lets you retry that checkpoint with three hearts.
- **Gains:** collect the diamonds. Every fourth gain restores one heart, up to three. Collected diamonds cannot be farmed by retrying.
- **Growth:** the completion screen previews your next physique. Continue to the next level to receive thicker limbs, broader shoulders, and +1 punch strength. Titles progress through Rookie, Athlete, Powerhouse, and Titan.
- **Later levels:** courses add obstacles and gaps, with modest increases in saw speed and running speed. Course size and hazard speed are capped to preserve playability. Titles cycle and there is no designed final level. Visual growth approaches a maximum so the character remains readable; collision dimensions stay fixed across levels.

Runs are session-only. Reloading starts at level one; only the theme preference persists. There is no multiplayer, sound, saved progression, or physical gamepad support in this version.

## Redesign plan and architecture

The previous automatic tug-of-war economy has been replaced by direct character control. The implementation separates the deterministic simulation from its browser adapter and React UI:

```text
src/
  game/
    State.ts              Shared course, hazard, action, and HUD types
    Input.ts              Independent keyboard/pointer sources and press edges
    Run.ts                Movement, jumping, collisions, combat, and progression
    GameLoop.ts           Fixed 60 Hz updates and interpolated RAF rendering
    Engine.ts             Canvas renderer, camera, resizing, and HUD publication
    Engine.test.ts        Simulation and adapter regression tests
  entities/
    Player.ts             Player state and evolving vector stickman animation
  systems/
    Collision.ts          AABB math and timed hazard bounds
    LevelManager.ts       Course generation and physique/strength progression
  components/
    GameCanvas.tsx        Engine lifecycle, keyboard input, resize, suspension
    TouchControls.tsx     Independent multi-touch direction/action buttons
    FlatHUD.tsx           Health, level, strength, gains, and course progress
    PhysiquePreview.tsx   Next-level character preview
    ThemeToggle.tsx       Light/dark switch
  App.tsx                 Start, pause, defeat, growth, rotation, fullscreen UI
  styles.css              Flat landscape layout, responsive controls, themes
  main.tsx                React entry
tests/
  game.spec.ts            Desktop and phone-sized browser regression tests
playwright.config.ts
vite.config.ts
```

Implementation sequence:

1. Replace armies/resources with a single controllable player and source-aware input.
2. Build fixed-step acceleration, gravity, jumps, collision, punching, and checkpoint rules.
3. Introduce a curated obstacle course and bounded level variations.
4. Draw a large procedural stickman whose anatomy grows each level.
5. Build a landscape-first arena, simultaneous touch controls, rotate prompt, and optional fullscreen.
6. Validate simulation behavior and desktop/mobile browser flows.

### Timing and rendering

Simulation uses a 1/60-second fixed timestep; Canvas rendering interpolates player and camera positions between ticks. Catch-up is limited to six ticks after a stall. Hidden tabs and portrait mode stop the animation loop and clear input; focus loss pauses active gameplay. React receives compact snapshots at 10 Hz and immediately for major changes.

The canvas uses a fixed **1280 × 720** virtual viewport. Uniform scaling and centered letterboxing preserve character proportions at every screen size. A `ResizeObserver`, window resize listener, and DPR listener update the backing store, with DPR capped at two. The camera follows the player with smoothing. DOM controls use native pointer coordinates, capture each pointer independently, and do not require converting screen coordinates into world positions.

Canvas vectors and solid black, white, and neutral gray provide the entire visual style: no colored accents, downloaded image assets, textures, gradients, or shadows. Tailwind remains configured with a root `.dark` variant; matching CSS variables and Canvas palettes provide monochrome light/dark themes. Character details use contrasting trim, and trap shapes and warning symbols distinguish hazards without color.

## Tests and production build

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

`test` checks movement, jumping, input sources, pause, traps, walls, checkpoints, health, growth, timing, and resolution limits. `build` runs strict TypeScript and produces the static site in `dist/`. Open the preview URL printed in the terminal, normally **http://localhost:4173**. Preview is a local build check, not a deployment service.

Browser regression tests:

```powershell
npm.cmd run test:e2e
```

The included Playwright configuration uses an installed **Microsoft Edge** browser with desktop and phone-sized Chromium projects. On systems without Edge, install it with `npx playwright install msedge`, or change the channel in `playwright.config.ts` to your installed Chromium browser. Tests exercise start, keyboard movement/jumping, pause, themes, actual multi-touch event dispatch, cancellation, portrait suspension, and controller target sizes. Screenshots and failure traces are written to ignored `test-results/`.

Phone emulation verifies layout and input logic; real iOS/Android hardware testing and frame-rate profiling are still needed before release. There is no universal 60 fps guarantee.

Browser references: [orientation locking](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock) and [multi-touch Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Multi-touch_interaction).
