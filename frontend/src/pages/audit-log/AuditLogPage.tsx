// src/pages/audit-log/AuditLogPage.tsx
// Global audit log viewer. Read-only list with filters, paging, CSV/PDF
// export, and a side drawer showing the full before/after JSON snapshots.
import { useEffect, useMemo, useState } from "react";
import {
  Table,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
  Tag,
  Drawer,
  Empty,
  Tooltip,
  Popconfirm,
  message,
  Segmented,
} from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import {
  SearchOutlined,
  ReloadOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  ClearOutlined,
  EyeOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  auditLogApi,
  type AuditLogFacets,
  type AuditLogListParams,
  type AuditLogRow,
} from "@/lib/api/auditLog";

const { RangePicker } = DatePicker;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// CSV cell escaping: wrap in quotes, double any inner quote (RFC 4180).
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Hand-rolled CSV — matches the pattern used elsewhere in this project
// (TreatmentReports, FinancialReports, etc.) so we don't pull in a parser lib.
function exportCSV(rows: AuditLogRow[], filename: string) {
  const header = [
    "Created At",
    "User",
    "Action",
    "Module",
    "Entity Type",
    "Record ID",
    "Reason",
    "IP",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt,
        r.userName ?? r.userId ?? "(system)",
        r.action,
        r.module,
        r.entityType ?? "",
        r.recordId ?? "",
        r.reason ?? "",
        r.ipAddress ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    // BOM so Excel opens it as UTF-8
    type: "text/csv;charset=utf-8;",
  });
  downloadBlob(blob, filename);
}

// PDF export — landscape so the wide columns (Module, Entity Type, Reason)
// stay readable without truncation.
function exportPDF(rows: AuditLogRow[], filename: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text("Audit Log", 40, 40);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}  ·  Rows: ${rows.length}`, 40, 58);

  autoTable(doc, {
    startY: 72,
    head: [
      ["Created At", "User", "Action", "Module", "Entity Type", "Record ID", "Reason"],
    ],
    body: rows.map((r) => [
      r.createdAt ? new Date(r.createdAt).toLocaleString() : "",
      r.userName ?? r.userId ?? "(system)",
      r.action,
      r.module,
      r.entityType ?? "",
      r.recordId ?? "",
      r.reason ?? "",
    ]),
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 110 },
      2: { cellWidth: 70 },
      3: { cellWidth: 110 },
      4: { cellWidth: 110 },
      5: { cellWidth: 130 },
      6: { cellWidth: "auto" },
    },
    margin: { left: 40, right: 40 },
  });

  doc.save(filename);
}

// Color-code the action tag by verb (CREATE green, UPDATE blue, DELETE/VOID
// red, anything else slate). Keeps the row scannable when scanning history.
const ACTION_COLORS: Record<string, string> = {
  CREATE: "green",
  UPDATE: "blue",
  DELETE: "red",
  VOID: "red",
  CANCEL: "volcano",
  RESTORE: "cyan",
  EXECUTE: "purple",
  LOGIN: "geekblue",
  LOGOUT: "geekblue",
};

function actionColor(a: string) {
  return ACTION_COLORS[a.toUpperCase()] ?? "default";
}

export default function AuditLogPage() {
  // ── filters (controlled, fed into the query key) ───────────────────────────
  const [search, setSearch] = useState("");
  const [module, setModule] = useState<string | undefined>();
  const [action, setAction] = useState<string | undefined>();
  const [entityType, setEntityType] = useState<string | undefined>();
  const [userId, setUserId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState<AuditLogListParams["sortBy"]>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ── drawer state (view full JSON for one row) ──────────────────────────────
  const [openRow, setOpenRow] = useState<AuditLogRow | null>(null);

  // Facets populate the dropdowns. Cheap distinct queries on the indexed
  // audit_logs columns; OK to refetch on mount, no need to invalidate per-filter.
  const facetsQuery = useQuery<AuditLogFacets>({
    queryKey: ["audit-log", "facets"],
    queryFn: () => auditLogApi.facets(),
    staleTime: 5 * 60_000,
  });

  // The data list — refetches on any filter/page/sort change.
  const listParams: AuditLogListParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      module,
      action,
      entityType,
      userId,
      dateFrom: dateRange?.[0]?.toISOString(),
      dateTo: dateRange?.[1]?.endOf("day").toISOString(),
      page,
      limit,
      sortBy,
      sortDir,
    }),
    [search, module, action, entityType, userId, dateRange, page, limit, sortBy, sortDir],
  );

  const listQuery = useQuery({
    queryKey: ["audit-log", "list", listParams],
    queryFn: () => auditLogApi.list(listParams),
    placeholderData: (prev) => prev, // smooth paging — keep old rows visible
  });

  // Reset to page 1 when any filter changes (but not when paging/sorting).
  useEffect(() => {
    setPage(1);
  }, [search, module, action, entityType, userId, dateRange]);

  function clearFilters() {
    setSearch("");
    setModule(undefined);
    setAction(undefined);
    setEntityType(undefined);
    setUserId(undefined);
    setDateRange(null);
  }

  async function handleExport(kind: "csv" | "pdf") {
    // Export the full filtered set (not just the visible page). Cap at 5,000
    // to keep PDFs sensible — adjust if a user really needs more.
    const EXPORT_LIMIT = 5000;
    try {
      const all = await auditLogApi.list({ ...listParams, page: 1, limit: EXPORT_LIMIT });
      const rows = all.data;
      if (rows.length === 0) {
        message.warning("No rows to export");
        return;
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename = `audit-log-${stamp}.${kind}`;
      if (kind === "csv") exportCSV(rows, filename);
      else exportPDF(rows, filename);
      message.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      message.error(`Export failed: ${e?.message ?? "unknown error"}`);
    }
  }

  // ── columns ────────────────────────────────────────────────────────────────
  const columns: ColumnsType<AuditLogRow> = [
    {
      title: "When",
      dataIndex: "createdAt",
      width: 170,
      render: (v: string) =>
        v ? (
          <span className="font-mono text-xs text-slate-600">
            {new Date(v).toLocaleString()}
          </span>
        ) : (
          "—"
        ),
    },
    {
      title: "User",
      dataIndex: "userName",
      width: 180,
      render: (_: any, row) => (
        <div className="leading-tight">
          <div className="text-sm font-medium text-slate-800">
            {row.userName ?? "(unknown)"}
          </div>
          {row.userId && (
            <div className="text-[11px] text-slate-400 font-mono">{row.userId}</div>
          )}
        </div>
      ),
    },
    {
      title: "Action",
      dataIndex: "action",
      width: 110,
      render: (v: string) => <Tag color={actionColor(v)}>{v}</Tag>,
    },
    {
      title: "Module",
      dataIndex: "module",
      width: 180,
      render: (v: string) => <span className="text-sm text-slate-700">{v}</span>,
    },
    {
      title: "Entity",
      dataIndex: "entityType",
      width: 160,
      render: (v: string | null, row) =>
        v ? (
          <div className="leading-tight">
            <div className="text-sm text-slate-700">{v}</div>
            {row.recordId && (
              <div className="text-[11px] text-slate-400 font-mono">{row.recordId}</div>
            )}
          </div>
        ) : (
          "—"
        ),
    },
    {
      title: "Reason",
      dataIndex: "reason",
      ellipsis: true,
      render: (v: string | null) =>
        v ? (
          <Tooltip title={v}>
            <span className="text-sm text-slate-600">{v}</span>
          </Tooltip>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      title: "IP",
      dataIndex: "ipAddress",
      width: 130,
      render: (v: string | null) =>
        v ? <span className="font-mono text-xs text-slate-500">{v}</span> : <span className="text-slate-300">—</span>,
    },
    {
      title: "",
      key: "actions",
      width: 80,
      fixed: "right",
      render: (_: any, row) => (
        <Button
          size="small"
          type="text"
          icon={<EyeOutlined />}
          onClick={() => setOpenRow(row)}
        >
          View
        </Button>
      ),
    },
  ];

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize: limit,
    total: listQuery.data?.pagination.total ?? 0,
    showSizeChanger: true,
    pageSizeOptions: PAGE_SIZE_OPTIONS.map(String),
    showTotal: (total, range) => `${range[0]}–${range[1]} of ${total.toLocaleString()}`,
  };

  const isLoading = listQuery.isLoading || listQuery.isFetching;
  const facets = facetsQuery.data;

  return (
    <div className="p-6 space-y-4">
      {/* ── header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Audit Log</h1>
          <p className="text-sm text-slate-500">
            Append-only record of every state change across the system.
          </p>
        </div>
        <Space wrap>
          <Button
            icon={<FileExcelOutlined />}
            onClick={() => handleExport("csv")}
            loading={listQuery.isFetching}
          >
            Export CSV
          </Button>
          <Button
            icon={<FilePdfOutlined />}
            onClick={() => handleExport("pdf")}
            loading={listQuery.isFetching}
          >
            Export PDF
          </Button>
        </Space>
      </div>

      {/* ── filters ── */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <Input
            allowClear
            prefix={<SearchOutlined className="text-slate-400" />}
            placeholder="Search user / record / reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="lg:col-span-2"
          />
          <Select
            allowClear
            placeholder="Module"
            value={module}
            onChange={setModule}
            options={(facets?.modules ?? []).map((m) => ({ label: m, value: m }))}
            showSearch
            className="w-full"
          />
          <Select
            allowClear
            placeholder="Action"
            value={action}
            onChange={setAction}
            options={(facets?.actions ?? []).map((a) => ({ label: a, value: a }))}
            className="w-full"
          />
          <Select
            allowClear
            placeholder="Entity type"
            value={entityType}
            onChange={setEntityType}
            options={(facets?.entityTypes ?? []).map((e) => ({ label: e, value: e }))}
            showSearch
            className="w-full"
          />
          <Select
            allowClear
            placeholder="User"
            value={userId}
            onChange={setUserId}
            options={(facets?.users ?? []).map((u) => ({
              label: u.name,
              value: u.id,
            }))}
            showSearch
            optionFilterProp="label"
            className="w-full"
          />
          <RangePicker
            value={dateRange as any}
            onChange={(v) => setDateRange(v as any)}
            className="w-full lg:col-span-2"
            allowClear
            placeholder={["From date", "To date"]}
          />
          <div className="flex gap-2 lg:col-span-2">
            <Popconfirm
              title="Clear all filters?"
              okText="Clear"
              cancelText="Cancel"
              onConfirm={clearFilters}
            >
              <Button icon={<ClearOutlined />}>Clear</Button>
            </Popconfirm>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={isLoading}
              onClick={() => listQuery.refetch()}
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* ── table ── */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <Table<AuditLogRow>
          rowKey="id"
          columns={columns}
          dataSource={listQuery.data?.data ?? []}
          loading={isLoading}
          scroll={{ x: 1100 }}
          size="middle"
          pagination={pagination}
          onChange={(p, _filters, sorter: any) => {
            setPage(p.current ?? 1);
            setLimit(p.pageSize ?? 25);
            if (sorter?.field && sorter?.order) {
              setSortBy(sorter.field);
              setSortDir(sorter.order === "ascend" ? "asc" : "desc");
            }
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  listQuery.isError
                    ? "Failed to load audit log"
                    : "No matching audit entries"
                }
              />
            ),
          }}
        />
      </div>

      {/* ── row detail drawer ── */}
      <Drawer
        open={!!openRow}
        onClose={() => setOpenRow(null)}
        width={720}
        title={
          openRow ? (
            <div className="flex items-center gap-2">
              <Tag color={actionColor(openRow.action)}>{openRow.action}</Tag>
              <span className="font-semibold">{openRow.module}</span>
              {openRow.entityType && (
                <span className="text-slate-500 text-sm">/ {openRow.entityType}</span>
              )}
            </div>
          ) : null
        }
        extra={
          openRow && (
            <Space>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => {
                  const blob = new Blob(
                    [JSON.stringify(openRow, null, 2)],
                    { type: "application/json" },
                  );
                  downloadBlob(blob, `audit-${openRow.id}.json`);
                }}
              >
                JSON
              </Button>
            </Space>
          )
        }
      >
        {openRow && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="When" value={new Date(openRow.createdAt).toLocaleString()} />
              <Field
                label="User"
                value={openRow.userName ?? openRow.userId ?? "(system)"}
              />
              <Field label="Module" value={openRow.module} />
              <Field label="Action" value={<Tag color={actionColor(openRow.action)}>{openRow.action}</Tag>} />
              <Field label="Entity" value={openRow.entityType ?? "—"} />
              <Field
                label="Record ID"
                value={
                  openRow.recordId ? (
                    <span className="font-mono text-xs">{openRow.recordId}</span>
                  ) : (
                    "—"
                  )
                }
              />
              {openRow.ipAddress && <Field label="IP" value={openRow.ipAddress} />}
              {openRow.userAgent && (
                <Field
                  label="User Agent"
                  value={
                    <span className="text-xs text-slate-500 break-all">
                      {openRow.userAgent}
                    </span>
                  }
                />
              )}
              {openRow.reason && (
                <div className="col-span-2">
                  <Field label="Reason" value={openRow.reason} />
                </div>
              )}
            </div>

            <JsonBlock title="Old data (before)" value={openRow.oldData} />
            <JsonBlock title="New data (after)" value={openRow.newData} />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const isEmpty = value === null || value === undefined;
  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <div className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">
        {title}
      </div>
      <pre className="m-0 p-3 text-xs font-mono text-slate-700 bg-white max-h-72 overflow-auto whitespace-pre-wrap break-all">
        {isEmpty ? (
          <span className="text-slate-300">— empty —</span>
        ) : (
          JSON.stringify(value, null, 2)
        )}
      </pre>
    </div>
  );
}
