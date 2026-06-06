export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests are allowed." });
  }

  const { writing } = req.body;

  if (!writing || writing.trim() === "") {
    return res.status(400).json({ error: "No writing text provided." });
  }

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert Chinese language teacher. Give feedback in Korean."
          },
          {
            role: "user",
            content:
`다음은 한국인 중국어 학습자의 중국어 작문입니다.

아래 기준으로 한국어로 피드백해 주세요.

1. 문법 오류
2. 어휘 사용
3. 표현의 자연스러움
4. 담화 구성
5. 잘한 점
6. 수정 예시

학생 작문:
${writing}`
          }
        ],
        temperature: 0.4
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      return res.status(openaiRes.status).json({
        error: "OpenAI API error",
        details: data
      });
    }

    const feedback =
      data.choices?.[0]?.message?.content ||
      "AI 피드백을 생성하지 못했습니다.";

    return res.status(200).json({ feedback });

  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
}
