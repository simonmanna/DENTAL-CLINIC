import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clinicSettingsApi } from "../../lib/api/clinic-settings";
import type { ClinicSetting } from "../../types/clinic-settings";
import {
  PageHeader,
  LoadingSpinner,
  EmptyState,
} from "../../components/shared";
import {
  Settings,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";

export default function ClinicSettingsPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<ClinicSetting | null>(null);
  const [formData, setFormData] = useState({
    key: "",
    value: "",
    description: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Keys that should have read-only key field
  const protectedKeys = ["EXCHANGE_RATE", "PHARMACY_LOCATION"];
  const isProtected = (key: string) => protectedKeys.includes(key);

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["clinic-settings"],
    queryFn: () => clinicSettingsApi.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: clinicSettingsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-settings"] });
      toast.success("Setting created successfully");
      closeModal();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to create setting");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { key?: string; value?: string; description?: string };
    }) => clinicSettingsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-settings"] });
      toast.success("Setting updated successfully");
      closeModal();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to update setting");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: clinicSettingsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-settings"] });
      toast.success("Setting deleted successfully");
      setDeleteConfirm(null);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to delete setting");
    },
  });

  const filteredSettings = settings.filter(
    (s) =>
      s.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.value.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.description &&
        s.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const openCreateModal = () => {
    setEditingSetting(null);
    setFormData({ key: "", value: "", description: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (setting: ClinicSetting) => {
    setEditingSetting(setting);
    setFormData({
      key: setting.key,
      value: setting.value,
      description: setting.description || "",
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSetting(null);
    setFormData({ key: "", value: "", description: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.key.trim() || !formData.value.trim()) {
      toast.error("Key and Value are required");
      return;
    }
    if (editingSetting) {
      updateMutation.mutate({
        id: editingSetting.id,
        data: {
          key: formData.key,
          value: formData.value,
          description: formData.description,
        },
      });
    } else {
      createMutation.mutate({
        key: formData.key,
        value: formData.value,
        description: formData.description,
      });
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm(id);
  };

  const confirmDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <PageHeader title="Clinic Settings" subtitle="Manage clinic configuration" />
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Clinic Settings"
        subtitle="Manage clinic configuration keys and values"
        actions={
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            Add Setting
          </button>
        }
      />

      {/* Search */}
      <div className="mt-6 mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search settings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Settings Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filteredSettings.length === 0 ? (
          <EmptyState
            icon={<Settings className="w-12 h-12 text-slate-300" />}
            title="No Settings Found"
            description={
              searchTerm
                ? "No settings match your search."
                : "Get started by adding your first clinic setting."
            }
            action={
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <Plus size={16} />
                Add Setting
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-slate-700">
                    Key
                  </th>
                  <th className="text-left px-6 py-3 font-semibold text-slate-700">
                    Value
                  </th>
                  <th className="text-left px-6 py-3 font-semibold text-slate-700 hidden md:table-cell">
                    Description
                  </th>
                  <th className="text-left px-6 py-3 font-semibold text-slate-700 hidden lg:table-cell">
                    Updated
                  </th>
                  <th className="text-right px-6 py-3 font-semibold text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSettings.map((setting) => (
                  <tr
                    key={setting.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm bg-slate-100 text-slate-700 px-2 py-1 rounded">
                        {setting.key}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-900 font-medium">
                        {setting.value}
                      </span>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className="text-slate-500">
                        {setting.description || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <span className="text-slate-400 text-xs">
                        {new Date(setting.updatedAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(setting)}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(setting.id)}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">
                {editingSetting ? "Edit Setting" : "Add Setting"}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.key}
                  onChange={(e) =>
                    setFormData({ ...formData, key: e.target.value })
                  }
                  placeholder="e.g., CLINIC_NAME"
                  disabled={editingSetting ? isProtected(editingSetting.key) : false}
                  className={`w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm ${editingSetting && isProtected(editingSetting.key) ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                  required
                />
                {editingSetting && isProtected(editingSetting.key) && (
                  <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle size={12} />
                    This key is protected and cannot be changed.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Value <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.value}
                  onChange={(e) =>
                    setFormData({ ...formData, value: e.target.value })
                  }
                  placeholder="e.g., My Dental Clinic"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Optional description..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingSetting
                      ? "Update"
                      : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-500" />
              <h2 className="text-lg font-semibold text-slate-800">
                Confirm Delete
              </h2>
            </div>
            <p className="text-slate-600 text-sm mb-6">
              Are you sure you want to delete this setting? This action cannot be
              undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDelete(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
