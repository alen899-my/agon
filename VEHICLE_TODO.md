# Driving update

- [x] Progressive acceleration, braking/reverse, speed-sensitive steering and handbrake drift.
- [x] Mouse movement looks around without dragging; keyboard camera controls remain available.
- [x] Six selectable vehicle types with different dimensions and performance.
- [x] Desktop keyboard controls; mobile steering buttons and separate pedals.
- [x] Cockpit view, clear windshield and animated steering wheel.
- [x] Updated hints and physics/browser verification.

## Controls

- W / Up: accelerate; S / Down: brake, then reverse.
- A / D or Left / Right: steer.
- Space: handbrake / drift while driving; jump on foot.
- Mouse / laptop trackpad: click the world once to capture look, then move without holding a button. Escape releases capture and pauses. Q / C rotates the camera using the keyboard.
- LOOK settings: separate mouse/trackpad and touch sensitivity, invert vertical look, and reset to defaults. Preferences persist locally.
- V: switch cockpit / chase view; E: enter / exit.
- N: cycle sedan, sport coupe, SUV, pickup, cargo van and city bus while stopped in an open area.
- Mobile: left/right steering buttons, gas, brake/reverse and drift; swipe the world to look.

## Validation

- Production build and all 72 unit tests pass.
- Eleven desktop/mobile browser tests pass; five cases are skipped on devices where they do not apply.
- Browser checks cover desktop touch-control hiding, mouse look, cockpit, vehicle switching, mobile multitouch/release, walking, map and pause flows.

## Collision and glitch fixes

- [x] Match collision bounds to oriented vehicle bodies, including long buses and parked vans.
- [x] Sweep movement and rotation, keep the last clear pose, and preserve sideways travel along walls.
- [x] Block roadside props, detect sideways drift impacts, and allow reversing away after contact.
- [x] Accumulate traffic distance without teleporting when speed changes; stop traffic before overlapping vehicles.
- [x] Use consistent bounds for bumper warnings, vehicle changes, walking and safe exits.
- [x] Ignore invalid time steps and subdivide long updates.
- [x] Prevent mouse re-entry from suddenly rotating the camera.
- [x] Match basketball green-meter calculations to reachable shot speeds, including the initial shot and distant corners.

## Camera input fixes

- [x] Captured relative mouse/trackpad movement continues past screen edges without holding a button.
- [x] Escape and focus loss pause cleanly; menus release capture without double-toggling pause.
- [x] Mobile swipe distance scales with viewport size and remains independent of joystick/pedal touches.
- [x] Cancelled touches and suspended play release camera input.
- [x] Saved sensitivity and invert-Y settings; camera settings and physics overlays suspend gameplay input.
- [x] Capture denial falls back to hover-look and keyboard camera controls.
- [x] Browser tests cover real capture, Escape, map/pause/focus transitions, denied capture, and preference persistence.

Physical laptop trackpad hardware was not available for testing; browser relative-motion and touch paths were verified.
