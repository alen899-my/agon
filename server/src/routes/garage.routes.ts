import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import { ApiError } from '../utils/http.js';
import { validCustomization } from '../shared/vehicleCustomization.js';

export const GARAGE_KINDS = new Set('f1 car hatch taxi police sport muscle super convertible suv pickup van minivan ambulance fire boxTruck bus hyper track rally drift classic egt coupe wagon limo compact esedan jeep gwagen crossover hummer cruiser buggy semi flatbed towtruck dump tanker raptor camper shuttle stepvan patrol ladder coach minibus'.split(' '));
export const garageRouter = Router();
garageRouter.use(requireAuth);
garageRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT vehicle_kind AS kind, customization, updated_at FROM player_vehicles WHERE player_id = $1 ORDER BY updated_at DESC', [req.player!.id]);
    res.json({ vehicles: rows });
  } catch (error) { next(error); }
});
garageRouter.put('/:kind', async (req, res, next) => {
  try {
    const kind = req.params.kind;
    if (!GARAGE_KINDS.has(kind) || !validCustomization(req.body?.customization)) {
      throw new ApiError(400, 'invalid_build', 'Choose a supported vehicle and valid garage parts.');
    }
    const { rows } = await pool.query(
      `INSERT INTO player_vehicles (player_id, vehicle_kind, customization) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (player_id, vehicle_kind) DO UPDATE SET customization = EXCLUDED.customization, updated_at = now()
       RETURNING vehicle_kind AS kind, customization, updated_at`,
      [req.player!.id, kind, JSON.stringify(req.body.customization)],
    );
    res.json({ vehicle: rows[0] });
  } catch (error) { next(error); }
});
