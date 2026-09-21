import { parseCssColor, type Rgba } from './cssColor';

const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const luminance = (c: Rgba) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
export const contrast = (a: Rgba, b: Rgba) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/**
 * Screen colours for a drawing palette on the current background.
 * "#000000" is colour 7: it becomes the theme foreground (black on Paper, white on Ink), as in AutoCAD.
 * Any colour too close to the background (yellow on Paper, blue on Ink) is pulled toward the
 * foreground until it reaches `minContrast`, so every layer stays readable in both themes.
 */
export function resolvePalette(palette: readonly string[], background: Rgba, foreground: Rgba, minContrast = 2.2): Rgba[] {
  return palette.map((hex) => {
    const c = parseCssColor(hex) ?? foreground;
    if (c.r === 0 && c.g === 0 && c.b === 0) return { ...foreground, a: 1 };
    let out = { ...c, a: 1 };
    for (let t = 0.15; contrast(out, background) < minContrast && t <= 1; t += 0.15) {
      out = { r: c.r + (foreground.r - c.r) * t, g: c.g + (foreground.g - c.g) * t, b: c.b + (foreground.b - c.b) * t, a: 1 };
    }
    return out;
  });
}

export const toCss = (c: Rgba) => `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
