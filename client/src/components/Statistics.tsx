import { useQuery } from '@tanstack/react-query'
import { Card, Statistic, Progress, List, Tag, Empty } from 'antd'
import {
  TeamOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TableOutlined,
} from '@ant-design/icons'
import { projectApi, guestApi, areaApi } from '../services/api'
import styles from './Statistics.module.css'

interface StatisticsProps {
  projectId: string
}

const TAG_COLORS: Record<string, string> = {
  '亲戚': '#E57373',
  '朋友': '#81C784',
  '同事': '#64B5F6',
  'VIP': '#BA68C8',
  '师长': '#FFD54F',
  '领导': '#D4AF37',
}

export default function Statistics({ projectId }: StatisticsProps) {
  // 获取项目统计
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const response = await projectApi.getOne(projectId)
      return response.data.data
    },
  })

  // 获取所有宾客（用于统计标签）
  const { data: guestsData } = useQuery({
    queryKey: ['guests', projectId, 'all'],
    queryFn: async () => {
      const response = await guestApi.getAll(projectId, { limit: 1000 })
      return response.data.data.guests
    },
  })

  // 获取区域统计
  const { data: areas } = useQuery({
    queryKey: ['areas', projectId],
    queryFn: async () => {
      const response = await areaApi.getAll(projectId)
      return response.data.data
    },
  })

  if (!project) return null

  const { stats } = project
  const unassignedCount = stats.totalGuests - stats.assignedGuests
  const assignedPercentage = stats.totalGuests > 0
    ? Math.round((stats.assignedGuests / stats.totalGuests) * 100)
    : 0

  // 统计标签分布
  const tagCounts: Record<string, number> = {}
  guestsData?.forEach((guest: any) => {
    guest.tags.forEach((tag: string) => {
      tagCounts[tag] = (tagCounts[tag] || 0) + guest.headCount
    })
  })
  const tagStats = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)

  return (
    <div className={styles.container}>
      {/* 概览卡片 */}
      <div className={styles.overviewCards}>
        <Card className={styles.statCard}>
          <Statistic
            title="总宾客"
            value={stats.totalGuests}
            suffix="人"
            prefix={<TeamOutlined />}
            styles={{ content: { color: 'var(--text-primary)' } }}
          />
        </Card>
        <Card className={styles.statCard}>
          <Statistic
            title="已安排"
            value={stats.assignedGuests}
            suffix="人"
            prefix={<CheckCircleOutlined />}
            styles={{ content: { color: '#6B9E78' } }}
          />
        </Card>
        <Card className={styles.statCard}>
          <Statistic
            title="未安排"
            value={unassignedCount}
            suffix="人"
            prefix={<ClockCircleOutlined />}
            styles={{ content: { color: unassignedCount > 0 ? '#E6B422' : '#6B9E78' } }}
          />
        </Card>
        <Card className={styles.statCard}>
          <Statistic
            title="桌位数"
            value={stats.tableCount}
            suffix="桌"
            prefix={<TableOutlined />}
            styles={{ content: { color: 'var(--text-primary)' } }}
          />
        </Card>
      </div>

      {/* 进度条 */}
      <Card className={styles.progressCard}>
        <h3>座位安排进度</h3>
        <Progress
          percent={assignedPercentage}
          strokeColor={{
            '0%': '#B76E79',
            '100%': '#6B9E78',
          }}
          size={['100%', 20]}
        />
        <div className={styles.progressInfo}>
          <span>已安排 {stats.assignedGuests} 人</span>
          <span>剩余 {unassignedCount} 人待安排</span>
        </div>
      </Card>

      <div className={styles.chartsRow}>
        {/* 标签分布 */}
        <Card className={styles.chartCard}>
          <h3>📊 宾客标签分布</h3>
          {tagStats.length === 0 ? (
            <Empty description="暂无数据" />
          ) : (
            <div className={styles.tagChart}>
              {tagStats.map(([tag, count]) => {
                const percentage = Math.round((count / stats.totalGuests) * 100)
                return (
                  <div key={tag} className={styles.tagRow}>
                    <div className={styles.tagInfo}>
                      <Tag color={TAG_COLORS[tag] || '#8B8680'}>{tag}</Tag>
                      <span>{count}人</span>
                    </div>
                    <div className={styles.tagBar}>
                      <div
                        className={styles.tagBarFill}
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: TAG_COLORS[tag] || '#8B8680',
                        }}
                      />
                    </div>
                    <span className={styles.tagPercent}>{percentage}%</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* 区域分布 */}
        <Card className={styles.chartCard}>
          <h3>📈 区域人数对比</h3>
          {!areas || areas.length === 0 ? (
            <Empty description="暂无区域" />
          ) : (
            <div className={styles.areaChart}>
              {areas.map((area: any) => {
                const areaTotal = area.stats?.totalHeadCount || 0
                const maxCount = Math.max(...areas.map((a: any) => a.stats?.totalHeadCount || 0), 1)
                const percentage = Math.round((areaTotal / maxCount) * 100)
                
                return (
                  <div key={area.id} className={styles.areaRow}>
                    <div className={styles.areaInfo}>
                      <span
                        className={styles.areaDot}
                        style={{ backgroundColor: area.color }}
                      />
                      <span>{area.name}</span>
                    </div>
                    <div className={styles.areaBar}>
                      <div
                        className={styles.areaBarFill}
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: area.color,
                        }}
                      />
                    </div>
                    <span className={styles.areaCount}>{areaTotal}人</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* 容量统计 */}
      <Card className={styles.capacityCard}>
        <h3>🪑 桌位容量统计</h3>
        <div className={styles.capacityInfo}>
          <div className={styles.capacityItem}>
            <span className={styles.capacityLabel}>总座位数</span>
            <span className={styles.capacityValue}>{stats.totalCapacity || 0}</span>
          </div>
          <div className={styles.capacityItem}>
            <span className={styles.capacityLabel}>已用座位</span>
            <span className={styles.capacityValue} style={{ color: '#B76E79' }}>
              {stats.assignedGuests}
            </span>
          </div>
          <div className={styles.capacityItem}>
            <span className={styles.capacityLabel}>剩余座位</span>
            <span className={styles.capacityValue} style={{ color: '#6B9E78' }}>
              {(stats.totalCapacity || 0) - stats.assignedGuests}
            </span>
          </div>
          <div className={styles.capacityItem}>
            <span className={styles.capacityLabel}>使用率</span>
            <span className={styles.capacityValue}>
              {stats.totalCapacity > 0
                ? Math.round((stats.assignedGuests / stats.totalCapacity) * 100)
                : 0}%
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}

