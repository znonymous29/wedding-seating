import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Button,
  Modal,
  Form,
  Input,
  DatePicker,
  InputNumber,
  message,
  Progress,
  Empty,
  Dropdown,
  Avatar,
  Spin,
} from 'antd'
import {
  PlusOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
  TeamOutlined,
  MoreOutlined,
  LogoutOutlined,
  UserOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { projectApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import styles from './Dashboard.module.css'

interface Project {
  id: string
  name: string
  weddingDate: string | null
  venue: string | null
  coverImage: string | null
  status: string
  myRole: string
  owner: {
    id: string
    nickname: string
    avatar: string | null
  }
  stats: {
    totalGuests: number
    assignedGuests: number
    tableCount: number
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, logout } = useAuthStore()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [form] = Form.useForm()

  // 获取项目列表
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await projectApi.getAll()
      return response.data.data as Project[]
    },
  })

  // 创建项目
  const createMutation = useMutation({
    mutationFn: projectApi.create,
    onSuccess: (response) => {
      if (response.data.success) {
        message.success('项目创建成功！')
        setCreateModalOpen(false)
        form.resetFields()
        queryClient.invalidateQueries({ queryKey: ['projects'] })
        navigate(`/project/${response.data.data.id}`)
      }
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '创建失败')
    },
  })

  // 删除项目
  const deleteMutation = useMutation({
    mutationFn: projectApi.delete,
    onSuccess: () => {
      message.success('项目已删除')
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '删除失败')
    },
  })

  const handleCreateProject = (values: any) => {
    createMutation.mutate({
      name: values.name,
      weddingDate: values.weddingDate?.format('YYYY-MM-DD'),
      venue: values.venue,
      defaultSeatsPerTable: values.defaultSeatsPerTable,
    })
  }

  const handleDeleteProject = (projectId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后项目数据将无法恢复，确定要删除吗？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteMutation.mutate(projectId),
    })
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人设置',
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: handleLogout,
    },
  ]

  // 我创建的项目
  const myProjects = projects?.filter((p) => p.myRole === 'OWNER') || []
  // 我参与的项目
  const joinedProjects = projects?.filter((p) => p.myRole !== 'OWNER') || []

  return (
    <div className={styles.container}>
      {/* 头部 */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>✦ 席位绘</span>
        </div>
        <div className={styles.headerRight}>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div className={styles.userInfo}>
              <Avatar
                src={user?.avatar}
                icon={<UserOutlined />}
                className={styles.avatar}
              />
              <span className={styles.userName}>{user?.nickname}</span>
            </div>
          </Dropdown>
        </div>
      </header>

      {/* 主内容区 */}
      <main className={styles.main}>
        {/* 欢迎语 */}
        <div className={styles.welcome}>
          <h1>欢迎回来，{user?.nickname} ✨</h1>
          <p>"愿每一位宾客都能找到最合适的位置"</p>
        </div>

        {/* 我的项目 */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>我的项目</h2>
          
          {isLoading ? (
            <div className={styles.loading}>
              <Spin size="large" />
            </div>
          ) : (
            <div className={styles.projectGrid}>
              {myProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onEnter={() => navigate(`/project/${project.id}`)}
                  onDelete={() => handleDeleteProject(project.id)}
                />
              ))}

              {/* 创建新项目卡片 */}
              <Card
                className={`${styles.projectCard} ${styles.createCard}`}
                onClick={() => setCreateModalOpen(true)}
              >
                <div className={styles.createContent}>
                  <PlusOutlined className={styles.createIcon} />
                  <span>创建新项目</span>
                </div>
              </Card>
            </div>
          )}
        </section>

        {/* 参与的项目 */}
        {joinedProjects.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>参与的项目</h2>
            <div className={styles.projectGrid}>
              {joinedProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onEnter={() => navigate(`/project/${project.id}`)}
                  showRole
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* 创建项目弹窗 */}
      <Modal
        title="创建婚礼项目"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        width={480}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateProject}
          initialValues={{ defaultSeatsPerTable: 10 }}
        >
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="例如：张三 & 李四的婚礼" />
          </Form.Item>

          <Form.Item name="weddingDate" label="婚礼日期">
            <DatePicker
              style={{ width: '100%' }}
              placeholder="选择婚礼日期"
              disabledDate={(current) => current && current < dayjs().startOf('day')}
            />
          </Form.Item>

          <Form.Item name="venue" label="婚礼地点">
            <Input placeholder="例如：北京香格里拉大酒店" />
          </Form.Item>

          <Form.Item name="defaultSeatsPerTable" label="每桌默认人数">
            <InputNumber min={4} max={20} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={createMutation.isPending}
              block
              size="large"
            >
              创建项目
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// 项目卡片组件
interface ProjectCardProps {
  project: Project
  onEnter: () => void
  onDelete?: () => void
  showRole?: boolean
}

function ProjectCard({ project, onEnter, onDelete, showRole }: ProjectCardProps) {
  const progress = project.stats.totalGuests > 0
    ? Math.round((project.stats.assignedGuests / project.stats.totalGuests) * 100)
    : 0

  const daysUntilWedding = project.weddingDate
    ? dayjs(project.weddingDate).diff(dayjs(), 'day')
    : null

  const menuItems = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '项目设置',
    },
    ...(onDelete
      ? [
          { type: 'divider' as const },
          {
            key: 'delete',
            icon: <LogoutOutlined />,
            label: '删除项目',
            danger: true,
            onClick: onDelete,
          },
        ]
      : []),
  ]

  const roleLabels: Record<string, string> = {
    OWNER: '主办人',
    COLLABORATOR: '协作者',
    VIEWER: '只读',
  }

  return (
    <Card className={`${styles.projectCard} hover-card`}>
      {/* 封面图 */}
      <div
        className={styles.projectCover}
        style={{
          background: project.coverImage
            ? `url(${project.coverImage}) center/cover`
            : 'linear-gradient(135deg, #B76E79 0%, #D4A5A5 100%)',
        }}
      >
        {daysUntilWedding !== null && daysUntilWedding >= 0 && (
          <div className={styles.countdown}>
            还有 <strong>{daysUntilWedding}</strong> 天
          </div>
        )}
        {showRole && (
          <div className={styles.roleTag}>
            {roleLabels[project.myRole]}
          </div>
        )}
      </div>

      {/* 项目信息 */}
      <div className={styles.projectInfo}>
        <div className={styles.projectHeader}>
          <h3 className={styles.projectName}>{project.name}</h3>
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} size="small" />
          </Dropdown>
        </div>

        <div className={styles.projectMeta}>
          {project.weddingDate && (
            <span>
              <CalendarOutlined /> {dayjs(project.weddingDate).format('YYYY.MM.DD')}
            </span>
          )}
          {project.venue && (
            <span>
              <EnvironmentOutlined /> {project.venue}
            </span>
          )}
        </div>

        {/* 进度 */}
        <div className={styles.projectStats}>
          <div className={styles.statsText}>
            <TeamOutlined />
            <span>
              {project.stats.assignedGuests}/{project.stats.totalGuests}人
            </span>
          </div>
          <Progress
            percent={progress}
            size="small"
            strokeColor="#B76E79"
            showInfo={false}
          />
          <span className={styles.progressText}>{progress}% 已安排</span>
        </div>

        <Button type="primary" block onClick={onEnter}>
          进入项目
        </Button>
      </div>
    </Card>
  )
}

