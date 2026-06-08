import {
  displayUnitName,
  formatResponseStatus,
  getUnitHandlingStatus,
  getUnitResponse,
  sortUnitResponses,
  UNIT_THEME,
} from "../../utils/reportPriority";

function unitClassName(unit) {
  return UNIT_THEME[unit]?.className || "unit-response--unknown";
}

export function CurrentUserUnitStatus({ responses = [], unit, report = null }) {
  const mine = getUnitResponse(responses, unit);
  const statusText = report
    ? getUnitHandlingStatus(report, responses, unit)
    : mine
      ? formatResponseStatus(mine.response_status)
      : "Not yet responded";

  return (
    <div className="your-unit-status" role="status">
      <p className="your-unit-status__line">
        Your unit: <strong>{displayUnitName(unit)}</strong>
      </p>
      <p className="your-unit-status__line">
        Your response:{" "}
        <strong className={mine ? "your-unit-status__responded" : "your-unit-status__pending"}>
          {statusText}
        </strong>
      </p>
    </div>
  );
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

export default function UnitResponsesPanel({ responses = [], currentUnit, report = null, emptyMessage }) {
  const items = sortUnitResponses(responses);

  return (
    <div className="unit-responses-panel">
      <p className="report-actions__heading">Unit Responses</p>
      {currentUnit ? (
        <CurrentUserUnitStatus responses={responses} unit={currentUnit} report={report} />
      ) : null}
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
              <p className="unit-response-card__meta">
                <span className="unit-response-card__label">Responded by:</span>{" "}
                {displayUnitName(item.response_unit)}
              </p>
              <p className="unit-response-card__meta">
                <span className="unit-response-card__label">Status:</span>{" "}
                {formatResponseStatus(item.response_status)}
              </p>
              {item.response_notes ? (
                <p className="unit-response-card__notes">
                  <span className="unit-response-card__label">Notes:</span> {item.response_notes}
                </p>
              ) : null}
              {item.responder_user?.username ? (
                <p className="unit-response-card__account">
                  Logged by {item.responder_user.username}
                </p>
              ) : null}
              {item.accepted_at ? (
                <p className="unit-response-card__account">
                  {new Date(item.accepted_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
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
