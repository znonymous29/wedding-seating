import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Form,
  Input,
  DatePicker,
  InputNumber,
  Button,
  Tabs,
  List,
  Avatar,
  Tag,
  Modal,
  Select,
  message,
  Popconfirm,
  Space,
} from 'antd'
import {
  UserOutlined,
  LinkOutlined,
  DeleteOutlined,
  CopyOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { projectApi, areaApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import styles from './ProjectSettings.module.css'

interface ProjectSettingsProps {
  projectId: string
  project: any
}

export default function ProjectSettings({ projectId, project }: ProjectSettingsProps) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [areaModalOpen, setAreaModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [inviteForm] = Form.useForm()
  const [areaForm] = Form.useForm()

  // 获取成员列表
  const { data: members } = useQuery({
    queryKey: ['members', projectId],
    queryFn: async () => {
      const response = await projectApi.getMembers(projectId)
      return response.data.data
    },
  })

  // 获取区域列表
  const { data: areas } = useQuery({
    queryKey: ['areas', projectId],
    queryFn: async () => {
      const response = await areaApi.getAll(projectId)
      return response.data.data
    },
  })

  // 更新项目
  const updateMutation = useMutation({
    mutationFn: (data: any) => projectApi.update(projectId, data),
    onSuccess: () => {
      message.success('保存成功')
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '保存失败')
    },
  })

  // 生成邀请链接
  const inviteMutation = useMutation({
    mutationFn: (data: { role: string; areaId?: string; expiresInHours?: number }) =>
      projectApi.createInvitation(projectId, data),
    onSuccess: (response) => {
      setInviteLink(response.data.data.inviteLink)
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '生成失败')
    },
  })

  // 移除成员
  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => projectApi.removeMember(projectId, memberId),
    onSuccess: () => {
      message.success('成员已移除')
      queryClient.invalidateQueries({ queryKey: ['members', projectId] })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '移除失败')
    },
  })

  // 创建区域
  const createAreaMutation = useMutation({
    mutationFn: areaApi.create,
    onSuccess: () => {
      message.success('区域创建成功')
      setAreaModalOpen(false)
      areaForm.resetFields()
      queryClient.invalidateQueries({ queryKey: ['areas', projectId] })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '创建失败')
    },
  })

  // 删除区域
  const deleteAreaMutation = useMutation({
    mutationFn: areaApi.delete,
    onSuccess: () => {
      message.success('区域已删除')
      queryClient.invalidateQueries({ queryKey: ['areas', projectId] })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '删除失败')
    },
  })

  const handleSaveProject = (values: any) => {
    updateMutation.mutate({
      name: values.name,
      weddingDate: values.weddingDate?.format('YYYY-MM-DD'),
      venue: values.venue,
      defaultSeatsPerTable: values.defaultSeatsPerTable,
    })
  }

  const handleGenerateInvite = (values: any) => {
    inviteMutation.mutate(values)
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink)
    message.success('链接已复制')
  }

  const roleLabels: Record<string, string> = {
    OWNER: '主办人',
    COLLABORATOR: '协作者',
    VIEWER: '只读',
  }

  const roleColors: Record<string, string> = {
    OWNER: '#D4AF37',
    COLLABORATOR: '#B76E79',
    VIEWER: '#8B8680',
  }

  const isOwner = project.members?.some(
    (m: any) => m.userId === user?.id && m.role === 'OWNER'
  )

  const tabItems = [
    {
      key: 'basic',
      label: '📌 基本信息',
      children: (
        <Card>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSaveProject}
            initialValues={{
              name: project.name,
              weddingDate: project.weddingDate ? dayjs(project.weddingDate) : null,
              venue: project.venue,
              defaultSeatsPerTable: project.defaultSeatsPerTable,
            }}
          >
            <Form.Item
              name="name"
              label="项目名称"
              rules={[{ required: true, message: '请输入项目名称' }]}
            >
              <Input placeholder="例如：张三 & 李四的婚礼" />
            </Form.Item>

            <Form.Item name="weddingDate" label="婚礼日期">
              <DatePicker style={{ width: '100%' }} placeholder="选择婚礼日期" />
            </Form.Item>

            <Form.Item name="venue" label="婚礼地点">
              <Input placeholder="例如：北京香格里拉大酒店" />
            </Form.Item>

            <Form.Item name="defaultSeatsPerTable" label="默认每桌人数">
              <InputNumber min={4} max={20} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={updateMutation.isPending}
                disabled={!isOwner}
              >
                保存修改
              </Button>
              {!isOwner && (
                <span style={{ marginLeft: 12, color: 'var(--text-secondary)' }}>
                  仅主办人可修改
                </span>
              )}
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'members',
      label: '👥 成员管理',
      children: (
        <Card>
          {isOwner && (
            <Button
              type="primary"
              icon={<LinkOutlined />}
              onClick={() => {
                setInviteLink('')
                setInviteModalOpen(true)
              }}
              style={{ marginBottom: 16 }}
            >
              生成邀请链接
            </Button>
          )}

          <List
            dataSource={members}
            renderItem={(member: any) => (
              <List.Item
                actions={
                  isOwner && member.role !== 'OWNER'
                    ? [
                        <Popconfirm
                          title="确定要移除该成员吗？"
                          onConfirm={() => removeMemberMutation.mutate(member.id)}
                        >
                          <Button type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>,
                      ]
                    : []
                }
              >
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} src={member.user.avatar} />}
                  title={
                    <Space>
                      {member.user.nickname}
                      <Tag color={roleColors[member.role]}>{roleLabels[member.role]}</Tag>
                    </Space>
                  }
                  description={
                    <>
                      {member.user.email}
                      {member.area && (
                        <Tag color={member.area.color} style={{ marginLeft: 8 }}>
                          {member.area.name}
                        </Tag>
                      )}
                    </>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      ),
    },
    {
      key: 'areas',
      label: '🗂️ 区域管理',
      children: (
        <Card>
          {isOwner && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setAreaModalOpen(true)}
              style={{ marginBottom: 16 }}
            >
              添加区域
            </Button>
          )}

          <List
            dataSource={areas}
            renderItem={(area: any) => (
              <List.Item
                actions={
                  isOwner
                    ? [
                        <Popconfirm
                          title="确定要删除该区域吗？"
                          onConfirm={() => deleteAreaMutation.mutate(area.id)}
                        >
                          <Button type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>,
                      ]
                    : []
                }
              >
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        backgroundColor: area.color,
                      }}
                    />
                  }
                  title={area.name}
                  description={`${area.stats?.guestCount || 0} 位宾客 · ${area.stats?.tableCount || 0} 桌`}
                />
              </List.Item>
            )}
          />
        </Card>
      ),
    },
  ]

  return (
    <div className={styles.container}>
      <Tabs items={tabItems} />

      {/* 邀请弹窗 */}
      <Modal
        title="邀请成员"
        open={inviteModalOpen}
        onCancel={() => setInviteModalOpen(false)}
        footer={null}
        width={400}
      >
        {inviteLink ? (
          <div className={styles.inviteLinkBox}>
            <p>邀请链接已生成，有效期24小时：</p>
            <Input
              value={inviteLink}
              readOnly
              addonAfter={
                <CopyOutlined onClick={handleCopyLink} style={{ cursor: 'pointer' }} />
              }
            />
            <Button
              block
              style={{ marginTop: 16 }}
              onClick={() => setInviteLink('')}
            >
              生成新链接
            </Button>
          </div>
        ) : (
          <Form
            form={inviteForm}
            layout="vertical"
            onFinish={handleGenerateInvite}
            initialValues={{ role: 'COLLABORATOR', expiresInHours: 24 }}
          >
            <Form.Item
              name="role"
              label="角色"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  { label: '协作者 - 可编辑', value: 'COLLABORATOR' },
                  { label: '只读 - 仅查看', value: 'VIEWER' },
                ]}
              />
            </Form.Item>

            <Form.Item name="areaId" label="负责区域（可选）">
              <Select
                placeholder="不限区域"
                allowClear
                options={areas?.map((a: any) => ({ label: a.name, value: a.id }))}
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={inviteMutation.isPending}
                block
              >
                生成邀请链接
              </Button>
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* 添加区域弹窗 */}
      <Modal
        title="添加区域"
        open={areaModalOpen}
        onCancel={() => setAreaModalOpen(false)}
        footer={null}
        width={360}
      >
        <Form
          form={areaForm}
          layout="vertical"
          onFinish={(values) => createAreaMutation.mutate({ ...values, projectId })}
          initialValues={{ color: '#B76E79' }}
        >
          <Form.Item
            name="name"
            label="区域名称"
            rules={[{ required: true, message: '请输入区域名称' }]}
          >
            <Input placeholder="例如：新郎方、新娘方" />
          </Form.Item>

          <Form.Item name="color" label="区域颜色">
            <Input type="color" style={{ width: 80, height: 40 }} />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={createAreaMutation.isPending}
              block
            >
              添加区域
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

