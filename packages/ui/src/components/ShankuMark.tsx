import { useId } from 'react';

export interface ShankuMarkProps {
  /** px. Default 28. At 32 px and below the heavier small-size drawing is used. */
  size?: number;
  label?: string;
}

/** The Shanku mark, drawn from tokens so it follows Paper and Ink. */
export function ShankuMark({ size = 28, label = 'Shanku' }: ShankuMarkProps) {
  const maskId = `sk-mark-${useId().replace(/:/g, '')}`;
  const small = size <= 32;
  return (
    <svg className="sk-mark" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={label}>
      {small ? (
        <>
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
              <ellipse cx="60" cy="82" rx="48" ry="20" fill="#fff" stroke="#fff" strokeWidth="10" />
            </mask>
          </defs>
          <ellipse className="sk-mark__ring" cx="60" cy="82" rx="48" ry="20" fill="none" strokeWidth="10" />
          <polygon className="sk-mark__shadow" points="60,88.9 72,82 129.2,93.2 117.2,100.1" mask={`url(#${maskId})`} />
          <polygon className="sk-mark__left" points="48,12 60,18.9 60,88.9 48,82" />
          <polygon className="sk-mark__right" points="60,18.9 72,12 72,82 60,88.9" />
          <polygon className="sk-mark__top" points="48,12 60,5.1 72,12 60,18.9" />
        </>
      ) : (
        <>
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
              <ellipse cx="60" cy="82" rx="50" ry="18" fill="#fff" stroke="#fff" strokeWidth="5" />
            </mask>
          </defs>
          <ellipse className="sk-mark__ring" cx="60" cy="82" rx="50" ry="18" fill="none" strokeWidth="5" />
          <polygon className="sk-mark__shadow" points="60,87.2 69,82 126.2,93.2 117.2,98.4" mask={`url(#${maskId})`} />
          <polygon className="sk-mark__left" points="51,16 60,21.2 60,87.2 51,82" />
          <polygon className="sk-mark__right" points="60,21.2 69,16 69,82 60,87.2" />
          <polygon className="sk-mark__top" points="51,16 60,10.8 69,16 60,21.2" />
        </>
      )}
    </svg>
  );
}
