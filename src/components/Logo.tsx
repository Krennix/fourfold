export function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="var(--color-logo)"
      aria-hidden="true"
    >
      <path d="M20,0 H47 V47 H0 V20 A20,20 0 0 1 20,0 Z" />
      <path d="M53,0 H80 A20,20 0 0 1 100,20 V47 H53 V0 Z" />
      <path d="M0,53 H47 V100 H20 A20,20 0 0 1 0,80 V53 Z" />
      <path d="M53,53 H100 V92 A8,8 0 0 1 92,100 H75 V86 H53 Z" />
    </svg>
  );
}
