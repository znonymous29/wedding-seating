import { useDroppable } from '@dnd-kit/core'
import { Tag, Tooltip, Button, Progress, Popconfirm } from 'antd'
import { DeleteOutlined, UserOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons'
import styles from './DroppableTable.module.css'

interface TableGuest {
  id: string
  name: string
  headCount: number
  tags: string[]
}

interface TableWithGuests {
  id: string
  name: string
  capacity: number
  area: { id: string; name: string; color: string } | null
  assignments: Array<{
    guest: TableGuest
  }>
  occupiedSeats: number
  availableSeats: number
}

interface DroppableTableProps {
  table: TableWithGuests
  onRemoveGuest: (guestId: string) => void
  onDeleteTable?: (tableId: string) => void
  onEditTable?: (table: TableWithGuests) => void
}

export default function DroppableTable({ table, onRemoveGuest, onDeleteTable, onEditTable }: DroppableTableProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: table.id,
  })

  const percentage = Math.round((table.occupiedSeats / table.capacity) * 100)
  
  const getStatusColor = () => {
    if (table.occupiedSeats === 0) return '#d9d9d9'
    if (table.occupiedSeats >= table.capacity) return '#6B9E78'
    return '#B76E79'
  }

  const getStatusText = () => {
    if (table.occupiedSeats === 0) return '空桌'
    if (table.occupiedSeats >= table.capacity) return '已满'
    return '未满'
  }

  return (
    <div
      ref={setNodeRef}
      className={`${styles.table} ${isOver ? styles.isOver : ''}`}
    >
      <div className={styles.header}>
        <div className={styles.tableName}>
          <span className={styles.name}>{table.name}</span>
          {table.area && (
            <Tag color={table.area.color} className={styles.areaTag}>
              {table.area.name}
            </Tag>
          )}
        </div>
        <div className={styles.headerActions}>
          <Tag color={getStatusColor()} className={styles.statusTag}>
            {getStatusText()}
          </Tag>
          {onEditTable && (
            <Tooltip title="编辑桌位">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                className={styles.editTableBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  onEditTable(table)
                }}
              />
            </Tooltip>
          )}
          {onDeleteTable && table.occupiedSeats === 0 && (
            <Popconfirm
              title="确定要删除这个桌位吗？"
              onConfirm={() => onDeleteTable(table.id)}
              okText="删除"
              cancelText="取消"
            >
              <Tooltip title="删除桌位">
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  className={styles.deleteTableBtn}
                  onClick={(e) => e.stopPropagation()}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </div>
      </div>

      <div className={styles.capacity}>
        <span>{table.occupiedSeats}/{table.capacity} 人</span>
        <Progress
          percent={percentage}
          size="small"
          strokeColor={getStatusColor()}
          showInfo={false}
        />
      </div>

      <div className={styles.guestList}>
        {table.assignments.length === 0 ? (
          <div className={styles.emptyHint}>
            拖拽宾客到此处
          </div>
        ) : (
          table.assignments.map(({ guest }) => (
            <div key={guest.id} className={styles.guestItem}>
              <div className={styles.guestInfo}>
                <UserOutlined className={styles.guestIcon} />
                <span className={styles.guestName}>{guest.name}</span>
                <span className={styles.guestCount}>({guest.headCount}人)</span>
              </div>
              <Tooltip title="移除">
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  className={styles.removeBtn}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveGuest(guest.id)
                  }}
                />
              </Tooltip>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
