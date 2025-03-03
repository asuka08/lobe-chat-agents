import { ChatOpenAI } from 'langchain/chat_models/openai';

import { config } from './const';

export const model = new ChatOpenAI(
  // { modelName: config.modelName, temperature: config.temperature, maxRetries: 4 },
  { 
    modelName: config.modelName, 
    temperature: config.temperature, 
    maxRetries: 4, 
    timeout: 120000, // 设置 120 秒超时
    retryDelay: (attempt) => Math.pow(2, attempt) * 1000, // 指数退避 (2^attempt 秒)
  },
  { baseURL: process.env.OPENAI_PROXY_URL },
);
