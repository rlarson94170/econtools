import { cn } from '@/lib/utils';

interface KabboWordmarkProps {
  className?: string;
  /** Rendered height in pixels. Width scales to preserve aspect ratio. */
  height?: number;
}

/**
 * Kabbo wordmark – "KABBO" in solid geometric all-caps.
 *
 * Geometric all-caps armature (rational bowls on B, true-circle O) drawn
 * as solid filled letterforms via a single heavy stroke. The wordmark uses
 * `text-foreground`, so it tracks light/dark mode automatically: near-black
 * on light backgrounds, near-white on dark.
 */
export function KabboWordmark({ className, height = 30 }: KabboWordmarkProps) {
  const viewBox = '0 0 410 130';
  // Preserve aspect ratio: native is 410 × 130.
  const width = Math.round((height * 410) / 130);

  // Shared path data for both the outer silhouette and the inner carve.
  const paths = (
    <>
      {/* K */}
      <path d="M 15 12 L 15 118" />
      <path d="M 15 65 L 60 12" />
      <path d="M 15 65 L 62 118" />
      {/* A */}
      <path d="M 110 12 L 70 118" />
      <path d="M 110 12 L 150 118" />
      <path d="M 85 75 L 135 75" />
      {/* B */}
      <path d="M 180 12 L 180 118" />
      <path d="M 180 12 H 204 A 24 26.5 0 0 1 204 65 H 180" />
      <path d="M 180 65 H 204 A 24 26.5 0 0 1 204 118 H 180" />
      {/* B */}
      <path d="M 250 12 L 250 118" />
      <path d="M 250 12 H 274 A 24 26.5 0 0 1 274 65 H 250" />
      <path d="M 250 65 H 274 A 24 26.5 0 0 1 274 118 H 250" />
      {/* O */}
      <circle cx="345" cy="65" r="45" />
    </>
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Kabbo"
      className={cn('text-foreground', className)}
    >
      {/* Solid letterforms – foreground colour (black on light, white on dark) */}
      <g
        stroke="currentColor"
        strokeWidth={20}
        strokeLinecap="butt"
        strokeLinejoin="miter"
        fill="none"
      >
        {paths}
      </g>
    </svg>
  );
}
