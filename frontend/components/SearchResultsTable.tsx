"use client";

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';

interface SearchResultsTableProps {
  data: any[];
  columns?: string[];
  onAddSchool?: (school: { ben: string; school_name: string; state: string }) => Promise<void>;
  existingBens?: Set<string>;
  showAddButton?: boolean;
  totalCount?: number;
}

export function SearchResultsTable({
  data,
  columns,
  onAddSchool,
  existingBens = new Set(),
  showAddButton = true,
  totalCount,
}: SearchResultsTableProps) {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState('');
  const [addingBen, setAddingBen] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Load user preference from localStorage
  useEffect(() => {
    const savedRowsPerPage = localStorage.getItem('searchResultsRowsPerPage');
    if (savedRowsPerPage) {
      setRowsPerPage(parseInt(savedRowsPerPage));
    }
  }, []);

  // Save rows per page preference
  const handleRowsPerPageChange = (value: number) => {
    setRowsPerPage(value);
    setCurrentPage(1);
    localStorage.setItem('searchResultsRowsPerPage', String(value));
  };

  // Determine columns to show
  const displayColumns = useMemo(() => {
    if (columns) return columns;
    if (data.length === 0) return [];
    // Show first 8 columns by default
    return Object.keys(data[0]).slice(0, 8);
  }, [data, columns]);

  // Filter data
  const filteredData = useMemo(() => {
    if (!filterText) return data;
    const lowerFilter = filterText.toLowerCase();
    return data.filter(row =>
      Object.values(row).some(val =>
        String(val).toLowerCase().includes(lowerFilter)
      )
    );
  }, [data, filterText]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortColumn, sortDirection]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return sortedData.slice(start, start + rowsPerPage);
  }, [sortedData, currentPage, rowsPerPage]);

  // Calculate pagination info
  const totalPages = Math.ceil(sortedData.length / rowsPerPage);
  const startRow = (currentPage - 1) * rowsPerPage + 1;
  const endRow = Math.min(currentPage * rowsPerPage, sortedData.length);

  // Handle sort
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Handle add single school
  const handleAddSchool = async (row: any) => {
    if (!onAddSchool) return;
    
    const ben = row.ben || row.BEN;
    if (!ben) return;
    
    setAddingBen(ben);
    try {
      await onAddSchool({
        ben: String(ben),
        school_name: row.organization_name || row.school_name || row.applicant_name || '',
        state: row.state || row.State || '',
      });
      // Update selected rows after successful add
      setSelectedRows(prev => {
        const next = new Set(prev);
        next.delete(ben);
        return next;
      });
    } catch (error) {
      console.error('Failed to add school:', error);
    } finally {
      setAddingBen(null);
    }
  };

  // Handle add selected schools
  const handleAddSelected = async () => {
    if (!onAddSchool) return;
    
    for (const ben of selectedRows) {
      const row = data.find(r => (r.ben || r.BEN) === ben);
      if (row) {
        await handleAddSchool(row);
      }
    }
  };

  // Toggle row selection
  const toggleRowSelection = (ben: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(ben)) {
        next.delete(ben);
      } else {
        next.add(ben);
      }
      return next;
    });
  };

  // Toggle all rows
  const toggleAllRows = () => {
    if (selectedRows.size === paginatedData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(paginatedData.map(r => r.ben || r.BEN).filter(Boolean)));
    }
  };

  // Format cell value
  const formatValue = (val: any, columnKey?: string) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'number') {
      // Don't format years (4-digit numbers like 2024, 2025) with commas
      const isYear = val >= 1900 && val <= 2100 && Number.isInteger(val);
      if (isYear) return String(val);
      return val.toLocaleString();
    }
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
  };

  // Format column header
  const formatHeader = (key: string) => {
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        No results found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Filter Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Filter results..."
            value={filterText}
            onChange={(e) => {
              setFilterText(e.target.value);
              setCurrentPage(1);
            }}
            className="w-64 pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex items-center gap-4">
          {/* Add Selected Button */}
          {showAddButton && onAddSchool && selectedRows.size > 0 && (
            <button
              onClick={handleAddSelected}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Selected ({selectedRows.size})
            </button>
          )}

          {/* Rows Per Page */}
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Show</span>
            <select
              value={rowsPerPage}
              onChange={(e) => handleRowsPerPageChange(Number(e.target.value))}
              className="px-2 py-1 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>rows</span>
          </div>
        </div>
      </div>

      {/* Results Info */}
      <div className="text-sm text-slate-500">
        Showing {startRow.toLocaleString()}-{endRow.toLocaleString()} of {sortedData.length.toLocaleString()} results
        {totalCount && totalCount > sortedData.length && (
          <span className="text-indigo-600 ml-2">
            ({totalCount.toLocaleString()} total in database)
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                {/* Checkbox column */}
                {showAddButton && onAddSchool && (
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedRows.size === paginatedData.length && paginatedData.length > 0}
                      onChange={toggleAllRows}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                )}
                
                {displayColumns.map((key) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="px-4 py-3 text-left text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {formatHeader(key)}
                      {sortColumn === key && (
                        <svg
                          className={`w-4 h-4 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </div>
                  </th>
                ))}
                
                {/* Actions column */}
                {showAddButton && onAddSchool && (
                  <th className="w-24 px-4 py-3 text-center text-sm font-medium text-slate-700">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedData.map((row, idx) => {
                const ben = row.ben || row.BEN;
                const isAdded = ben && existingBens.has(String(ben));
                const isSelected = ben && selectedRows.has(ben);
                const isAdding = ben === addingBen;
                
                return (
                  <tr 
                    key={idx} 
                    className={`hover:bg-slate-50 transition-colors ${isAdded ? 'bg-green-50/50' : ''}`}
                  >
                    {/* Checkbox */}
                    {showAddButton && onAddSchool && (
                      <td className="px-4 py-3">
                        {ben && !isAdded && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRowSelection(ben)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        )}
                      </td>
                    )}
                    
                    {displayColumns.map((key) => (
                      <td key={key} className="px-4 py-3 text-sm text-slate-600">
                        {formatValue(row[key])}
                      </td>
                    ))}
                    
                    {/* Actions */}
                    {showAddButton && onAddSchool && (
                      <td className="px-4 py-3 text-center">
                        {ben && (
                          isAdded ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Added
                            </span>
                          ) : (
                            <button
                              onClick={() => handleAddSchool(row)}
                              disabled={isAdding}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-200 transition-colors disabled:opacity-50"
                            >
                              {isAdding ? (
                                <>
                                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                  </svg>
                                  Adding...
                                </>
                              ) : (
                                <>
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                  </svg>
                                  Add
                                </>
                              )}
                            </button>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                title="First page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7 7" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-1">
              {/* Page numbers */}
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (currentPage <= 4) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = currentPage - 3 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === pageNum
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                title="Last page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
