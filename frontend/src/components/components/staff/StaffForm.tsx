// src/components/staff/StaffForm.tsx
import React, { useEffect } from "react";
import {
  Form,
  Input,
  Select,
  Button,
  Card,
  Row,
  Col,
  Switch,
  Typography,
  Space,
} from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { ROLE_LABELS } from "@/types/staff";
import { UserRole } from "@/types/shared";

import { staffApi } from "@/services/staffApi";

const { Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

export const StaffForm: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  useEffect(() => {
    if (isEditing) {
      fetchStaff();
    }
  }, [id]);

  const fetchStaff = async () => {
    try {
      const data = await staffApi.getById(id!);
      form.setFieldsValue({
        ...data,
        ...data.user,
      });
    } catch (error) {
      console.error("Failed to fetch staff:", error);
    }
  };

  const onFinish = async (values: any) => {
    try {
      if (isEditing) {
        await staffApi.update(id!, values);
      } else {
        await staffApi.create(values);
      }
      navigate("/staff");
    } catch (error) {
      console.error("Failed to save staff:", error);
    }
  };

  return (
    <Card>
      <Title level={4}>
        {isEditing ? "Edit Staff Member" : "Create Staff Member"}
      </Title>

      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="firstName"
              label="First Name"
              rules={[{ required: true, message: "First name is required" }]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="lastName"
              label="Last Name"
              rules={[{ required: true, message: "Last name is required" }]}
            >
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: "Email is required" },
                { type: "email", message: "Invalid email" },
              ]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="phone" label="Phone">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        {!isEditing && (
          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: "Password is required", min: 6 },
            ]}
          >
            <Input.Password />
          </Form.Item>
        )}

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="role"
              label="Role"
              rules={[{ required: true, message: "Role is required" }]}
            >
              <Select placeholder="Select role">
                {Object.keys(ROLE_LABELS).map((role) => (
                  <Option key={role} value={role}>
                    {ROLE_LABELS[role as UserRole]}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="specialization" label="Specialization">
              <Input placeholder="e.g., Orthodontics" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="qualification" label="Qualification">
              <Input placeholder="e.g., BDS, MDS" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="licenseNumber" label="License Number">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="bio" label="Bio">
          <TextArea rows={4} />
        </Form.Item>

        {isEditing && (
          <Form.Item name="isAvailable" valuePropName="checked">
            <Switch
              checkedChildren="Available"
              unCheckedChildren="Unavailable"
            />
          </Form.Item>
        )}

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              {isEditing ? "Update" : "Create"}
            </Button>
            <Button onClick={() => navigate("/staff")}>Cancel</Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};
