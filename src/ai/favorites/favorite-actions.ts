export interface FavoriteAction {
  id: string;
  name: string;
  instruction: string;
}
export function favoriteActions(raw: unknown): FavoriteAction[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.filter((v): v is FavoriteAction => {
    if (
      !v ||
      typeof v !== "object" ||
      typeof v.id !== "string" ||
      seen.has(v.id) ||
      typeof v.name !== "string" ||
      typeof v.instruction !== "string" ||
      v.name.length > 200 ||
      v.instruction.length > 2000
    )
      return false;
    seen.add(v.id);
    return true;
  });
}
