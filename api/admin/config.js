import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const token = req.headers['x-admin-token'];
    const ADMIN_PASSWORD = 'zjm1314520';
    if (token !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: '禁止访问' });
    }

    if (req.method === 'GET') {
        const rateConfig = await kv.get('config:rate_limit') || { defaultLimit: 5, unlimitedIPs: [], customLimits: {} };
        const banned = await kv.get('config:banned_ips') || [];
        res.status(200).json({ rateConfig, banned });
    } 
    else if (req.method === 'POST') {
        const { rateConfig, banned } = req.body;
        if (rateConfig) {
            await kv.set('config:rate_limit', rateConfig);
        }
        if (Array.isArray(banned)) {
            await kv.set('config:banned_ips', banned);
        }
        res.status(200).json({ success: true });
    } 
    else {
        res.status(405).json({ error: '方法不允许' });
    }
}
