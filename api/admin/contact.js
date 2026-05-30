import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // GET 无需密码，因为商家页面也要调用
    if (req.method === 'GET') {
        const data = await kv.get('config:contact') || {};
        return res.status(200).json(data);
    }

    // POST 需要超级密码
    if (req.method === 'POST') {
        const token = req.headers['x-admin-token'];
        if (token !== 'zjm1314520') return res.status(403).json({ error: '禁止访问' });

        const { qrcode_url, phone, wechat, extra } = req.body;
        await kv.set('config:contact', { qrcode_url, phone, wechat, extra });
        return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: '方法不允许' });
}
