import http from 'http';
import { parse } from 'url';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://:Cjw1314520%40@127.0.0.1:6379');

import adminHandler from './api/admin/[...action].js';
import merchantHandler from './api/merchant/[...action].js';
import generateHandler from './api/generate.js';

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { req.body = body ? JSON.parse(body) : {}; } catch (e) { req.body = {}; }
      resolve();
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // 兼容层：让原生 res 支持 .status().json()
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    await parseBody(req);
  }

  // 移除 Nginx 代理添加的 /wenan 前缀（如果有）
  req.url = req.url.replace(/^\/wenan/, '');
  const url = parse(req.url, true);
  req.query = url.query;
  const pathname = url.pathname;

  try {
    if (pathname.startsWith('/api/admin')) {
      return await adminHandler(req, res);
    } else if (pathname.startsWith('/api/merchant')) {
      return await merchantHandler(req, res);
    } else if (pathname.startsWith('/api/generate')) {
      return await generateHandler(req, res);
    } else if (pathname === '/' || pathname === '') {
      res.writeHead(302, { Location: '/index.html' });
      return res.end();
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (err) {
    console.error('API Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

const PORT = process.env.WENAN_PORT || 3001;
server.listen(PORT, () => {
  console.log(`AI文案助手服务运行在端口 ${PORT}`);
});
