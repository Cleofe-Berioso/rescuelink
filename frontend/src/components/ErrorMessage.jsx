export default function ErrorMessage({ message, className = "" }) {
  if (!message) return null;

  return (
    <div className={`error-message ${className}`.trim()} role="alert">
      <span className="error-message__icon" aria-hidden="true">
        ⚠
      </span>
      <span>{message}</span>
    </div>
  );
}
