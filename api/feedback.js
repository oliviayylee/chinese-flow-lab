export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests are allowed." });
  }

  try {
    const { writing } = req.body;

    if (!writing || writing.trim() === "") {
      return res.status(400).json({ error: "No writing text provided." });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: `
You are a Chinese language writing tutor.
Please give feedback on the following Chinese writing by a Korean learner.

Give feedback in Korean.
Focus on:
1. Grammar
2. Vocabulary
3. Natural expression
4. Discourse organization
5. Suggested revision

Student writing:
${writing}
        `
      })
    });

    const data = await response.json();

    const feedback =
      data.output?.[0]?.content?.[0]?.text ||
      "AI 피드백을 생성하지 못했습니다.";

    return res.status(200).json({ feedback });

  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
}
