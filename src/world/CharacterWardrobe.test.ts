import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AssetKit, type Stickman } from './Assets';
import { applyCharacterLook, clearCharacterLook } from './CharacterWardrobe';
import { DEFAULT_LOOK } from './CharacterLook';

const descendants = (root: THREE.Object3D) => { let count = 0; root.traverse(() => count++); return count; };
const visibleMeshes = (root: THREE.Object3D) => { const found: THREE.Mesh[] = []; root.traverse(node => { if (node instanceof THREE.Mesh && node.visible) found.push(node); }); return found; };
const jointsOf = (actor: Stickman) => [actor.hips, actor.torso, actor.head, ...actor.arms, ...actor.elbows, ...actor.legs, ...actor.knees];
afterEach(() => vi.unstubAllGlobals());

describe('character wardrobe', () => {
  it('dresses every animated joint and restores the bare actor on clear', () => {
    const kit = new AssetKit();
    const actor = kit.stickman();
    const before = descendants(actor.group);
    const originals = visibleMeshes(actor.group);
    applyCharacterLook(actor, { ...DEFAULT_LOOK, gender: 'Woman', hat: 'Helmet', glasses: true, backpack: true });
    expect(descendants(actor.group)).toBeGreaterThan(before + 10);
    for (const mesh of originals) expect(mesh.visible).toBe(false);
    for (const joint of jointsOf(actor)) expect(joint.children.some(child => child instanceof THREE.Mesh && child.visible)).toBe(true);
    clearCharacterLook(actor);
    expect(descendants(actor.group)).toBe(before);
    for (const mesh of originals) expect(mesh.visible).toBe(true);
    kit.dispose();
  });

  it('auto-dresses the player avatar from the saved look on creation', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ ...DEFAULT_LOOK, backpack: true, glasses: true }), setItem: () => {} });
    const kit = new AssetKit();
    const plain = descendants(kit.stickman(false).group);
    const dressed = descendants(kit.stickman(true).group);
    expect(dressed).toBeGreaterThan(plain + 10);
    kit.dispose();
  });
});
