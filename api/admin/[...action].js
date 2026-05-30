import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const url = new URL(req.url);
    const path = url.pathname.replace('/api/admin/', '').replace('/api/admin', '');
    const action = path || '';
    const adminToken = req.headers['x-admin-token'];
    const ADMIN_PASSWORD = 'zjm1314520';
    const checkAdmin = () => { if (adminToken !== ADMIN_PASSWORD) { res.status(403).json({ error: '禁止访问' }); return false; } return true; };

    if (action === 'contact' && req.method === 'GET') {
        const data = await kv.get('config:contact') || {};
        return res.status(200).json(data);
    }

    if (action === '' || action === 'logs') {
        if (!checkAdmin()) return;
        const keys = await kv.keys('log:*');
        const records = [];
        for (const key of keys) { const raw = await kv.get(key); if (raw) { try { records.push(JSON.parse(raw)); } catch(e){} } }
        records.sort((a,b) => new Date(b.time) - new Date(a.time));
        return res.status(200).json({ records: records.slice(0, 50) });
    }

    if (action === 'merchants') {
        if (!checkAdmin()) return;
        if (req.method === 'GET' && req.query?.action === 'detail') {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: '缺少id' });
            const merchant = await kv.get(`merchant:${id}`);
            if (!merchant) return res.status(404).json({ error: '商家不存在' });
            const settings = await kv.get(`merchant:${id}:settings`) || {};
            return res.status(200).json({ id, name: merchant.name, password: merchant.password, balance: merchant.balance, status: merchant.status, settings });
        }
        if (req.method === 'GET' && req.query?.action === 'flow') {
            const { merchant } = req.query;
            if (!merchant) return res.status(400).json({ error: '缺少merchant' });
            const keys = await kv.keys(`flow:${merchant}:*`);
            const flows = [];
            for (const key of keys) { const raw = await kv.get(key); if(raw){ try{flows.push(JSON.parse(raw));}catch(e){} } }
            flows.sort((a,b)=>new Date(b.time)-new Date(a.time));
            return res.status(200).json({ flows });
        }
        if (req.method === 'GET' && req.query?.action === 'stats') {
            const { merchant, start, end } = req.query;
            if(!merchant||!start||!end) return res.status(400).json({ error: '参数不全' });
            const keys = await kv.keys('log:*');
            const daily = {}; let total = 0;
            const sd = new Date(start), ed = new Date(end); ed.setHours(23,59,59,999);
            for(const key of keys){ const raw=await kv.get(key); if(!raw) continue; try{const log=JSON.parse(raw); if(log.merchant===merchant){const d=new Date(log.time); if(d>=sd && d<=ed){total++; const ds=d.toISOString().slice(0,10); daily[ds]=(daily[ds]||0)+1;}}}catch(e){}}
            return res.status(200).json({ total, daily });
        }
        if (req.method === 'GET') {
            const keys = await kv.keys('merchant:*');
            const merchants = [];
            for(const key of keys){ const data=await kv.get(key); if(data) merchants.push({ id: key.replace('merchant:',''), name: data.name, balance: data.balance, status: data.status||'active' }); }
            return res.status(200).json({ merchants });
        }
        if (req.method === 'POST') {
            const { id, name, password, balance } = req.body;
            if(!id||!password) return res.status(400).json({ error: '缺少参数' });
            await kv.set(`merchant:${id}`, { name:name||'', password, balance: balance||100, status:'active' });
            return res.status(200).json({ success: true });
        }
        if (req.method === 'PUT') {
            const { id, amount, type, note, password, status } = req.body;
            if(!id) return res.status(400).json({ error: '缺少id' });
            const merchant = await kv.get(`merchant:${id}`);
            if(!merchant) return res.status(404).json({ error: '商家不存在' });
            if(password){ merchant.password=password; await kv.set(`merchant:${id}`, merchant); return res.status(200).json({ success:true }); }
            if(amount!==undefined && type){ let newBalance=merchant.balance||0; if(type==='add') newBalance+=Number(amount); else if(type==='subtract') newBalance-=Number(amount); else return res.status(400).json({ error:'无效类型' }); if(newBalance<0) return res.status(400).json({ error:'余额不能为负' }); merchant.balance=newBalance; await kv.set(`merchant:${id}`, merchant); await kv.set(`flow:${id}:${Date.now()}`, JSON.stringify({ type:type==='add'?'admin_add':'admin_subtract', amount:Number(amount), balanceAfter:newBalance, time:new Date().toISOString(), note:note||'' })); return res.status(200).json({ success:true }); }
            if(status){ merchant.status=status; await kv.set(`merchant:${id}`, merchant); return res.status(200).json({ success:true }); }
            return res.status(400).json({ error:'无效请求' });
        }
        if (req.method === 'DELETE') {
            const { id } = req.body;
            if(!id) return res.status(400).json({ error:'缺少id' });
            await kv.del(`merchant:${id}`);
            return res.status(200).json({ success:true });
        }
    }

    if (action === 'config') {
        if (!checkAdmin()) return;
        if (req.method === 'GET') { const rateConfig = await kv.get('config:rate_limit') || { defaultLimit:5, unlimitedIPs:[], customLimits:{} }; const banned = await kv.get('config:banned_ips') || []; return res.status(200).json({ rateConfig, banned }); }
        if (req.method === 'POST') { const { rateConfig, banned } = req.body; if(rateConfig) await kv.set('config:rate_limit', rateConfig); if(Array.isArray(banned)) await kv.set('config:banned_ips', banned); return res.status(200).json({ success:true }); }
    }

    if (action === 'contact' && req.method === 'POST') {
        if (!checkAdmin()) return;
        const { qrcode_url, phone, wechat, extra } = req.body;
        await kv.set('config:contact', { qrcode_url, phone, wechat, extra });
        return res.status(200).json({ success:true });
    }

    if (action === 'pricing') {
        if (!checkAdmin()) return;
        if (req.method === 'GET') { const pricing = await kv.get('config:pricing') || { items:[], note:'' }; return res.status(200).json(pricing); }
        if (req.method === 'POST') { const { items, note } = req.body; if(!Array.isArray(items)) return res.status(400).json({ error:'items 必须是数组' }); await kv.set('config:pricing', { items, note: note||'' }); return res.status(200).json({ success:true }); }
    }

    if (action === 'login-as-merchant') {
        if (!checkAdmin()) return;
        if (req.method !== 'POST') return res.status(405).json({ error:'只支持POST' });
        const { id } = req.body;
        if(!id) return res.status(400).json({ error:'缺少id' });
        const merchant = await kv.get(`merchant:${id}`);
        if(!merchant) return res.status(404).json({ error:'商家不存在' });
        const loginToken = Buffer.from(`${id}:${merchant.password}`).toString('base64');
        const url = `/merchant.html?auto_token=${encodeURIComponent(loginToken)}`;
        return res.status(200).json({ url });
    }

    res.status(404).json({ error: '接口不存在' });
}
