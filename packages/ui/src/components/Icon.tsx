import iconData from '@shanku/brand/icons.json';

type IconSet = typeof iconData.icons;
export type IconName = keyof IconSet;

export interface IconProps {
  name: IconName;
  /** px. Default 20. Icons are drawn on a 24 px grid. */
  size?: number;
  /** Two-tone exists only for column, beam, slab, wall, footing; others fall back to outline. */
  variant?: 'outline' | 'twoTone';
  /** Accessible name. Omit for decorative icons next to a visible label. */
  label?: string;
  className?: string;
}

export const iconNames = Object.keys(iconData.icons) as IconName[];

/**
 * Renders a Shanku structural icon. Colour follows `currentColor`.
 * The markup comes from @shanku/brand/icons.json (a static, trusted build asset),
 * which is why it is injected rather than parsed.
 */
export function Icon({ name, size = 20, variant = 'outline', label, className }: IconProps) {
  const entry = iconData.icons[name] as { outline: string; twoTone?: string };
  const markup = variant === 'twoTone' && entry.twoTone ? entry.twoTone : entry.outline;
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  return (
    <svg
      className={['sk-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={variant === 'twoTone' ? 1.3 : iconData.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...a11y}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
