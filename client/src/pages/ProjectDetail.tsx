import { useEffect, useState } from "react";
import {
  useParams,
  useNavigate,
  Routes,
  Route,
  NavLink,
  useLocation,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout, Menu, Avatar, Tooltip, Statistic, Spin, message } from "antd";
import {
  ArrowLeftOutlined,
  TeamOutlined,
  TableOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { projectApi } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import {
  connectSocket,
  disconnectSocket,
  joinProject,
  leaveProject,
  setupSocketListeners,
  removeSocketListeners,
} from "../services/socket";
import GuestManagement from "../components/GuestManagement";
import SeatingArrangement from "../components/SeatingArrangement";
import FloorPlan from "../components/FloorPlan";
import Statistics from "../components/Statistics";
import ProjectSettings from "../components/ProjectSettings";
import styles from "./ProjectDetail.module.css";

const { Header, Sider, Content } = Layout;

interface OnlineMember {
  userId: string;
  nickname: string;
}

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [onlineMembers, setOnlineMembers] = useState<OnlineMember[]>([]);

  // 获取项目详情
  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const response = await projectApi.getOne(projectId!);
      return response.data.data;
    },
    enabled: !!projectId,
  });

  // 连接 Socket 并加入项目房间
  useEffect(() => {
    if (!projectId || !user) return;

    connectSocket();

    // 设置事件监听
    setupSocketListeners({
      onMembersList: (members) => {
        // 收到当前在线成员列表
        setOnlineMembers(members);
      },
      onMemberOnline: (data) => {
        setOnlineMembers((prev) => {
          if (prev.some((m) => m.userId === data.userId)) return prev;
          return [...prev, data];
        });
        message.info(`${data.nickname} 上线了`);
      },
      onMemberOffline: (data) => {
        setOnlineMembers((prev) =>
          prev.filter((m) => m.userId !== data.userId)
        );
      },
      onGuestCreated: () => {
        queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      },
      onGuestUpdated: () => {
        queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
      },
      onGuestDeleted: () => {
        queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      },
      onGuestsImported: () => {
        queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      },
      onTableCreated: () => {
        queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      },
      onTableUpdated: () => {
        queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
      },
      onTableDeleted: () => {
        queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      },
      onSeatingAssigned: () => {
        queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
        queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      },
      onSeatingUnassigned: () => {
        queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
        queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      },
      onSeatingMoved: () => {
        queryClient.invalidateQueries({ queryKey: ["guests", projectId] });
        queryClient.invalidateQueries({ queryKey: ["tables", projectId] });
      },
    });

    // 加入项目房间
    joinProject(projectId);

    return () => {
      leaveProject(projectId);
      removeSocketListeners();
    };
  }, [projectId, user, queryClient]);

  // 组件卸载时断开连接
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className={styles.error}>
        <p>项目不存在或您没有访问权限</p>
        <a onClick={() => navigate("/")}>返回首页</a>
      </div>
    );
  }

  const daysUntilWedding = project.weddingDate
    ? dayjs(project.weddingDate).diff(dayjs(), "day")
    : null;

  const menuItems = [
    {
      key: "guests",
      icon: <TeamOutlined />,
      label: <NavLink to={`/project/${projectId}/guests`}>宾客管理</NavLink>,
    },
    {
      key: "seating",
      icon: <TableOutlined />,
      label: <NavLink to={`/project/${projectId}/seating`}>座位安排</NavLink>,
    },
    {
      key: "floor-plan",
      icon: <AppstoreOutlined />,
      label: (
        <NavLink to={`/project/${projectId}/floor-plan`}>场地布局</NavLink>
      ),
    },
    {
      key: "statistics",
      icon: <BarChartOutlined />,
      label: (
        <NavLink to={`/project/${projectId}/statistics`}>数据统计</NavLink>
      ),
    },
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: <NavLink to={`/project/${projectId}/settings`}>项目设置</NavLink>,
    },
  ];

  // 根据当前路径获取选中的菜单项
  const getSelectedKey = () => {
    const path = location.pathname;
    if (path.includes("/guests")) return "guests";
    if (path.includes("/seating")) return "seating";
    if (path.includes("/floor-plan")) return "floor-plan";
    if (path.includes("/statistics")) return "statistics";
    if (path.includes("/settings")) return "settings";
    return "guests";
  };

  // 移动端导航项
  const mobileNavItems = [
    { key: "guests", icon: <TeamOutlined />, label: "宾客", path: "guests" },
    { key: "seating", icon: <TableOutlined />, label: "座位", path: "seating" },
    {
      key: "floor-plan",
      icon: <AppstoreOutlined />,
      label: "布局",
      path: "floor-plan",
    },
    {
      key: "statistics",
      icon: <BarChartOutlined />,
      label: "统计",
      path: "statistics",
    },
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: "设置",
      path: "settings",
    },
  ];

  return (
    <Layout className={styles.layout}>
      {/* 顶部导航 */}
      <Header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate("/")}>
            <ArrowLeftOutlined />
          </button>
          <div className={styles.projectTitle}>
            <h1>{project.name}</h1>
          </div>
        </div>

        <div className={styles.headerCenter}>
          {/* 在线成员 */}
          <div className={styles.onlineMembers}>
            <span className={styles.onlineLabel}>在线:</span>
            <Avatar.Group max={{ count: 5 }} size="small">
              {onlineMembers.map((member) => (
                <Tooltip key={member.userId} title={member.nickname}>
                  <Avatar
                    size="small"
                    icon={<UserOutlined />}
                    style={{ backgroundColor: "#B76E79" }}
                  />
                </Tooltip>
              ))}
            </Avatar.Group>
          </div>
        </div>

        <div className={styles.headerRight}>
          <SettingOutlined className={styles.headerIcon} />
        </div>
      </Header>

      <Layout>
        {/* 侧边栏 */}
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          className={styles.sider}
          width={220}
          theme="light"
        >
          {/* 统计概览 */}
          <div className={styles.statsOverview}>
            <div className={styles.statItem}>
              <Statistic
                title="总宾客"
                value={project.stats.totalGuests}
                suffix="人"
                styles={{ content: { fontSize: collapsed ? 16 : 24 } }}
              />
            </div>
            <div className={styles.statItem}>
              <Statistic
                title="已安排"
                value={project.stats.assignedGuests}
                suffix="人"
                styles={{
                  content: { fontSize: collapsed ? 16 : 24, color: "#6B9E78" },
                }}
              />
            </div>
            <div className={styles.statItem}>
              <Statistic
                title="桌位"
                value={project.stats.tableCount}
                suffix="桌"
                styles={{ content: { fontSize: collapsed ? 16 : 24 } }}
              />
            </div>
            {daysUntilWedding !== null && daysUntilWedding >= 0 && (
              <div className={styles.statItem}>
                <Statistic
                  title="倒计时"
                  value={daysUntilWedding}
                  suffix="天"
                  styles={{
                    content: {
                      fontSize: collapsed ? 16 : 24,
                      color: "#B76E79",
                    },
                  }}
                />
              </div>
            )}
          </div>

          <Menu
            mode="inline"
            selectedKeys={[getSelectedKey()]}
            items={menuItems}
            className={styles.menu}
          />
        </Sider>

        {/* 主内容区 */}
        <Content className={styles.content}>
          {/* 移动端统计概览条 */}
          <div className={styles.mobileStats}>
            <div className={styles.mobileStatItem}>
              <div className={styles.mobileStatValue}>
                {project.stats.totalGuests}
              </div>
              <div className={styles.mobileStatLabel}>总宾客</div>
            </div>
            <div className={styles.mobileStatItem}>
              <div
                className={`${styles.mobileStatValue}`}
                style={{ color: "#6B9E78" }}
              >
                {project.stats.assignedGuests}
              </div>
              <div className={styles.mobileStatLabel}>已安排</div>
            </div>
            <div className={styles.mobileStatItem}>
              <div className={styles.mobileStatValue}>
                {project.stats.tableCount}
              </div>
              <div className={styles.mobileStatLabel}>桌位</div>
            </div>
            {daysUntilWedding !== null && daysUntilWedding >= 0 && (
              <div className={styles.mobileStatItem}>
                <div
                  className={`${styles.mobileStatValue} ${styles.highlight}`}
                >
                  {daysUntilWedding}
                </div>
                <div className={styles.mobileStatLabel}>天后</div>
              </div>
            )}
          </div>

          <Routes>
            <Route index element={<GuestManagement projectId={projectId!} />} />
            <Route
              path="guests"
              element={<GuestManagement projectId={projectId!} />}
            />
            <Route
              path="seating"
              element={<SeatingArrangement projectId={projectId!} />}
            />
            <Route
              path="floor-plan"
              element={<FloorPlan projectId={projectId!} />}
            />
            <Route
              path="statistics"
              element={<Statistics projectId={projectId!} />}
            />
            <Route
              path="settings"
              element={
                <ProjectSettings projectId={projectId!} project={project} />
              }
            />
          </Routes>
        </Content>
      </Layout>

      {/* 移动端底部导航 */}
      <nav className={styles.mobileNav}>
        {mobileNavItems.map((item) => (
          <NavLink
            key={item.key}
            to={`/project/${projectId}/${item.path}`}
            className={({ isActive }) =>
              `${styles.mobileNavItem} ${
                isActive || getSelectedKey() === item.key ? styles.active : ""
              }`
            }
          >
            <span className={styles.mobileNavIcon}>{item.icon}</span>
            <span className={styles.mobileNavLabel}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </Layout>
  );
}
