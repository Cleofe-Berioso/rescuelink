import { getPageNumbers } from "../../utils/reportListUtils";

export default function ReportPagination({ pagination, onPageChange }) {
  const pages = getPageNumbers(pagination.page, pagination.totalPages);

  if (pagination.total === 0) return null;

  return (
    <footer className="report-pagination">
      <p className="report-pagination__summary">
        Showing {pagination.start} to {pagination.end} of {pagination.total} reports
      </p>
      <div className="report-pagination__controls">
        <button
          type="button"
          className="report-pagination__nav"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
          aria-label="Previous page"
        >
          ‹
        </button>
        {pages.map((pageNum) => (
          <button
            key={pageNum}
            type="button"
            className={`report-pagination__page-btn${
              pageNum === pagination.page ? " report-pagination__page-btn--active" : ""
            }`}
            onClick={() => onPageChange(pageNum)}
            aria-current={pageNum === pagination.page ? "page" : undefined}
          >
            {pageNum}
          </button>
        ))}
        <button
          type="button"
          className="report-pagination__nav"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </footer>
  );
}
