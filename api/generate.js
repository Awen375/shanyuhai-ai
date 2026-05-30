import { kv } from '@vercel/kv';

// ===== 民宿信息 =====
const hotelFacts = `
关于霞浦县山予海民宿的真实背景（请在写作中自然融入）：
- 民宿位于霞浦东线中间，闹中取静，所有房间都是180度海景。
- 顶楼露台和一楼吧台拍照打卡绝了，傍晚可以安静地吹晚风看落日。
- 距离三沙镇吃饭性价比最高的街约1公里（开车3分钟），东壁村1公里（3分钟），最近沙滩6分钟，花竹日出点15分钟，小皓赶海沙滩15分钟，霞浦县城30分钟，高罗/大京1小时，下尾岛1.5小时。
- 老板年轻热情，提供旅游攻略、赶海工具、查潮汐，没开车可帮忙安排包车师傅（价格划算），门口有共享电动车。
- 早餐亲手做，非常好吃。
`;

const styleGuides = {
    "情绪共鸣型": "你是感情细腻的旅行者。用第一人称写小红书好评，抒发内心感动、放松与共鸣，带emoji和#霞浦民宿 #山予海民宿 标签。",
    "宝藏发现型": "你是乐于分享隐藏好物的博主。用惊喜口吻突出民宿独特、性价比，像发现秘密基地。带emoji和#霞浦宝藏民宿 #山予海民宿 标签。",
    "氛围描绘型": "你是擅长描写环境的作家。着重刻画房间风格、窗外海景、光影、气味、音乐等氛围细节，身临其境。带emoji和#霞浦美学民宿 #山予海民宿 标签。",
    "干货整理型": "你是信息整理达人。用分点或小标题介绍房型、设施、餐饮、交通、周边景点等实用信息。带emoji和#霞浦民宿攻略 #山予海民宿 标签。",
    "攻略型": "你是旅游攻略专家。以山予海为住宿推荐，结合周边景点给出2-3天完整游玩攻略。带emoji和#霞浦旅游攻略 #山予海民宿 标签。"
};

async function generateContent(style, prompt, res) {
    const system = hotelFacts + '\n\n' + (styleGuides[style] || '');
    const user = prompt ? `请按上面要求写好评，并注意补充：${prompt}` : '请直接生成好评文案';
    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',  // 想省钱可改为 'deepseek-lite'
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user }
                ],
                temperature: 0.9
            })
        });
        const data = await response.json();
        res.status(200).json({ result: data.choices[0].message.content });
    } catch(err) {
        res.status(500).json({ error: 'AI生成失败，请稍后重试' });
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });

    const { prompt, style, merchant: merchantId } = req.body;
    if (!style) return res.status(400).json({ error: '请选择写作风格' });

    // 商家扣费模式
    if (merchantId) {
        const merchant = await kv.get(`merchant:${merchantId}`);
        if (!merchant) return res.status(400).json({ error: '无效商家' });
        if (merchant.balance < 2) return res.status(402).json({ error: '商家算力不足，生成失败。' });
        merchant.balance -= 2;
        await kv.set(`merchant:${merchantId}`, merchant);

        // 写日志
        const log = {
            time: new Date().toISOString(),
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
            merchant: merchantId,
            style,
            prompt: prompt || ''
        };
        const key = `log:${Date.now()}:${Math.random().toString(36).substring(2,8)}`;
        await kv.set(key, JSON.stringify(log));
        await kv.expire(key, 60*60*24*30);

        return generateContent(style, prompt, res);
    }

    // 非商家模式（保留以前IP限流逻辑，若无merchant可禁止）
    return res.status(400).json({ error: '请通过民宿官方二维码访问' });
}
