"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  baseUrl: string;
}

export default function Pagination({ total, page, pageSize, baseUrl }: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages <= 1) return null;

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`${baseUrl}?${params.toString()}`);
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showPages = 5; // عدد الصفحات المعروضة

    if (totalPages <= showPages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (page <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push("...");
        pages.push(totalPages);
      } else if (page >= totalPages - 2) {
        pages.push(1);
        pages.push("...");
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push("...");
        pages.push(page - 1);
        pages.push(page);
        pages.push(page + 1);
        pages.push("...");
        pages.push(totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 rounded-b-xl">
      <div className="text-sm text-gray-700">
        عرض {(page - 1) * pageSize + 1} إلى {Math.min(page * pageSize, total)} من أصل {total}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => handlePageChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          السابق
        </button>
        {getPageNumbers().map((p, i) => (
          <button
            key={i}
            onClick={() => typeof p === "number" && handlePageChange(p)}
            disabled={typeof p === "string"}
            className={`px-3 py-1.5 text-sm border rounded-lg ${
              p === page
                ? "bg-elnesr-500 text-white border-elnesr-500"
                : "border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => handlePageChange(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          التالي
        </button>
      </div>
    </div>
  );
}
