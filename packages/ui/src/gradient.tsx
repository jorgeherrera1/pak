export function Gradient({
  conic,
  className,
  small,
}: {
  small?: boolean;
  conic?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`absolute rounded-full mix-blend-normal will-change-[filter] ${
        small ? "blur-[32px]" : "blur-[75px]"
      } ${
        conic
          ? "bg-gradient-to-r from-mint from-10% via-bright-cyan via-30% to-electric-blue to-100%"
          : ""
      } ${className ?? ""}`}
    />
  );
}
