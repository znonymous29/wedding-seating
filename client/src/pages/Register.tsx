import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Form, Input, Button, message } from 'antd'
import { MailOutlined, LockOutlined, UserOutlined, PhoneOutlined } from '@ant-design/icons'
import { authApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import styles from './Login.module.css'

interface RegisterForm {
  email: string
  password: string
  confirmPassword: string
  nickname: string
  phone?: string
}

export default function Register() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)

  const handleSubmit = async (values: RegisterForm) => {
    try {
      setLoading(true)
      const { confirmPassword, ...data } = values
      const response = await authApi.register(data)
      
      if (response.data.success) {
        const { user, accessToken, refreshToken } = response.data.data
        login(user, accessToken, refreshToken)
        message.success('注册成功！')
        navigate('/')
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || '注册失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      {/* 背景装饰 */}
      <div className={styles.bgDecoration}>
        <div className={styles.floatingPetal} style={{ top: '10%', left: '10%', animationDelay: '0s' }} />
        <div className={styles.floatingPetal} style={{ top: '20%', right: '15%', animationDelay: '1s' }} />
        <div className={styles.floatingPetal} style={{ bottom: '30%', left: '20%', animationDelay: '2s' }} />
        <div className={styles.floatingPetal} style={{ bottom: '15%', right: '10%', animationDelay: '0.5s' }} />
        <div className={styles.floatingPetal} style={{ top: '50%', left: '5%', animationDelay: '1.5s' }} />
      </div>

      <div className={styles.cardWrapper}>
        <div className={styles.card}>
          {/* Logo */}
          <div className={styles.logo}>
            <span className={styles.logoIcon}>✦</span>
            <h1 className={styles.logoText}>席位绘</h1>
            <p className={styles.logoSubtext}>创建您的账号</p>
          </div>

          {/* 表单 */}
          <Form
            name="register"
            onFinish={handleSubmit}
            autoComplete="off"
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="nickname"
              rules={[{ required: true, message: '请输入您的昵称' }]}
            >
              <Input
                prefix={<UserOutlined className={styles.inputIcon} />}
                placeholder="昵称"
                className={styles.input}
              />
            </Form.Item>

            <Form.Item
              name="email"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效的邮箱地址' },
              ]}
            >
              <Input
                prefix={<MailOutlined className={styles.inputIcon} />}
                placeholder="邮箱地址"
                className={styles.input}
              />
            </Form.Item>

            <Form.Item
              name="phone"
            >
              <Input
                prefix={<PhoneOutlined className={styles.inputIcon} />}
                placeholder="手机号（选填）"
                className={styles.input}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6位' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className={styles.inputIcon} />}
                placeholder="密码（至少6位）"
                className={styles.input}
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'))
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className={styles.inputIcon} />}
                placeholder="确认密码"
                className={styles.input}
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                className={styles.submitBtn}
              >
                注 册
              </Button>
            </Form.Item>
          </Form>

          {/* 登录链接 */}
          <p className={styles.registerLink}>
            已有账号？
            <Link to="/login">立即登录 →</Link>
          </p>
        </div>

        {/* 右侧装饰图 */}
        <div className={styles.illustration}>
          <div className={styles.illustrationContent}>
            <div className={styles.weddingRings}>🎊</div>
            <h2>开启您的<br />婚礼筹备之旅</h2>
            <p>智能座位安排，让筹备更轻松<br />与伴侣、家人一起协作</p>
          </div>
        </div>
      </div>
    </div>
  )
}

