import {
  displayUnitName,
  formatResponseStatus,
  sortUnitResponses,
  UNIT_THEME,
} from "../../utils/reportPriority";

function unitClassName(unit) {
  return UNIT_THEME[unit]?.className || "unit-response--unknown";
}

export function UnitResponseBadges({ responses = [] }) {
  const items = sortUnitResponses(responses);
  if (!items.length) return null;

  return (
    <div className="unit-response-badges" aria-label="Unit responses">
      {items.map((item) => (
        <span
          key={item.id}
          className={`unit-response-badge ${unitClassName(item.response_unit)}`}
          title={`${displayUnitName(item.response_unit)} — ${formatResponseStatus(item.response_status)}`}
        >
          {displayUnitName(item.response_unit)} · {formatResponseStatus(item.response_status)}
        </span>
      ))}
    </div>
  );
}

export default function UnitResponsesPanel({ responses = [], emptyMessage }) {
  const items = sortUnitResponses(responses);

  return (
    <div className="unit-responses-panel">
      <p className="report-actions__heading">Unit Responses</p>
      {items.length ? (
        <div className="unit-response-cards">
          {items.map((item) => (
            <article key={item.id} className={`unit-response-card ${unitClassName(item.response_unit)}`}>
              <div className="unit-response-card__header">
                <span className="unit-response-card__unit">{displayUnitName(item.response_unit)}</span>
                <span className="unit-response-card__status">
                  {formatResponseStatus(item.response_status)}
                </span>
              </div>
              {item.responder_user?.username ? (
                <p className="unit-response-card__meta">
                  <span className="unit-response-card__label">Accepted by:</span>{" "}
                  {item.responder_user.username}
                </p>
              ) : null}
              {item.response_notes ? (
                <p className="unit-response-card__notes">
                  <span className="unit-response-card__label">Notes:</span> {item.response_notes}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="unit-responses-empty" role="status">
          {emptyMessage || "No response unit has accepted this incident yet."}
        </p>
      )}
    </div>
  );
}
