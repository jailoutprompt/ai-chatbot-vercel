export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiKey, threadId, assistantId } = req.body;

    if (!apiKey || !threadId || !assistantId) {
      return res.status(400).json({ error: 'API key, thread ID, and assistant ID are required' });
    }

    // Run 생성
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        assistant_id: assistantId
      })
    });

    if (!runResponse.ok) {
      throw new Error('Failed to run assistant');
    }

    const run = await runResponse.json();
    
    // Run 완료 대기 (최대 25초)
    let runStatus = run;
    let attempts = 0;
    const maxAttempts = 25;
    
    while ((runStatus.status === 'in_progress' || runStatus.status === 'queued') && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      
      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${run.id}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      
      if (statusResponse.ok) {
        runStatus = await statusResponse.json();
      }
    }

    if (runStatus.status === 'completed') {
      // 메시지 가져오기
      const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        }
      });

      if (messagesResponse.ok) {
        const messages = await messagesResponse.json();
        const lastMessage = messages.data[0];
        
        res.json({
          success: true,
          response: lastMessage.content[0].text.value
        });
      } else {
        throw new Error('Failed to fetch messages');
      }
    } else {
      throw new Error(`Assistant run failed with status: ${runStatus.status}`);
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
