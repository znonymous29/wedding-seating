import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  Button,
  Input,
  Select,
  Tag,
  Space,
  Modal,
  Form,
  InputNumber,
  message,
  Upload,
  Popconfirm,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { guestApi, areaApi } from "../services/api";
import styles from "./GuestManagement.module.css";

interface Guest {
  id: string;
  name: string;
  headCount: number;
  phone: string | null;
  relationship: string | null;
  tags: string[];
  notes: string | null;
  area: { id: string; name: string; color: string } | null;
  assignment: { table: { id: string; name: string } } | null;
  createdBy: { id: string; nickname: string };
}

interface Area {
  id: string;
  name: string;
  color: string;
}

interface GuestManagementProps {
  projectId: string;
}

// 预设标签
const PRESET_TAGS = ["亲戚", "朋友", "同事", "领导", "VIP", "师长"];

// 标签颜色映射
const TAG_COLORS: Record<string, string> = {
  亲戚: "#E57373",
  朋友: "#81C784",
  同事: "#64B5F6",
  VIP: "#BA68C8",
  同学: "#FFD54F",
  领导: "#D4AF37",
};

export default function GuestManagement({ projectId }: GuestManagementProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState<string>();
  const [selectedTag, setSelectedTag] = useState<string>();
  const [assignedFilter, setAssignedFilter] = useState<string>();
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [form] = Form.useForm();

  // 获取宾客列表
  const { data: guestsData, isLoading } = useQuery({
    queryKey: [
      "guests",
      projectId,
      search,
      selectedAreaId,
      selectedTag,
      assignedFilter,
    ],
    queryFn: async () => {
      const response = await guestApi.getAll(projectId, {
        search: search || undefined,
        areaId: selectedAreaId,
        tag: selectedTag,
        assigned: assignedFilter,
        limit: 1000,
      });
      return response.data.data;
    },
  });

  // 获取区域列表
  const { data: areas } = useQuery({
    queryKey: ["areas", projectId],
    queryFn: async () => {
      const response = await areaApi.getAll(projectId);
      return response.data.data as Area[];
    },
  });

  // 获取所有标签
  const { data: tags } = useQuery({
    queryKey: ["tags", projectId],
    queryFn: async () => {
      const response = await guestApi.getTags(projectId);
      return response.data.data as string[];
    },
  });

  // 创建宾客
  const createMutation = useMutation({
    mutationFn: guestApi.create,
    onSuccess: () => {
      message.success("宾客添加成功");
      setModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || "添加失败");
    },
  });

  // 更新宾客
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      guestApi.update(id, data),
    onSuccess: () => {
      message.success("宾客信息已更新");
      setModalOpen(false);
      setEditingGuest(null);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || "更新失败");
    },
  });

  // 删除宾客
  const deleteMutation = useMutation({
    mutationFn: guestApi.delete,
    onSuccess: () => {
      message.success("宾客已删除");
      queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || "删除失败");
    },
  });

  // 批量删除
  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => guestApi.batchDelete(ids, projectId),
    onSuccess: () => {
      message.success("已删除选中的宾客");
      setSelectedRowKeys([]);
      queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || "批量删除失败");
    },
  });

  // 导入宾客
  const importMutation = useMutation({
    mutationFn: (formData: FormData) => guestApi.import(projectId, formData),
    onSuccess: (response) => {
      const { success, failed } = response.data.data;
      message.success(
        `成功导入 ${success} 位宾客${failed > 0 ? `，${failed} 条失败` : ""}`
      );
      setImportModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || "导入失败");
    },
  });

  // 下载模板
  const handleDownloadTemplate = async () => {
    try {
      const response = await guestApi.downloadTemplate();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "guest_template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      message.error("下载模板失败");
    }
  };

  // 导出宾客名单
  const handleExport = async () => {
    try {
      message.loading({ content: "正在导出...", key: "export" });
      const response = await guestApi.export(projectId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "宾客名单.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success({ content: "导出成功", key: "export" });
    } catch (error) {
      message.error({ content: "导出失败", key: "export" });
    }
  };

  // 处理文件上传
  const handleFileUpload = (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("areaId", selectedAreaId || "");
    formData.append("mode", "append");
    importMutation.mutate(formData);
    return false;
  };

  // 打开编辑弹窗
  const openEditModal = (guest: Guest) => {
    setEditingGuest(guest);
    form.setFieldsValue({
      name: guest.name,
      headCount: guest.headCount,
      phone: guest.phone,
      relationship: guest.relationship,
      tags: guest.tags,
      notes: guest.notes,
      areaId: guest.area?.id,
    });
    setModalOpen(true);
  };

  // 提交表单
  const handleSubmit = (values: any) => {
    if (editingGuest) {
      updateMutation.mutate({ id: editingGuest.id, data: values });
    } else {
      createMutation.mutate({ ...values, projectId });
    }
  };

  // 表格列配置
  const columns: ColumnsType<Guest> = [
    {
      title: "姓名",
      dataIndex: "name",
      key: "name",
      width: 120,
      render: (name) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
    {
      title: "人数",
      dataIndex: "headCount",
      key: "headCount",
      width: 80,
      align: "center",
      render: (count) => `${count}人`,
    },
    {
      title: "标签",
      dataIndex: "tags",
      key: "tags",
      width: 200,
      render: (tags: string[]) => (
        <Space size={4} wrap>
          {tags.map((tag) => (
            <Tag
              key={tag}
              color={TAG_COLORS[tag] || "#8B8680"}
              style={{ marginRight: 0 }}
            >
              {tag}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "状态",
      key: "status",
      width: 100,
      render: (_, record) =>
        record.assignment ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            {record.assignment.table.name}
          </Tag>
        ) : (
          <Tag icon={<ClockCircleOutlined />} color="default">
            未安排
          </Tag>
        ),
    },
    {
      title: "区域",
      dataIndex: "area",
      key: "area",
      width: 100,
      render: (area) =>
        area ? <Tag color={area.color}>{area.name}</Tag> : "-",
    },
    {
      title: "备注",
      dataIndex: "notes",
      key: "notes",
      width: 150,
      ellipsis: true,
      render: (notes) => notes || "-",
    },
    {
      title: "操作",
      key: "action",
      width: 120,
      render: (_, record) => (
        <Space size={8}>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除这位宾客吗？"
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const guests = guestsData?.guests || [];
  const allTags = [...new Set([...PRESET_TAGS, ...(tags || [])])];

  return (
    <div className={styles.container}>
      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <Input
            placeholder="搜索宾客..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            placeholder="区域"
            value={selectedAreaId}
            onChange={setSelectedAreaId}
            style={{ width: 120 }}
            allowClear
            options={areas?.map((a) => ({ label: a.name, value: a.id }))}
          />
          <Select
            placeholder="标签"
            value={selectedTag}
            onChange={setSelectedTag}
            style={{ width: 120 }}
            allowClear
            options={allTags.map((t) => ({ label: t, value: t }))}
          />
          <Select
            placeholder="状态"
            value={assignedFilter}
            onChange={setAssignedFilter}
            style={{ width: 120 }}
            allowClear
            options={[
              { label: "已安排", value: "true" },
              { label: "未安排", value: "false" },
            ]}
          />
        </div>

        <div className={styles.actions}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingGuest(null);
              form.resetFields();
              setModalOpen(true);
            }}
          >
            添加宾客
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={() => setImportModalOpen(true)}
          >
            导入Excel
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出名单
          </Button>
          {selectedRowKeys.length > 0 && (
            <Popconfirm
              title={`确定要删除选中的 ${selectedRowKeys.length} 位宾客吗？`}
              onConfirm={() => batchDeleteMutation.mutate(selectedRowKeys)}
              okText="删除"
              cancelText="取消"
            >
              <Button danger icon={<DeleteOutlined />}>
                批量删除 ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
          )}
        </div>
      </div>

      {/* 统计信息 */}
      <div className={styles.summary}>
        <span>
          共 <strong>{guestsData?.pagination?.total || 0}</strong> 位宾客
        </span>
        <span>
          总人数{" "}
          <strong>{guests.reduce((sum, g) => sum + g.headCount, 0)}</strong> 人
        </span>
      </div>

      {/* 表格 */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={guests}
        loading={isLoading}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条`,
        }}
        scroll={{ x: 900 }}
      />

      {/* 添加/编辑宾客弹窗 */}
      <Modal
        title={editingGuest ? "编辑宾客" : "添加宾客"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingGuest(null);
          form.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ headCount: 1 }}
        >
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: "请输入宾客姓名" }]}
          >
            <Input placeholder="宾客姓名" />
          </Form.Item>

          <Form.Item name="headCount" label="人数">
            <InputNumber min={1} max={20} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="areaId" label="所属区域">
            <Select
              placeholder="选择区域"
              allowClear
              options={areas?.map((a) => ({ label: a.name, value: a.id }))}
            />
          </Form.Item>

          <Form.Item name="tags" label="标签">
            <Select
              mode="multiple"
              placeholder="选择或输入标签"
              options={allTags.map((t) => ({ label: t, value: t }))}
              tokenSeparators={[","]}
            />
          </Form.Item>

          <Form.Item name="phone" label="手机号">
            <Input placeholder="手机号（选填）" />
          </Form.Item>

          <Form.Item name="relationship" label="与新人关系">
            <Input placeholder="例如：新郎大学室友" />
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="特殊需求（如忌口、轮椅等）" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={createMutation.isPending || updateMutation.isPending}
              block
            >
              {editingGuest ? "保存修改" : "添加宾客"}
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 导入弹窗 */}
      <Modal
        title="导入宾客"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={null}
        width={480}
      >
        <div className={styles.importContent}>
          <p>请上传 Excel 文件 (.xlsx, .xls)</p>

          <Upload
            accept=".xlsx,.xls"
            showUploadList={false}
            beforeUpload={handleFileUpload}
          >
            <Button
              icon={<UploadOutlined />}
              loading={importMutation.isPending}
              size="large"
              style={{ width: "100%", height: 100 }}
            >
              点击选择文件或拖拽到此处
            </Button>
          </Upload>

          <div className={styles.importTip}>
            <Button
              type="link"
              icon={<DownloadOutlined />}
              onClick={handleDownloadTemplate}
            >
              下载导入模板
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
