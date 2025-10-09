import axios from 'axios';

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
  
  // 开发环境
  return 'http://localhost:5000';
};

const instance = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

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