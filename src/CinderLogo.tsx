// ABOUTME: SVG logo component for the Cinder app.
// ABOUTME: Renders a stylized three-layer flame icon.
import type { JSX } from 'react';

interface CinderLogoProps {
  readonly size?: number;
}

export function CinderLogo({ size = 28 }: CinderLogoProps): JSX.Element {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
      <ellipse cx="50" cy="38" rx="30" ry="9" fill="#D32F2F" />
      <ellipse cx="50" cy="52" rx="28" ry="9" fill="#F57C00" />
      <ellipse cx="50" cy="66" rx="24" ry="8" fill="#FDD835" />
    </svg>
  );
}
