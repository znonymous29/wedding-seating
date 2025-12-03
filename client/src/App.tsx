import { Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Spin } from 'antd'
import { useAuthStore } from './stores/authStore'

// 懒加载页面组件
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const InvitePage = lazy(() => import('./pages/InvitePage'))

// 加载中组件
const LoadingPage = () => (
  <div style={{
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'var(--bg-cream)',
  }}>
    <Spin size="large" />
  </div>
)

// 需要登录的路由保护
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

// 已登录用户重定向
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore()
  
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }
  
  return <>{children}</>
}

function App() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <Routes>
        {/* 公开路由 */}
        <Route path="/login" element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        } />
        <Route path="/register" element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        } />
        
        {/* 邀请链接（无需登录可访问，但需要登录才能加入） */}
        <Route path="/invite/:token" element={<InvitePage />} />
        
        {/* 需要登录的路由 */}
        <Route path="/" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/project/:projectId/*" element={
          <ProtectedRoute>
            <ProjectDetail />
          </ProtectedRoute>
        } />
        
        {/* 404 重定向 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
