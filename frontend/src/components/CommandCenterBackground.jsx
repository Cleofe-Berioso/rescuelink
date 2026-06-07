import "./CommandCenterBackground.css";

const LOGIN_BG_IMAGE = "/bg%20login%20page.png";

export default function CommandCenterBackground() {
  return (
    <div className="command-bg" aria-hidden="true">
      <img className="command-bg__photo" src={LOGIN_BG_IMAGE} alt="" />
      <div className="command-bg__overlay" />
      <div className="command-bg__vignette" />
    </div>
  );
}
