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
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: `
You are an expert Chinese language teacher.

The following text was written by a Korean learner of Chinese.

Please provide feedback in Korean.

Analyze the writing based on the following criteria:

1. Grammar errors
2. Vocabulary usage
3. Naturalness of expression
4. Discourse organization
5. Strengths of the writing
6. Suggested revision

Please use this output format:

## 문법
...

## 어휘
...

## 표현의 자연스러움
...

## 담화 구성
...

## 잘한 점
...

## 수정 예시
...

Student writing:
${writing}
        `
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "OpenAI API error",
        details: data
      });
    }

    const feedback =
      data.output_text ||
      "AI 피드백을 생성하지 못했습니다.";

    return res.status(200).json({ feedback });

  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
}
