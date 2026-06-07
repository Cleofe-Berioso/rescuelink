import "./AnimatedBackground.css";

export default function AnimatedBackground() {
  return (
    <div className="animated-bg" aria-hidden="true">
      <div className="animated-bg__grid" />
      <div className="animated-bg__blob animated-bg__blob--red" />
      <div className="animated-bg__blob animated-bg__blob--orange" />
      <div className="animated-bg__blob animated-bg__blob--blue" />
      <div className="animated-bg__pulse animated-bg__pulse--1" />
      <div className="animated-bg__pulse animated-bg__pulse--2" />
    </div>
  );
}
