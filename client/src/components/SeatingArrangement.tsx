import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Input,
  Select,
  Tag,
  Modal,
  Form,
  InputNumber,
  message,
  Empty,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
} from "@dnd-kit/core";
import { guestApi, tableApi, seatingApi, areaApi } from "../services/api";
import DraggableGuest from "./DraggableGuest";
import DroppableTable from "./DroppableTable";
import styles from "./SeatingArrangement.module.css";

interface Guest {
  id: string;
  name: string;
  headCount: number;
  tags: string[];
  area: { id: string; name: string; color: string } | null;
  assignment: { table: { id: string; name: string } } | null;
}

interface TableWithGuests {
  id: string;
  name: string;
  capacity: number;
  area: { id: string; name: string; color: string } | null;
  assignments: Array<{
    guest: {
      id: string;
      name: string;
      headCount: number;
      tags: string[];
    };
  }>;
  occupiedSeats: number;
  availableSeats: number;
}

interface SeatingArrangementProps {
  projectId: string;
}

export default function SeatingArrangement({
  projectId,
}: SeatingArrangementProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState<string>();
  const [activeGuest, setActiveGuest] = useState<Guest | null>(null);
  const [createTableModalOpen, setCreateTableModalOpen] = useState(false);
  const [editTableModalOpen, setEditTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableWithGuests | null>(
    null
  );
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // 获取未安排的宾客
  const { data: unassignedGuests = [] } = useQuery({
    queryKey: ["guests", projectId, "unassigned", search, selectedAreaId],
    queryFn: async () => {
      const response = await guestApi.getAll(projectId, {
        search: search || undefined,
        areaId: selectedAreaId,
        assigned: "false",
        limit: 1000,
      });
      return response.data.data.guests as Guest[];
    },
  });

  // 获取所有桌位
  const { data: tables = [] } = useQuery({
    queryKey: ["tables", projectId],
    queryFn: async () => {
      const response = await tableApi.getAll(projectId);
      return response.data.data as TableWithGuests[];
    },
  });

  // 获取区域列表
  const { data: areas } = useQuery({
    queryKey: ["areas", projectId],
    queryFn: async () => {
      const response = await areaApi.getAll(projectId);
      return response.data.data;
    },
  });

  // 安排座位
  const assignMutation = useMutation({
    mutationFn: seatingApi.assign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
      queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || "安排失败");
    },
  });

  // 移除座位
  const unassignMutation = useMutation({
    mutationFn: seatingApi.unassign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
      queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || "移除失败");
    },
  });

  // 移动宾客
  const moveMutation = useMutation({
    mutationFn: seatingApi.move,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
      queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || "移动失败");
    },
  });

  // 创建桌位
  const createTableMutation = useMutation({
    mutationFn: tableApi.create,
    onSuccess: () => {
      message.success("桌位创建成功");
      setCreateTableModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || "创建失败");
    },
  });

  // 批量创建桌位
  const batchCreateTableMutation = useMutation({
    mutationFn: tableApi.batchCreate,
    onSuccess: () => {
      message.success("桌位创建成功");
      setCreateTableModalOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || "创建失败");
    },
  });

  // 一键自动排座
  const autoAssignMutation = useMutation({
    mutationFn: () => seatingApi.autoAssign(projectId),
    onSuccess: (response) => {
      const { assigned, failed } = response.data.data;
      message.success(
        `自动排座完成：成功 ${assigned} 人${
          failed > 0 ? `，失败 ${failed} 人` : ""
        }`
      );
      queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
      queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || "自动排座失败");
    },
  });

  // 删除桌位
  const deleteTableMutation = useMutation({
    mutationFn: tableApi.delete,
    onSuccess: () => {
      message.success("桌位已删除");
      queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || "删除失败");
    },
  });

  // 更新桌位
  const updateTableMutation = useMutation({
    mutationFn: ({ tableId, data }: { tableId: string; data: any }) =>
      tableApi.update(tableId, data),
    onSuccess: () => {
      message.success("桌位已更新");
      setEditTableModalOpen(false);
      setEditingTable(null);
      editForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || "更新失败");
    },
  });

  // 拖拽开始
  const handleDragStart = (event: any) => {
    const { active } = event;
    const guestId = active.id as string;

    // 从未安排列表或桌位中找到宾客
    const guest =
      unassignedGuests.find((g) => g.id === guestId) ||
      tables
        .flatMap((t) =>
          t.assignments.map((a) => ({
            ...a.guest,
            assignment: { table: { id: t.id, name: t.name } },
          }))
        )
        .find((g) => g.id === guestId);

    if (guest) {
      setActiveGuest(guest as Guest);
    }
  };

  // 拖拽结束
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    setActiveGuest(null);

    if (!over) return;

    const guestId = active.id as string;
    const targetId = over.id as string;

    // 如果目标是"未安排"区域
    if (targetId === "unassigned") {
      const guest = tables
        .flatMap((t) => t.assignments)
        .find((a) => a.guest.id === guestId);
      if (guest) {
        unassignMutation.mutate(guestId);
      }
      return;
    }

    // 目标是桌位
    const targetTable = tables.find((t) => t.id === targetId);
    if (!targetTable) return;

    // 检查宾客是否已在某桌
    const currentTable = tables.find((t) =>
      t.assignments.some((a) => a.guest.id === guestId)
    );

    if (currentTable) {
      // 从一桌移到另一桌
      if (currentTable.id !== targetId) {
        moveMutation.mutate({ guestId, newTableId: targetId });
      }
    } else {
      // 从未安排列表安排到桌位
      assignMutation.mutate({ guestId, tableId: targetId });
    }
  };

  // 处理创建桌位
  const handleCreateTable = (values: any) => {
    if (values.batchCount && values.batchCount > 1) {
      batchCreateTableMutation.mutate({
        projectId,
        count: values.batchCount,
        namePrefix: values.namePrefix,
        capacity: values.capacity,
        areaId: values.areaId,
        startNumber: values.startNumber || 1,
      });
    } else {
      createTableMutation.mutate({
        projectId,
        name: values.name,
        capacity: values.capacity,
        areaId: values.areaId,
      });
    }
  };

  // 打开编辑桌位弹窗
  const handleOpenEditTable = (table: TableWithGuests) => {
    setEditingTable(table);
    editForm.setFieldsValue({
      name: table.name,
      capacity: table.capacity,
      areaId: table.area?.id,
    });
    setEditTableModalOpen(true);
  };

  // 处理更新桌位
  const handleUpdateTable = (values: any) => {
    if (!editingTable) return;
    updateTableMutation.mutate({
      tableId: editingTable.id,
      data: {
        name: values.name,
        capacity: values.capacity,
        areaId: values.areaId || null,
      },
    });
  };

  const totalUnassignedCount = unassignedGuests.reduce(
    (sum, g) => sum + g.headCount,
    0
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={styles.container}>
        {/* 左侧：待安排宾客 */}
        <div className={styles.guestPanel}>
          <div className={styles.panelHeader}>
            <h3>📋 待安排宾客 ({totalUnassignedCount}人)</h3>
          </div>

          <div className={styles.filters}>
            <Input
              placeholder="搜索..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              allowClear
            />
            <Select
              placeholder="区域"
              value={selectedAreaId}
              onChange={setSelectedAreaId}
              size="small"
              style={{ width: 100 }}
              allowClear
              options={areas?.map((a: any) => ({ label: a.name, value: a.id }))}
            />
          </div>

          <div className={styles.guestList} id="unassigned">
            {unassignedGuests.length === 0 ? (
              <Empty description="所有宾客都已安排" />
            ) : (
              unassignedGuests.map((guest) => (
                <DraggableGuest key={guest.id} guest={guest} />
              ))
            )}
          </div>

          <div className={styles.panelFooter}>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={() => autoAssignMutation.mutate()}
              loading={autoAssignMutation.isPending}
              block
            >
              一键智能排座
            </Button>
          </div>
        </div>

        {/* 右侧：桌位布局 */}
        <div className={styles.tablePanel}>
          <div className={styles.panelHeader}>
            <h3>🪑 桌位布局</h3>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setCreateTableModalOpen(true)}
            >
              添加桌位
            </Button>
          </div>

          <div className={styles.tableGrid}>
            {tables.length === 0 ? (
              <Empty description="还没有桌位，请先创建">
                <Button
                  type="primary"
                  onClick={() => setCreateTableModalOpen(true)}
                >
                  创建桌位
                </Button>
              </Empty>
            ) : (
              tables.map((table) => (
                <DroppableTable
                  key={table.id}
                  table={table}
                  onRemoveGuest={(guestId) => unassignMutation.mutate(guestId)}
                  onDeleteTable={(tableId) =>
                    deleteTableMutation.mutate(tableId)
                  }
                  onEditTable={handleOpenEditTable}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* 拖拽预览 */}
      <DragOverlay>
        {activeGuest && (
          <div className={styles.dragPreview}>
            <UserOutlined />
            <span>{activeGuest.name}</span>
            <Tag>{activeGuest.headCount}人</Tag>
          </div>
        )}
      </DragOverlay>

      {/* 创建桌位弹窗 */}
      <Modal
        title="创建桌位"
        open={createTableModalOpen}
        onCancel={() => setCreateTableModalOpen(false)}
        footer={null}
        width={400}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateTable}
          initialValues={{ capacity: 10, batchCount: 1, startNumber: 1 }}
        >
          <Form.Item name="batchCount" label="批量创建数量">
            <InputNumber min={1} max={50} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.batchCount !== curr.batchCount}
          >
            {({ getFieldValue }) =>
              getFieldValue("batchCount") === 1 ? (
                <Form.Item
                  name="name"
                  label="桌位名称"
                  rules={[{ required: true, message: "请输入桌位名称" }]}
                >
                  <Input placeholder="例如：第1桌" />
                </Form.Item>
              ) : (
                <>
                  <Form.Item name="namePrefix" label="名称前缀">
                    <Input placeholder="留空则为第X桌" />
                  </Form.Item>
                  <Form.Item name="startNumber" label="起始编号">
                    <InputNumber min={1} style={{ width: "100%" }} />
                  </Form.Item>
                </>
              )
            }
          </Form.Item>

          <Form.Item name="capacity" label="座位数">
            <InputNumber min={4} max={20} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="areaId" label="所属区域">
            <Select
              placeholder="选择区域"
              allowClear
              options={areas?.map((a: any) => ({ label: a.name, value: a.id }))}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={
                createTableMutation.isPending ||
                batchCreateTableMutation.isPending
              }
              block
            >
              创建桌位
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑桌位弹窗 */}
      <Modal
        title="编辑桌位"
        open={editTableModalOpen}
        onCancel={() => {
          setEditTableModalOpen(false);
          setEditingTable(null);
          editForm.resetFields();
        }}
        footer={null}
        width={400}
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdateTable}>
          <Form.Item
            name="name"
            label="桌位名称"
            rules={[{ required: true, message: "请输入桌位名称" }]}
          >
            <Input placeholder="例如：第1桌" />
          </Form.Item>

          <Form.Item
            name="capacity"
            label="座位数"
            extra={
              editingTable && editingTable.occupiedSeats > 0
                ? `当前已安排 ${editingTable.occupiedSeats} 人，座位数不能少于此数`
                : undefined
            }
          >
            <InputNumber
              min={editingTable?.occupiedSeats || 1}
              max={20}
              style={{ width: "100%" }}
            />
          </Form.Item>

          <Form.Item name="areaId" label="所属区域">
            <Select
              placeholder="选择区域"
              allowClear
              options={areas?.map((a: any) => ({ label: a.name, value: a.id }))}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={updateTableMutation.isPending}
              block
            >
              保存修改
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </DndContext>
  );
}
