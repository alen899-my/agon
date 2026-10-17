# Detailed vehicle models

`nascar` is the first dedicated stock-car model. Select **NASCAR Stock Car** in
the vehicle picker. It uses fictional No. 24 AGON Motorsport artwork on a
Next Gen Cup-inspired body; it is not an exact manufacturer or race-team asset.

## Adding another authored car

1. Add its specifications, paint palette and wheel style in `Vehicles.ts`.
2. Create a model module returning the exported `Model` contract from
   `VehicleFactory.ts`. Use metres, Y up, and -Z forward. Wheel centres are
   positioned by the factory at `WR + 0.08`; their spin axis is X.
3. Use `VehicleMeshBuilder` to author curved panels, open arches, glass,
   interior and trim. `surface` supplies continuous normals and UV coordinates;
   `finish` batches panels sharing a material. Give each car its own stations
   and cabin topology rather than stretching the NASCAR mesh.
4. Register the builder in `AUTHORED_MODELS`, plus a fallback `STYLE` entry.
5. Supply `materials` for custom roles, `eye` and `steerPos` for the cockpit,
   and `garageLayout` for customization anchors. The `paint` role uses the
   selected factory colour. Put all glazing in the `glass` role so cockpit
   visibility works. A welded stock car correctly returns no animated doors.

The factory caches geometry per asset kit. Model `dispose` must release its
geometries, custom materials and textures; do not dispose shared kit assets.
Keep decals on sampled panel surfaces, offset by a few millimetres. Keep tyre
and rim geometry centred at the origin inside each side's wheel map.

The same contract can hold authored GLTF mesh geometry in a future asset
pipeline. Photorealistic fidelity still depends on the underlying model,
texture maps, lighting and reflections; a dedicated procedural model alone
does not reproduce a commercial racing game's assets.
