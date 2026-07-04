// src/components/staff/StaffList.tsx
import React, { useState, useEffect } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Avatar,
  Switch,
  Input,
  Select,
  Card,
  Row,
  Col,
  Typography,
  Tooltip,
  Badge,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  UserAddOutlined,
  ScheduleOutlined,
  StarOutlined,
  MailOutlined,
  PhoneOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { UserRole } from "@/types/shared";
import { Staff, ROLE_LABELS, ROLE_COLORS } from "@/types/staff";
import { staffApi } from "@/services/staffApi";
// import { useAuth } from '../../hooks/useAuth';
import { useAuthStore } from "../../../store/auth.store";
import dayjs from "dayjs";

const { Title } = Typography;
const { Option } = Select;

export const StaffList: React.FC = () => {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    search: "",
    role: undefined as UserRole | undefined,
    isActive: undefined as boolean | undefined,
  });
  const [total, setTotal] = useState(0);
  const navigate = useNavigate();
  const { user } = useAuthStore();
  // const { user } = useAuth();

  // const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  useEffect(() => {
    fetchStaff();
  }, [filters]);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const response = await staffApi.getAll();
      setStaff(response.data);
      setTotal(response.meta.total);
    } catch (error) {
      console.error("Failed to fetch staff:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      await staffApi.toggleActive(id);
      fetchStaff();
    } catch (error) {
      console.error("Failed to toggle status:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this staff member?")) {
      try {
        await staffApi.delete(id);
        fetchStaff();
      } catch (error) {
        console.error("Failed to delete staff:", error);
      }
    }
  };

  const columns = [
    {
      title: "Staff Info",
      key: "info",
      render: (record: Staff) => (
        <Space>
          <Avatar
            src={record.avatar}
            icon={!record.avatar && record.firstName[0]}
          />
          <div>
            <div style={{ fontWeight: 600 }}>
              {record.firstName} {record.lastName}
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {record.staffCode}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: "Contact",
      key: "contact",
      render: (record: Staff) => (
        <Space direction="vertical" size={0}>
          <Space size={4}>
            <MailOutlined style={{ fontSize: 12 }} />
            <span style={{ fontSize: 13 }}>{record.email}</span>
          </Space>
          {record.phone && (
            <Space size={4}>
              <PhoneOutlined style={{ fontSize: 12 }} />
              <span style={{ fontSize: 13 }}>{record.phone}</span>
            </Space>
          )}
        </Space>
      ),
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      render: (role: UserRole) => (
        <Tag color={ROLE_COLORS[role]}>{ROLE_LABELS[role]}</Tag>
      ),
      filters: Object.keys(ROLE_LABELS).map((role) => ({
        text: ROLE_LABELS[role as UserRole],
        value: role,
      })),
    },
    {
      title: "Specialization",
      dataIndex: "specialization",
      key: "specialization",
      render: (spec: string | null) => spec || "-",
    },
    {
      title: "Status",
      key: "status",
      render: (record: Staff) => (
        <Space>
          <Badge
            status={record.isActive ? "success" : "error"}
            text={record.isActive ? "Active" : "Inactive"}
          />
          {record.isAvailable !== undefined && (
            <Tag color={record.isAvailable ? "green" : "red"}>
              {record.isAvailable ? "Available" : "Unavailable"}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Stats",
      key: "stats",
      render: (record: Staff) => (
        <Space size="large">
          <Tooltip title="Appointments">
            <span>📅 {record._count?.appointments || 0}</span>
          </Tooltip>
          <Tooltip title="Treatment Plans">
            <span>📋 {record._count?.treatmentPlans || 0}</span>
          </Tooltip>
        </Space>
      ),
    },
    {
      title: "Last Login",
      dataIndex: "lastLoginAt",
      key: "lastLoginAt",
      render: (date: string | null) =>
        date ? dayjs(date).format("MMM DD, YYYY HH:mm") : "Never",
    },
    {
      title: "Actions",
      key: "actions",
      render: (record: Staff) => (
        <Space>
          <Tooltip title="Edit">
            <Button
              icon={<EditOutlined />}
              onClick={() => navigate(`/staff/${record.id}/edit`)}
            />
          </Tooltip>
          <Tooltip title="Schedule">
            <Button
              icon={<ScheduleOutlined />}
              onClick={() => navigate(`/staff/${record.id}/schedule`)}
            />
          </Tooltip>
          <Tooltip title="Performance">
            <Button
              icon={<StarOutlined />}
              onClick={() => navigate(`/staff/${record.id}/performance`)}
            />
          </Tooltip>
          <Tooltip title={record.isActive ? "Deactivate" : "Activate"}>
            <Switch
              checked={record.isActive}
              onChange={() => handleToggleActive(record.id)}
              size="small"
            />
          </Tooltip>
          {isSuperAdmin && (
            <Tooltip title="Delete">
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDelete(record.id)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4}>Staff Management</Title>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            onClick={() => navigate("/staff/create")}
          >
            Add Staff Member
          </Button>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input.Search
            placeholder="Search by name, email, or staff code"
            value={filters.search}
            onChange={(e) =>
              setFilters({ ...filters, search: e.target.value, page: 1 })
            }
            allowClear
          />
        </Col>
        <Col span={6}>
          <Select
            placeholder="Filter by role"
            allowClear
            style={{ width: "100%" }}
            value={filters.role}
            onChange={(value) =>
              setFilters({ ...filters, role: value, page: 1 })
            }
          >
            {Object.keys(ROLE_LABELS).map((role) => (
              <Option key={role} value={role}>
                {ROLE_LABELS[role as UserRole]}
              </Option>
            ))}
            
          </Select>
        </Col>
        <Col span={6}>
          <Select
            placeholder="Filter by status"
            allowClear
            style={{ width: "100%" }}
            value={filters.isActive}
            onChange={(value) =>
              setFilters({ ...filters, isActive: value, page: 1 })
            }
          >
            <Option value={true}>Active</Option>
            <Option value={false}>Inactive</Option>
          </Select>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={staff}
        loading={loading}
        rowKey="id"
        pagination={{
          current: filters.page,
          pageSize: filters.limit,
          total: total,
          onChange: (page, pageSize) =>
            setFilters({ ...filters, page, limit: pageSize || 10 }),
        }}
      />
    </Card>
  );
};
