export default function EmptyState({ icon = "📋", title = "Nothing here yet", message, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        {icon}
      </span>
      <h3 className="empty-state__title">{title}</h3>
      {message ? <p className="empty-state__message">{message}</p> : null}
      {actionLabel && onAction ? (
        <button type="button" className="btn btn--primary empty-state__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
