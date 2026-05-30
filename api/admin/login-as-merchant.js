import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });
    const token = req.headers['x-admin-token'];
    if (token !== 'zjm1314520') return res.status(403).json({ error: '禁止访问' });

    const { id } = req.body;
    if (!id) return res.status(400).json({ error: '缺少id' });

    const merchant = await kv.get(`merchant:${id}`);
    if (!merchant) return res.status(404).json({ error: '商家不存在' });

    // 生成临时登录 token，有效期5分钟（可由前端 localStorage 存储）
    const loginToken = Buffer.from(`${id}:${merchant.password}`).toString('base64');
    const url = `/merchant.html?auto_token=${encodeURIComponent(loginToken)}`;
    res.status(200).json({ url });
}
