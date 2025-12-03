import { useDraggable } from '@dnd-kit/core'
import { Tag } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import styles from './DraggableGuest.module.css'

interface Guest {
  id: string
  name: string
  headCount: number
  tags: string[]
  area?: { id: string; name: string; color: string } | null
}

interface DraggableGuestProps {
  guest: Guest
}

const TAG_COLORS: Record<string, string> = {
  '亲戚': '#E57373',
  '朋友': '#81C784',
  '同事': '#64B5F6',
  'VIP': '#BA68C8',
  '师长': '#FFD54F',
  '领导': '#D4AF37',
}

export default function DraggableGuest({ guest }: DraggableGuestProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: guest.id,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`${styles.guestCard} ${isDragging ? styles.dragging : ''}`}
    >
      <div className={styles.guestInfo}>
        <UserOutlined className={styles.icon} />
        <span className={styles.name}>{guest.name}</span>
        <Tag className={styles.countTag}>{guest.headCount}人</Tag>
      </div>
      {guest.tags.length > 0 && (
        <div className={styles.tags}>
          {guest.tags.slice(0, 2).map((tag) => (
            <Tag
              key={tag}
              color={TAG_COLORS[tag] || '#8B8680'}
              className={styles.tag}
            >
              {tag}
            </Tag>
          ))}
          {guest.tags.length > 2 && (
            <span className={styles.moreTags}>+{guest.tags.length - 2}</span>
          )}
        </div>
      )}
    </div>
  )
}

