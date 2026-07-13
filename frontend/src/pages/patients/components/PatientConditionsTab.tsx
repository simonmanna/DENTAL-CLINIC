import { useQuery } from "@tanstack/react-query";
import { conditionsApi } from "../../../lib/api/conditions";
import { chartEntriesApi } from "../../../lib/api/chart-entries";
import { formatDate, cn } from "../../../lib/utils";
import { Loader2, Activity, AlertTriangle, CheckCircle, Clock, HelpCircle, Syringe, XCircle } from "lucide-react";

interface Props {
  patientId: string;
}

const statusConfig: Record<string, { label: string; icon: any; color: string; bg: string; border: string }> = {
  ACTIVE: { label: "Active", icon: Activity, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  MONITORED: { label: "Monitored", icon: Clock, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
  IN_TREATMENT: { label: "In Treatment", icon: Syringe, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  RESOLVED: { label: "Resolved", icon: CheckCircle, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  RULED_OUT: { label: "Ruled Out", icon: XCircle, color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" },
};

const GROUP_ORDER = ["ACTIVE", "IN_TREATMENT", "MONITORED", "RESOLVED", "RULED_OUT"];

function groupBadge(count: number) {
  return (
    <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-white/70 text-gray-700">
      {count}
    </span>
  );
}

export function PatientConditionsTab({ patientId }: Props) {
  const { data: rawConditions, isLoading: load1 } = useQuery({
    queryKey: ["patient-conditions-tab", patientId],
    queryFn: () => conditionsApi.getPatientConditions(patientId),
    enabled: !!patientId,
  });

  const { data: rawEntries, isLoading: load2 } = useQuery({
    queryKey: ["patient-chart-entries-conditions", patientId],
    queryFn: () => chartEntriesApi.getPatientEntries(patientId),
    enabled: !!patientId,
  });

  const loading = load1 || load2;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  const patientConditions = Array.isArray(rawConditions) ? rawConditions : [];
  const chartEntries = Array.isArray(rawEntries) ? rawEntries : [];

  const conditionChartEntries = chartEntries.filter(
    (e: any) => e.type === "CONDITION" && !e.patientConditionId
  );

  const seenIds = new Set(patientConditions.map((c: any) => c.id));
  const merged: any[] = [
    ...patientConditions,
    ...conditionChartEntries
      .filter((e: any) => !seenIds.has(e.id))
      .map((e: any) => ({
        id: e.id,
        condition: e.condition || e.patientCondition?.condition || { name: e.label },
        conditionId: e.conditionId || e.patientCondition?.conditionId,
        toothNumber: e.toothNumber,
        surfaces: e.surfaces || [],
        severity: e.severity || e.patientCondition?.severity,
        status: e.status === "ACTIVE" ? "ACTIVE" : e.conditionStatus || e.patientCondition?.status || e.status,
        diagnosedAt: e.diagnosedAt || e.createdAt,
        diagnosedBy: e.diagnosedBy || e.provider?.firstName ? `${e.provider.firstName} ${e.provider.lastName}` : e.providerId,
        notes: e.notes,
        resolvedAt: e.status === "RESOLVED" ? e.updatedAt : undefined,
        patientConditionId: e.patientConditionId,
      })),
  ];

  const grouped: Record<string, any[]> = {};
  merged.forEach((c: any) => {
    const key = c.status || "ACTIVE";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });

  const visibleGroups = GROUP_ORDER.filter((g) => grouped[g]?.length > 0);

  if (visibleGroups.length === 0) {
    return (
      <div className="text-center py-20">
        <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-400">No conditions or diagnoses recorded for this patient.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {visibleGroups.map((groupKey) => {
        const items = grouped[groupKey];
        const cfg = statusConfig[groupKey] || statusConfig.ACTIVE;
        const Icon = cfg.icon;
        return (
          <div key={groupKey}>
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg mb-3", cfg.bg, cfg.border, "border")}>
              <Icon className={cn("w-4 h-4", cfg.color)} />
              <span className={cn("text-sm font-semibold", cfg.color)}>{cfg.label}</span>
              {groupBadge(items.length)}
            </div>
            <div className="space-y-2">
              {items.map((c: any) => (
                <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-gray-800">{c.condition?.name || "—"}</h4>
                      {c.toothNumber && (
                        <p className="text-xs text-gray-500 mt-0.5">Tooth #{c.toothNumber}{c.surfaces?.length > 0 ? ` (${c.surfaces.join(", ")})` : ""}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {c.severity && (
                        <span className={cn(
                          "text-[11px] font-medium px-2 py-0.5 rounded",
                          c.severity === "SEVERE" || c.severity === "severe" ? "bg-red-50 text-red-700" :
                          c.severity === "MODERATE" || c.severity === "moderate" ? "bg-amber-50 text-amber-700" :
                          "bg-green-50 text-green-700"
                        )}>
                          {c.severity}
                        </span>
                      )}
                      <span className={cn(
                        "text-[11px] font-medium px-2 py-0.5 rounded-full",
                        cfg.bg, cfg.color
                      )}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                    <span>Diagnosed: {formatDate(c.diagnosedAt)}</span>
                    {c.diagnosedBy && <span>By: {c.diagnosedBy}</span>}
                    {c.resolvedAt && <span>Resolved: {formatDate(c.resolvedAt)}</span>}
                  </div>
                  {c.notes && (
                    <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">{c.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
