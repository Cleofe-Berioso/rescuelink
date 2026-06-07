import AnimatedBackground from "./AnimatedBackground";

export default function PageShell({ children, className = "", showBackground = true }) {
  return (
    <div className={`page-shell ${className}`.trim()}>
      {showBackground ? <AnimatedBackground /> : null}
      <div className="page-shell__content">{children}</div>
    </div>
  );
}
