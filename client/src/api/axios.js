import axios from 'axios';
import { isMockEnabled, mockAdapter } from './mock';

// 根据环境自动选择 baseURL
const getBaseURL = () => {
  // 如果在 Shopify Admin 中（通过 iframe），使用完整 URL
  if (window.location.hostname === 'admin.shopify.com') {
    return 'https://hera-fulfiller.onrender.com';
  }
  
  // 生产环境
  if (process.env.NODE_ENV === 'production') {
    return 'https://hera-fulfiller.onrender.com';
  }
  
  // 开发环境 —— 用相对路径，走 client/package.json 里配置的 CRA proxy（当前指向 server 实际监听的
  // 3001 端口）。这样以后 server 端口变了只用改 proxy 一处，不用两边对齐。
  return '';
};

const instance = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  },
  // 🆕 本地"只看 UI"模式：client/.env.development.local 里设了 REACT_APP_MOCK_API=true 时，
  // 所有请求都不走网络，直接在浏览器内存里用 mock.js 里的假数据应答（见该文件顶部注释）。
  // 没设这个变量（默认）完全不受影响，走上面原来的 baseURL/proxy 逻辑连真实后端。
  ...(isMockEnabled() ? { adapter: mockAdapter } : {})
});

if (isMockEnabled()) {
  // eslint-disable-next-line no-console
  console.warn('[mock] REACT_APP_MOCK_API=true — 所有 /api 请求都在浏览器本地用假数据应答，不会连接任何真实后端或数据库。');
}

// 添加请求拦截器（调试用）
instance.interceptors.request.use(
  config => {
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  error => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// 添加响应拦截器（调试用）
instance.interceptors.response.use(
  response => {
    console.log('API Response:', response.config.url, response.status);
    return response;
  },
  error => {
    console.error('Response error:', error.config?.url, error.message);
    return Promise.reject(error);
  }
);

export default instance;