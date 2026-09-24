/** Right-click menu entries, shared by every shortcut menu (3D view, 2D drawing, view list). */
export type MenuItem =
  | { kind: 'sep' }
  | { kind: 'item'; label: string; onClick?: () => void; disabled?: boolean; checked?: boolean; hint?: string; title?: string; submenu?: MenuItem[] };

export type MenuItemOptions = { disabled?: boolean; checked?: boolean; hint?: string; title?: string; submenu?: MenuItem[] };

export const sep: MenuItem = { kind: 'sep' };
export const item = (label: string, onClick?: () => void, opts: MenuItemOptions = {}): MenuItem => ({
  kind: 'item',
  label,
  onClick,
  ...opts,
});
