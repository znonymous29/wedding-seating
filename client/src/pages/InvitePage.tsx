import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button, Card, Result, message } from "antd";
import { TeamOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { projectApi } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import styles from "./Login.module.css";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(false);
  const [projectInfo, setProjectInfo] = useState<{
    projectId: string;
    projectName: string;
  } | null>(null);

  const handleJoin = async () => {
    if (!isAuthenticated) {
      message.info("请先登录后再加入项目");
      navigate(`/login?redirect=/invite/${token}`);
      return;
    }

    try {
      setLoading(true);
      const response = await projectApi.joinByToken(token!);

      if (response.data.success) {
        setJoined(true);
        setProjectInfo(response.data.data);
        message.success("成功加入项目！");
      }
    } catch (error: any) {
      message.error(
        error.response?.data?.message || "加入失败，邀请链接可能已过期"
      );
    } finally {
      setLoading(false);
    }
  };

  if (joined && projectInfo) {
    return (
      <div className={styles.container}>
        <Card
          className={styles.card}
          style={{ maxWidth: 400, textAlign: "center" }}
        >
          <Result
            icon={<CheckCircleOutlined style={{ color: "#6B9E78" }} />}
            title="成功加入项目！"
            subTitle={`您已成功加入「${projectInfo.projectName}」`}
            extra={
              <Button
                type="primary"
                size="large"
                onClick={() => navigate(`/project/${projectInfo.projectId}`)}
              >
                进入项目
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Card
        className={styles.card}
        style={{ maxWidth: 400, textAlign: "center", padding: "32px" }}
      >
        <div style={{ marginBottom: 24 }}>
          <TeamOutlined style={{ fontSize: 64, color: "#B76E79" }} />
        </div>
        <h2 style={{ fontFamily: "Playfair Display, serif", marginBottom: 8 }}>
          您收到了婚礼项目邀请
        </h2>
        <p style={{ color: "#8B8680", marginBottom: 32 }}>
          点击下方按钮加入项目，一起协作安排婚礼座位
        </p>

        <Button
          type="primary"
          size="large"
          loading={loading}
          onClick={handleJoin}
          block
        >
          {isAuthenticated ? "加入项目" : "登录并加入"}
        </Button>

        {!isAuthenticated && (
          <p style={{ marginTop: 16, color: "#8B8680", fontSize: 14 }}>
            还没有账号？
            <Link to={`/register?redirect=/invite/${token}`}>立即注册</Link>
          </p>
        )}
      </Card>
    </div>
  );
}
