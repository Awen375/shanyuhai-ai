import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只支持POST请求' });
    }

    const { prompt, style } = req.body;
    if (!style) {
        return res.status(400).json({ error: '请选择写作风格' });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '未知';

    // ---- 1. 先记录日志（无论是否被限流） ----
    const logEntry = {
        time: new Date().toISOString(),
        ip,
        style,
        prompt: prompt || '(无补充)',
        userAgent: req.headers['user-agent']?.substring(0, 100) || ''
    };
    try {
        const logKey = `log:${Date.now()}:${Math.random().toString(36).substring(2, 8)}`;
        await kv.set(logKey, JSON.stringify(logEntry));
        await kv.expire(logKey, 60 * 60 * 24 * 30);
        console.log('✅ 日志已写入:', logKey);
    } catch (e) {
        console.error('❌ 日志写入失败:', e);
    }

    // ---- 2. 检查是否被禁用 ----
    try {
        const banned = await kv.get('config:banned_ips');
        if (banned && Array.isArray(banned) && banned.includes(ip)) {
            return res.status(403).json({ error: '您的账号已被限制使用，如有疑问请联系民宿管家。' });
        }
    } catch (kvError) {
        console.error('检查禁用状态失败:', kvError);
    }

    // ---- 3. 检查每日配额 ----
    try {
        const config = await kv.get('config:rate_limit');
        const defaultLimit = config?.defaultLimit || 5;
        const unlimitedIPs = config?.unlimitedIPs || [];
        const customLimits = config?.customLimits || {};

        if (!unlimitedIPs.includes(ip)) {
            const limit = customLimits[ip] || defaultLimit;
            const today = new Date().toISOString().slice(0, 10);
            const dailyKey = `daily:${today}:${ip}`;
            let used = await kv.get(dailyKey);
            if (used === null || used === undefined) used = 0;
            if (used >= limit) {
                return res.status(429).json({ error: `今日生成次数已达上限（${limit}次），请明天再来。` });
            }
            await kv.incr(dailyKey);
            const now = new Date();
            const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            const ttlSeconds = Math.floor((tomorrow.getTime() - now.getTime()) / 1000) + 60;
            await kv.expire(dailyKey, ttlSeconds);
        }
    } catch (kvError) {
        console.error('检查配额失败:', kvError);
    }

    // ---- 4. 民宿信息与风格 ----
    const hotelFacts = `
    关于霞浦县山予海民宿的真实背景（请在写作中自然融入，不要生硬罗列，像自己亲身经历一样带出来）：

    位置与交通：
    - 民宿位于霞浦东线中间位置，闹中取静，地理位置绝佳，去哪都方便。
    - 距离三沙镇吃饭性价比最高的一条街约1公里，开车3分钟左右。
    - 距离东壁村约1公里，开车3分钟左右。
    - 距离最近的沙滩开车6分钟左右。
    - 距离花竹一号日出打卡点开车约15分钟。
    - 距离小皓赶海沙滩约15分钟车程。
    - 距离霞浦县城约30分钟车程。
    - 距离高罗沙滩、大京约1小时车程。
    - 距离下尾岛约1个半小时车程。

    房间与景观：
    - 所有房间都是180度海景，真正的无敌海景，躺在床上就能看海。
    - 顶楼露台和一楼吧台拍照打卡绝了，非常出片，傍晚可以安静地吹晚风看落日。

    服务与老板：
    - 民宿老板是一对年轻夫妇，非常热情，入住会主动提供霞浦旅游攻略。
    - 提供赶海工具，还会帮忙查看当天的赶海时间。
    - 如果没有开车过来，老板会帮忙安排包车师傅，价格很划算。
    - 民宿大门口就有一整排共享电动车可以租借，出行非常方便。
    - 早餐是老板亲手准备的，很好吃，很多客人专门夸。

    请在写作中根据所选风格，自然地挑几个点展开，让读者觉得你是真实住过的客人，不是复制粘贴的广告。
    `;

    const styleGuides = {
        "情绪共鸣型": "你是一位感情细腻的旅行者。请围绕「霞浦县山予海民宿」写一篇小红书好评，用第一人称真实体验感，重点抒发内心的感动、放松与情感共鸣，让读者产生强烈的情感认同。带emoji和#霞浦民宿 #山予海民宿 等话题标签。",
        "宝藏发现型": "你是一位乐于分享隐藏好物的博主。请围绕「霞浦县山予海民宿」写一篇小红书好评，用“挖到宝了”的惊喜口吻，突出这家民宿的独特之处、性价比或意外惊喜，像在分享一个秘密基地。带emoji和#霞浦宝藏民宿 #山予海民宿 等标签。",
        "氛围描绘型": "你是一位擅长描写环境的作家。请围绕「霞浦县山予海民宿」写一篇小红书好评，着重刻画民宿的房间风格、窗外景色、光影、气味、音乐等氛围感细节，让读者仿佛置身其中。带emoji和#霞浦美学民宿 #山予海民宿 等标签。",
        "干货整理型": "你是一位逻辑清晰的信息整理达人。请围绕「霞浦县山予海民宿」写一篇小红书好评，用分点或小标题形式，介绍民宿的房型、设施、餐饮、周边景点、交通等实用信息，简洁明了，方便他人参考。带emoji和#霞浦民宿攻略 #山予海民宿 等标签。",
        "攻略型": "你是一位旅游攻略专家。请围绕「霞浦县山予海民宿」写一篇小红书好评，将其作为霞浦旅游的住宿推荐，并结合周边景点（如日出观景点、滩涂摄影点、赶海沙滩等）给出2-3天的完整游玩攻略。带emoji和#霞浦旅游攻略 #山予海民宿 等标签。"
    };

    const systemContent = hotelFacts + '\n\n' + (styleGuides[style] || "请为「霞浦县山予海民宿」写一篇热情的小红书好评，带emoji和话题标签。");
    const userContent = prompt ? `请按上面要求写好评，并注意补充以下要点：${prompt}` : "请直接生成好评文案";

    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemContent },
                    { role: 'user', content: userContent }
                ],
                temperature: 0.9
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('DeepSeek API error:', response.status, errorText);
            return res.status(502).json({
                error: `AI服务暂时不可用（${response.status}），请稍后重试或联系管理员。`
            });
        }

        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            const rawText = await response.text();
            console.error('JSON parse error, raw response:', rawText.substring(0, 200));
            return res.status(502).json({
                error: 'AI返回了异常数据，请稍后重试。'
            });
        }

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            return res.status(502).json({ error: 'AI返回数据格式异常，请稍后重试。' });
        }

        res.status(200).json({ result: data.choices[0].message.content });
    } catch (err) {
        console.error('Generate error:', err);
        res.status(500).json({ error: '网络请求失败，请检查网络或稍后重试。' });
    }
}
