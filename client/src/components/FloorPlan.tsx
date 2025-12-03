import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Tooltip, message } from "antd";
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  SaveOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import html2canvas from "html2canvas";
import { tableApi } from "../services/api";
import styles from "./FloorPlan.module.css";

interface TableGuest {
  id: string;
  name: string;
  headCount: number;
}

interface TableWithGuests {
  id: string;
  name: string;
  capacity: number;
  positionX: number;
  positionY: number;
  area: { id: string; name: string; color: string } | null;
  occupiedSeats: number;
  availableSeats: number;
  assignments: Array<{
    guest: TableGuest;
  }>;
}

interface SeatInfo {
  guestName: string;
  seatIndex: number;
  totalSeats: number;
  isEmpty: boolean;
}

interface FloorPlanProps {
  projectId: string;
}

export default function FloorPlan({ projectId }: FloorPlanProps) {
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [dragStartTablePos, setDragStartTablePos] = useState({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);

  // 获取所有桌位
  const { data: tables = [] } = useQuery({
    queryKey: ["tables", projectId],
    queryFn: async () => {
      const response = await tableApi.getAll(projectId);
      return response.data.data as TableWithGuests[];
    },
  });

  // 保存位置
  const savePositionsMutation = useMutation({
    mutationFn: (
      positions: { id: string; positionX: number; positionY: number }[]
    ) => tableApi.updatePositions(projectId, positions),
    onSuccess: () => {
      message.success("布局已保存");
      setPositions({});
      queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
    },
    onError: () => {
      message.error("保存失败");
    },
  });

  const getTablePosition = useCallback(
    (table: TableWithGuests) => {
      if (positions[table.id]) {
        return positions[table.id];
      }
      return { x: table.positionX || 0, y: table.positionY || 0 };
    },
    [positions]
  );

  const handleMouseDown = (e: React.MouseEvent, tableId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    const pos = getTablePosition(table);

    setDragId(tableId);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setDragStartTablePos({ x: pos.x, y: pos.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragId) return;

    const dx = (e.clientX - dragStartPos.x) / scale;
    const dy = (e.clientY - dragStartPos.y) / scale;

    // 扩大可移动范围，适应更大的画布
    const newX = Math.max(0, Math.min(dragStartTablePos.x + dx, 1600));
    const newY = Math.max(0, Math.min(dragStartTablePos.y + dy, 900));

    setPositions((prev) => ({
      ...prev,
      [dragId]: { x: newX, y: newY },
    }));
  };

  const handleMouseUp = () => {
    setDragId(null);
  };

  const handleSave = () => {
    const updatedPositions = tables.map((table) => {
      const pos = getTablePosition(table);
      return {
        id: table.id,
        positionX: pos.x,
        positionY: pos.y,
      };
    });
    savePositionsMutation.mutate(updatedPositions);
  };

  // 导出图片
  const handleExportImage = async () => {
    if (!canvasRef.current) return;

    setExporting(true);
    message.loading({ content: "正在生成图片...", key: "export" });

    try {
      // 暂时重置缩放以导出原始大小
      const originalTransform = canvasRef.current.style.transform;
      canvasRef.current.style.transform = "scale(1)";

      const canvas = await html2canvas(canvasRef.current, {
        backgroundColor: "#f8f6f3",
        scale: 2, // 高清导出
        useCORS: true,
        logging: false,
      });

      // 恢复缩放
      canvasRef.current.style.transform = originalTransform;

      // 下载图片
      const link = document.createElement("a");
      link.download = `场地布局_${new Date().toLocaleDateString()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      message.success({ content: "图片导出成功", key: "export" });
    } catch (error) {
      console.error("导出失败:", error);
      message.error({ content: "导出失败，请重试", key: "export" });
    } finally {
      setExporting(false);
    }
  };

  const getTableColor = (table: TableWithGuests) => {
    if (table.occupiedSeats === 0) return "#E8E4DF";
    if (table.occupiedSeats >= table.capacity) return "#6B9E78";
    return "#B76E79";
  };

  // 生成座位列表（将宾客拆分成单个座位）
  const generateSeats = (table: TableWithGuests): SeatInfo[] => {
    const seats: SeatInfo[] = [];

    // 先添加已安排的座位
    if (table.assignments) {
      table.assignments.forEach((assignment) => {
        const guest = assignment.guest;
        for (let i = 0; i < guest.headCount; i++) {
          seats.push({
            guestName: guest.name,
            seatIndex: i + 1,
            totalSeats: guest.headCount,
            isEmpty: false,
          });
        }
      });
    }

    // 填充空座位
    const emptyCount = table.capacity - seats.length;
    for (let i = 0; i < emptyCount; i++) {
      seats.push({
        guestName: "",
        seatIndex: 0,
        totalSeats: 0,
        isEmpty: true,
      });
    }

    return seats;
  };

  // 计算座位在圆周上的位置
  const getSeatPosition = (index: number, total: number, radius: number) => {
    // 从顶部开始，顺时针排列
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  };

  // 根据座位数计算尺寸（座位离桌子更近）
  const getTableSize = (capacity: number) => {
    if (capacity <= 8) return { tableRadius: 45, seatRadius: 72, seatSize: 50 };
    if (capacity <= 10)
      return { tableRadius: 50, seatRadius: 82, seatSize: 48 };
    if (capacity <= 12)
      return { tableRadius: 55, seatRadius: 92, seatSize: 46 };
    return { tableRadius: 60, seatRadius: 102, seatSize: 44 };
  };

  return (
    <div className={styles.container}>
      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <div className={styles.tools}>
          <Tooltip title="放大">
            <Button
              icon={<ZoomInOutlined />}
              onClick={() => setScale((s) => Math.min(s + 0.1, 2))}
            />
          </Tooltip>
          <Tooltip title="缩小">
            <Button
              icon={<ZoomOutOutlined />}
              onClick={() => setScale((s) => Math.max(s - 0.1, 0.5))}
            />
          </Tooltip>
          <span className={styles.scaleText}>{Math.round(scale * 100)}%</span>
        </div>
        <div className={styles.actions}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={savePositionsMutation.isPending}
          >
            保存布局
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportImage}
            loading={exporting}
          >
            导出图片
          </Button>
        </div>
      </div>

      {/* 画布 */}
      <div className={styles.canvasWrapper}>
        <div
          ref={canvasRef}
          className={styles.canvas}
          style={{ transform: `scale(${scale})` }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* 舞台 */}
          <div className={styles.stage}>🎭 舞 台</div>

          {/* 桌位 */}
          {tables.map((table) => {
            const pos = getTablePosition(table);
            const seats = generateSeats(table);
            const { tableRadius, seatRadius, seatSize } = getTableSize(
              table.capacity
            );

            return (
              <div
                key={table.id}
                className={`${styles.tableWrapper} ${
                  dragId === table.id ? styles.dragging : ""
                }`}
                style={{
                  left: pos.x,
                  top: pos.y + 100,
                  width: seatRadius * 2 + seatSize,
                  height: seatRadius * 2 + seatSize,
                }}
                onMouseDown={(e) => handleMouseDown(e, table.id)}
              >
                {/* 座位环绕 */}
                {seats.map((seat, index) => {
                  const seatPos = getSeatPosition(
                    index,
                    table.capacity,
                    seatRadius
                  );
                  return (
                    <div
                      key={index}
                      className={`${styles.seat} ${
                        seat.isEmpty ? styles.emptySeat : styles.occupiedSeat
                      }`}
                      style={{
                        left: `calc(50% + ${seatPos.x}px - ${seatSize / 2}px)`,
                        top: `calc(50% + ${seatPos.y}px - ${seatSize / 2}px)`,
                        width: seatSize,
                        height: seatSize,
                      }}
                    >
                      {!seat.isEmpty && (
                        <>
                          <span className={styles.seatName}>
                            {seat.guestName}
                          </span>
                          <span className={styles.seatIndex}>
                            {seat.seatIndex}/{seat.totalSeats}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}

                {/* 桌位中心 */}
                <div
                  className={styles.tableCenter}
                  style={{
                    width: tableRadius * 2,
                    height: tableRadius * 2,
                    backgroundColor: getTableColor(table),
                    borderColor: table.area?.color || "#d9d9d9",
                  }}
                >
                  <div className={styles.tableName}>{table.name}</div>
                  <div className={styles.tableCapacity}>
                    {table.occupiedSeats}/{table.capacity}
                  </div>
                </div>
              </div>
            );
          })}

          {/* 入口标记 */}
          <div className={styles.entrance}>🚪 入口</div>
        </div>
      </div>

      {/* 图例 */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span
            className={styles.legendColor}
            style={{ backgroundColor: "#E8E4DF" }}
          />
          <span>空桌</span>
        </div>
        <div className={styles.legendItem}>
          <span
            className={styles.legendColor}
            style={{ backgroundColor: "#B76E79" }}
          />
          <span>未满</span>
        </div>
        <div className={styles.legendItem}>
          <span
            className={styles.legendColor}
            style={{ backgroundColor: "#6B9E78" }}
          />
          <span>已满</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendColor} ${styles.emptySeatLegend}`} />
          <span>空座</span>
        </div>
        <div className={styles.legendItem}>
          <span
            className={`${styles.legendColor} ${styles.occupiedSeatLegend}`}
          />
          <span>已坐</span>
        </div>
      </div>
    </div>
  );
}
