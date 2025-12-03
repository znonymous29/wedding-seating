import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import App from "./App";
import "./index.css";

dayjs.locale("zh-cn");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Ant Design 主题配置
const theme = {
  token: {
    colorPrimary: "#B76E79",
    colorLink: "#B76E79",
    colorSuccess: "#6B9E78",
    colorWarning: "#E6B422",
    colorError: "#C75B5B",
    borderRadius: 12,
    fontFamily:
      '"Inter", "思源黑体", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  components: {
    Button: {
      borderRadius: 8,
    },
    Card: {
      borderRadiusLG: 16,
    },
    Input: {
      borderRadius: 8,
    },
    Select: {
      borderRadius: 8,
    },
  },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN} theme={theme}>
        <AntApp>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
