import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Form, Input, Button, message, Segmented } from "antd";
import {
  MailOutlined,
  LockOutlined,
  UserOutlined,
  PhoneOutlined,
} from "@ant-design/icons";
import { authApi } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import styles from "./Login.module.css";

type RegisterType = "email" | "phone";

interface RegisterForm {
  account: string;
  password: string;
  confirmPassword: string;
  nickname: string;
}

export default function Register() {
  const [loading, setLoading] = useState(false);
  const [registerType, setRegisterType] = useState<RegisterType>("phone");
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [form] = Form.useForm();

  const handleSubmit = async (values: RegisterForm) => {
    try {
      setLoading(true);
      const { account, password, nickname } = values;

      // 根据注册类型构造数据
      const data =
        registerType === "phone"
          ? { phone: account, password, nickname }
          : { email: account, password, nickname };

      const response = await authApi.register(data);

      if (response.data.success) {
        const { user, accessToken, refreshToken } = response.data.data;
        login(user, accessToken, refreshToken);
        message.success("注册成功！");
        navigate("/");
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || "注册失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleTypeChange = (value: RegisterType) => {
    setRegisterType(value);
    form.setFieldValue("account", ""); // 清空账号输入
  };

  // 根据注册类型设置验证规则
  const getAccountRules = () => {
    if (registerType === "phone") {
      return [
        { required: true, message: "请输入手机号" },
        { pattern: /^1[3-9]\d{9}$/, message: "请输入有效的手机号" },
      ];
    }
    return [
      { required: true, message: "请输入邮箱" },
      { type: "email" as const, message: "请输入有效的邮箱地址" },
    ];
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
            <p className={styles.logoSubtext}>创建您的账号</p>
          </div>

          {/* 注册方式切换 */}
          <div style={{ marginBottom: 24, textAlign: "center" }}>
            <Segmented
              value={registerType}
              onChange={(value) => handleTypeChange(value as RegisterType)}
              options={[
                { label: "手机号注册", value: "phone" },
                { label: "邮箱注册", value: "email" },
              ]}
              block
            />
          </div>

          {/* 表单 */}
          <Form
            form={form}
            name="register"
            onFinish={handleSubmit}
            autoComplete="off"
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="nickname"
              rules={[{ required: true, message: "请输入您的昵称" }]}
            >
              <Input
                prefix={<UserOutlined className={styles.inputIcon} />}
                placeholder="昵称"
                className={styles.input}
              />
            </Form.Item>

            <Form.Item
              name="account"
              rules={getAccountRules()}
              key={registerType} // 切换时重新渲染以更新验证
            >
              <Input
                prefix={
                  registerType === "phone" ? (
                    <PhoneOutlined className={styles.inputIcon} />
                  ) : (
                    <MailOutlined className={styles.inputIcon} />
                  )
                }
                placeholder={registerType === "phone" ? "手机号" : "邮箱地址"}
                className={styles.input}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: "请输入密码" },
                { min: 6, message: "密码至少6位" },
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
              dependencies={["password"]}
              rules={[
                { required: true, message: "请确认密码" },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("password") === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error("两次输入的密码不一致"));
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
            <h2>
              开启您的
              <br />
              婚礼筹备之旅
            </h2>
            <p>
              智能座位安排，让筹备更轻松
              <br />
              与伴侣、家人一起协作
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
