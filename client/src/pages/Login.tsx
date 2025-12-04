import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Form, Input, Button, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { authApi } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import styles from "./Login.module.css";

interface LoginForm {
  account: string;
  password: string;
}

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (values: LoginForm) => {
    try {
      setLoading(true);
      const response = await authApi.login(values);

      if (response.data.success) {
        const { user, accessToken, refreshToken } = response.data.data;
        login(user, accessToken, refreshToken);
        message.success("登录成功！");
        navigate("/");
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || "登录失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* 背景装饰 */}
      <div className={styles.bgDecoration}>
        <div
          className={styles.floatingPetal}
          style={{ top: "10%", left: "10%", animationDelay: "0s" }}
        />
        <div
          className={styles.floatingPetal}
          style={{ top: "20%", right: "15%", animationDelay: "1s" }}
        />
        <div
          className={styles.floatingPetal}
          style={{ bottom: "30%", left: "20%", animationDelay: "2s" }}
        />
        <div
          className={styles.floatingPetal}
          style={{ bottom: "15%", right: "10%", animationDelay: "0.5s" }}
        />
        <div
          className={styles.floatingPetal}
          style={{ top: "50%", left: "5%", animationDelay: "1.5s" }}
        />
      </div>

      <div className={styles.cardWrapper}>
        <div className={styles.card}>
          {/* Logo */}
          <div className={styles.logo}>
            <span className={styles.logoIcon}>✦</span>
            <h1 className={styles.logoText}>席位绘</h1>
            <p className={styles.logoSubtext}>Wedding Seating</p>
          </div>

          {/* 表单 */}
          <Form
            name="login"
            onFinish={handleSubmit}
            autoComplete="off"
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="account"
              rules={[{ required: true, message: "请输入邮箱或手机号" }]}
            >
              <Input
                prefix={<UserOutlined className={styles.inputIcon} />}
                placeholder="邮箱或手机号"
                className={styles.input}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password
                prefix={<LockOutlined className={styles.inputIcon} />}
                placeholder="密码"
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
                登 录
              </Button>
            </Form.Item>
          </Form>

          {/* 注册链接 */}
          <p className={styles.registerLink}>
            还没有账号？
            <Link to="/register">立即注册 →</Link>
          </p>
        </div>

        {/* 右侧装饰图 */}
        <div className={styles.illustration}>
          <div className={styles.illustrationContent}>
            <div className={styles.weddingRings}>💍</div>
            <h2>
              让每一位宾客
              <br />
              都找到最合适的位置
            </h2>
            <p>
              高效管理婚礼座位安排
              <br />
              支持多人实时协作
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
