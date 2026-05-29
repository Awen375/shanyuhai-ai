export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只支持POST请求' });
    }

    const { prompt, style } = req.body;
    if (!style) {
        return res.status(400).json({ error: '请选择写作风格' });
    }

    // 根据风格构建不同的系统指令
    const styleGuides = {
        "情绪共鸣型": "你是一位感情细腻的旅行者。请围绕「霞浦县山予海民宿」写一篇小红书好评，用第一人称真实体验感，重点抒发内心的感动、放松与情感共鸣，让读者产生强烈的情感认同。带emoji和#霞浦民宿 #山予海民宿 等话题标签。",
        "宝藏发现型": "你是一位乐于分享隐藏好物的博主。请围绕「霞浦县山予海民宿」写一篇小红书好评，用“挖到宝了”的惊喜口吻，突出这家民宿的独特之处、性价比或意外惊喜，像在分享一个秘密基地。带emoji和#霞浦宝藏民宿 #山予海民宿 等标签。",
        "氛围描绘型": "你是一位擅长描写环境的作家。请围绕「霞浦县山予海民宿」写一篇小红书好评，着重刻画民宿的房间风格、窗外景色、光影、气味、音乐等氛围感细节，让读者仿佛置身其中。带emoji和#霞浦美学民宿 #山予海民宿 等标签。",
        "干货整理型": "你是一位逻辑清晰的信息整理达人。请围绕「霞浦县山予海民宿」写一篇小红书好评，用分点或小标题形式，介绍民宿的房型、设施、餐饮、周边景点、交通等实用信息，简洁明了，方便他人参考。带emoji和#霞浦民宿攻略 #山予海民宿 等标签。",
        "攻略型": "你是一位旅游攻略专家。请围绕「霞浦县山予海民宿」写一篇小红书好评，将其作为霞浦旅游的住宿推荐，并结合周边景点（如日出观景点、滩涂摄影点等）给出2-3天的完整游玩攻略。带emoji和#霞浦旅游攻略 #山予海民宿 等标签。"
    };

    const systemContent = styleGuides[style] || "请为「霞浦县山予海民宿」写一篇热情的小红书好评，带emoji和话题标签。";

    // 把用户补充的要点追加到用户消息中
    const userContent = prompt 
        ? `请按上面要求写好评，并注意补充以下要点：${prompt}`
        : "请直接生成好评文案";

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

        const data = await response.json();
        res.status(200).json({ result: data.choices[0].message.content });
    } catch (err) {
        res.status(500).json({ error: 'AI生成失败，请稍后重试' });
    }
}
