import { describe, expect, it } from 'vitest';
import { AgentSim } from './AgentSim';
import { CharacterFactory } from './characters/CharacterFactory';
import { Simulation } from './Simulation';

function tick(sim: Simulation, agents: AgentSim, n: number): void {
  for (let i = 0; i < n; i++) {
    sim.update(1 / 60);
    agents.update(1 / 60, sim, true, false);
  }
}

describe('AgentSim solo director (police slice)', () => {
  it('scores a ped kill as wanted=2 and dispatches a cruiser', () => {
    const sim = new Simulation();
    sim.begin();
    const agents = new AgentSim();
    sim.hitSeq++;
    sim.hitKill = true;
    tick(sim, agents, 5);
    expect(sim.wanted).toBe(2);
    expect(agents.cops.length).toBe(1);
    expect(agents.cops[0].pursuing).toBe(true);
  });

  it('busts a stationary suspect after a 3s hold', () => {
    const sim = new Simulation();
    sim.begin();
    // Wait on foot by the police post road so the cruiser closes in fast.
    sim.x = 76;
    sim.z = 33;
    const agents = new AgentSim();
    sim.hitSeq++;
    sim.hitKill = true;
    tick(sim, agents, 600);
    expect(sim.bustedSeq).toBe(1);
    expect(sim.wanted).toBe(0);
    expect(sim.x).toBeCloseTo(12, 0);
  });

  it('decays wanted back to calm when the suspect hides', () => {
    const sim = new Simulation();
    sim.begin();
    const agents = new AgentSim();
    sim.shotSeq++;
    tick(sim, agents, 5);
    expect(sim.wanted).toBe(1);
    tick(sim, agents, 60 * 45);
    expect(sim.wanted).toBe(0);
    expect(agents.cops.length).toBe(0);
  });

  it('registers custom characters with zero engine changes', () => {
    expect(CharacterFactory.get('police')?.enabled).toBe(true);
    expect(CharacterFactory.get('builder')?.enabled).toBe(true);
    CharacterFactory.register({
      role: 'medic',
      displayName: 'Paramedic',
      enabled: true,
      body: { kind: 'vehicle', vehicleKind: 'ambulance' },
      outfit: { shirt: 0xffffff, pants: 0x222222, skin: 0xbe8864, hat: 'cap', vest: false },
      home: { x: 16, z: 26 },
      blurb: 'Test medic.',
    });
    expect(CharacterFactory.get('medic')?.displayName).toBe('Paramedic');
  });
});
