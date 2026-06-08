import { SORT_OPTIONS } from "../../utils/reportListUtils";

export default function ReportSearchSortBar({
  search,
  onSearchChange,
  sort,
  onSortChange,
}) {
  return (
    <div className="report-search-sort">
      <label className="report-search-sort__search">
        <span className="visually-hidden">Search reports</span>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search reports..."
          className="report-search-sort__input"
        />
      </label>
      <label className="report-search-sort__sort">
        <span className="report-search-sort__sort-label">Sort:</span>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          className="report-search-sort__select"
        >
          {SORT_OPTIONS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
