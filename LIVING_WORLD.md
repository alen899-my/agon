# Living district

People pause for model-generated conversations, face their listeners, and return to their routines afterward. Room conversations use OpenRouter with roles, nearby activities, construction/race state and up to eight previously spoken turns as context. Each response contains two to four alternating turns, displayed one at a time. There is no canned dialogue fallback. Missing credentials, scripted mode, timeouts and invalid responses leave characters silent while activities continue. Race countdown numbers remain mechanical UI signals.

Enable room dialogue with AI_MODE=llm, OPENROUTER_API_KEY and OPENROUTER_MODEL in server/.env. Conversation generation has a separate ceiling of four requests per minute per room, one in flight, a ten-second timeout, and a twenty-second scene-start interval. Interrupted scenes discard late responses. Memory lasts for the current world session. The authenticated /api/dialogue endpoint is prepared for solo clients; the browser connection is not yet enabled. Offline/background pedestrians therefore use silent activities unless a dialogue provider is supplied.

Incidents interrupt conversations so the medic can respond. The plaza has a performer and spectators; mechanics use a repair pose, and photographers finish a photo stop before choosing the next landmark. Movement and activities remain deterministic.

Walking strides follow distance travelled and headings blend between snapshots. Landmark spawns are moved to clear ground. Both street racers and solo opponents follow rounded lanes, brake before bends, accelerate progressively, and animate steering and brake lights. The countdown grid matches the driving path, preventing a launch teleport. Racing remains path-following AI, not a full vehicle-contact or overtaking simulation.

The room director owns people, wanted levels, incidents, site claims and completed construction stages. Solo embeds the same deterministic rules without loading the server's HTTP or database modules. OpenRouter remains server-only.

## Try it

Run the client with npm run dev. Run the server from server/ with npm run dev. Set AI_MODE=scripted in server/.env for deterministic room testing. The existing boot migration creates buildings_delta; npm run migrate can also apply it explicitly.

Construction lots are at (64, 23) and (-48, 20). Builders alternate collecting supplies and working beside the lot. Four stages take roughly two minutes. A stage waits if a person or vehicle occupies its footprint. Role uniforms and names identify walkers; short conversations appear nearby. Walkers and construction appear on the district map.

A stopped suspect on foot causes the responding officer to leave the cruiser and approach. The parked cruiser remains visible. An arrest still requires the three-second hold.

## Authority and persistence

agent_state includes walkers and complete site snapshots, so reconnecting clients recover state even after missing a build_delta. Each delta has a site ID, monotonic stage, and collider box. Walking, driving, and bullet ray checks use per-simulation builtBoxes. Leaving a room clears these boxes and all agent state.

Only two approved lots exist. Their full footprints are tested against road clearance, water, existing buildings and props. Completed stages persist per room in buildings_delta with a composite key and a greatest-stage upsert. The director restores them before its first tick; failed reads and writes retry. Partial-stage progress is transient. Normal boot applies the idempotent schema change.

## Dispatch budget

New crimes, wanted decay, arrest completion, site milestones, lost suspects, and active goals older than 45 seconds schedule decisions. A settled world with no events makes zero calls. Identical contexts reuse goals for 60 seconds. A revision guard rejects responses overtaken by new events. Steering and interactions continue while the brain is unavailable.

The server retains a minimum six-second request interval, eight requests per minute per room, a ten-second timeout, closed-action sanitization, and scripted fallback. OPENROUTER_MODEL selects routine dispatch; optional OPENROUTER_ESCALATION_MODEL selects the stronger model for multi-suspect situations or repeated arrests. No key is included in the client bundle.

## Rendering and verification

Walker navigation uses a bounded grid search when direct steering is blocked. Blast incidents carry the explosion position.

Walkers share rig geometry and cached outfit materials. Distant walkers skip animation beyond 90 metres; tags disappear earlier. Low quality hides walker meshes beyond 90 metres. Removed tags and vehicle materials are disposed.

Focused tests:

- Client: node node_modules/vitest/vitest.mjs run src/world/AgentSim.test.ts src/world/LivingWorld.test.ts
- Server (from server/): node node_modules/vitest/vitest.mjs run src/agents src/realtime/agents.test.ts src/realtime/hub.test.ts
- Browser: node node_modules/@playwright/test/cli.js test tests/living-world.spec.ts --project=desktop

The browser test checks pursuit, foot arrest, construction completion, both collider paths, and low-quality render limits. Database persistence is covered with mocked repository IO; validating it against a live database is a separate integration check.
