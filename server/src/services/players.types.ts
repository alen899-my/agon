export interface Player {
  id: string;
  name: string;
  created_at: string;
  last_seen_at: string;
}

/** Public profile shape — never leaks internal columns. */
export function toPublicPlayer(player: Player): Pick<Player, 'id' | 'name' | 'created_at'> {
  return { id: player.id, name: player.name, created_at: player.created_at };
}
