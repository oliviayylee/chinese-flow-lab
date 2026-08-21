/**
 * Chinese Flow Lab
 * /api/generate-reading.js
 *
 * Vercel Serverless Function
 * - OPENAI_API_KEY는 Vercel Environment Variables에서만 읽습니다.
 * - 브라우저에는 API key가 노출되지 않습니다.
 * - 클라이언트가 임의의 prompt를 보내지 못하도록 profile 값만 받아
 *   서버에서 교육용 prompt를 구성합니다.
 */

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-luna";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: "POST 요청만 허용됩니다."
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "서버에 OPENAI_API_KEY가 설정되어 있지 않습니다."
    });
  }

  if (!isSameOriginRequest(req)) {
    return res.status(403).json({
      ok: false,
      error: "허용되지 않은 요청 출처입니다."
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const profile = normalizeProfile(body.profile);

    if (!profile.domain || !profile.feature) {
      return res.status(400).json({
        ok: false,
        error: "학습자 프로파일 정보가 부족합니다."
      });
    }

    const model =
      cleanText(process.env.OPENAI_MODEL, 80)
      || DEFAULT_MODEL;

    const input = buildLearningRequest(profile);

    const openaiResponse = await fetch(
      OPENAI_RESPONSES_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model,
          store: false,
          max_output_tokens: 2600,
          instructions: [
            "You are an expert Chinese-language reading tutor for Korean learners.",
            "Generate pedagogically natural Chinese at approximately HSK 4 level.",
            "The requested target feature should appear naturally, not mechanically in every sentence.",
            "Explanations and feedback must be written in Korean.",
            "Comprehension questions and answer choices must be written in Korean.",
            "Do not mention hidden reasoning, chain-of-thought, model internals, or SHAP mathematics.",
            "Do not infer or include personal identity information.",
            "Return only the JSON object required by the response schema."
          ].join("\n"),
          input,
          text: {
            format: {
              type: "json_schema",
              name: "personalized_chinese_reading_support",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: {
                    type: "string"
                  },
                  target_focus: {
                    type: "string"
                  },
                  passage: {
                    type: "string"
                  },
                  explanation: {
                    type: "string"
                  },
                  vocabulary_notes: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        term: {
                          type: "string"
                        },
                        meaning: {
                          type: "string"
                        },
                        note: {
                          type: "string"
                        }
                      },
                      required: [
                        "term",
                        "meaning",
                        "note"
                      ]
                    }
                  },
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        question: {
                          type: "string"
                        },
                        options: {
                          type: "array",
                          items: {
                            type: "string"
                          }
                        },
                        answer_index: {
                          type: "integer"
                        },
                        explanation: {
                          type: "string"
                        }
                      },
                      required: [
                        "question",
                        "options",
                        "answer_index",
                        "explanation"
                      ]
                    }
                  },
                  personalized_feedback: {
                    type: "string"
                  }
                },
                required: [
                  "title",
                  "target_focus",
                  "passage",
                  "explanation",
                  "vocabulary_notes",
                  "questions",
                  "personalized_feedback"
                ]
              }
            }
          }
        })
      }
    );

    const responseData = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error(
        "OpenAI API error:",
        openaiResponse.status,
        responseData?.error?.code || "",
        responseData?.error?.message || ""
      );

      return res.status(openaiResponse.status).json({
        ok: false,
        error: friendlyOpenAIError(
          openaiResponse.status,
          responseData
        )
      });
    }

    const outputText = extractOutputText(responseData);

    if (!outputText) {
      console.error(
        "OpenAI response did not contain output_text:",
        JSON.stringify(responseData).slice(0, 1500)
      );

      return res.status(502).json({
        ok: false,
        error: "AI 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요."
      });
    }

    let result;

    try {
      result = JSON.parse(outputText);
    } catch (error) {
      console.error(
        "Structured output parse error:",
        error,
        outputText.slice(0, 1500)
      );

      return res.status(502).json({
        ok: false,
        error: "AI가 생성한 자료의 형식을 확인하지 못했습니다. 다시 생성해 주세요."
      });
    }

    return res.status(200).json({
      ok: true,
      model: responseData.model || model,
      result,
      usage: responseData.usage || null
    });
  } catch (error) {
    console.error("generate-reading error:", error);

    return res.status(500).json({
      ok: false,
      error: "맞춤형 읽기자료 생성 중 오류가 발생했습니다."
    });
  }
}

function normalizeProfile(source) {
  const profile =
    source && typeof source === "object"
      ? source
      : {};

  return {
    level:
      cleanText(profile.level, 30)
      || "HSK 4급",

    domain:
      cleanText(profile.domain, 40),

    feature:
      cleanText(profile.feature, 60),

    readingRatio:
      boundedNumber(
        profile.readingRatio,
        0.2,
        5,
        1
      ),

    accuracy:
      boundedNumber(
        profile.accuracy,
        0,
        1,
        0
      ),

    supportType:
      cleanText(profile.supportType, 120),

    processingPattern:
      cleanText(profile.processingPattern, 220),

    xaiSummary:
      cleanText(profile.xaiSummary, 300)
  };
}

function buildLearningRequest(profile) {
  const accuracyPercent =
    Math.round(profile.accuracy * 100);

  const xaiLine =
    profile.xaiSummary
      ? `- 설명가능한 진단 참고: ${profile.xaiSummary}`
      : "- 설명가능한 진단 참고: 별도 SHAP 요약값이 전달되지 않은 경우 인지 프로파일을 우선 반영";

  return `다음 학습자 프로파일을 바탕으로 개인맞춤형 중국어 읽기 지원 자료를 생성하라.

[학습자 프로파일]
- 학습 수준: ${profile.level}
- 상대적 취약영역: ${profile.domain}
- 주요 세부 특성: ${profile.feature}
- 개인 기준선 대비 읽기시간: ${profile.readingRatio.toFixed(2)}배
- 의미판단 정확도: ${accuracyPercent}%
- 수행 패턴: ${profile.processingPattern || "영역별 수행 특성에 맞춘 지원 필요"}
- 지원 목표: ${profile.supportType || "정확성과 처리 효율을 함께 향상"}
${xaiLine}

[생성 원칙]
1. 중국어 지문은 대략 HSK 4급 수준으로 5~7문장 정도 작성한다.
2. ${profile.feature} 특성을 자연스럽게 1~3회 포함하여 연습 기회를 제공한다.
3. 지문의 내용은 일상생활·학교·여행·문화 등 일반적인 주제로 구성한다.
4. 지나치게 희귀한 어휘나 전문지식은 피한다.
5. explanation은 ${profile.feature}을 중심으로 한국어로 간결하게 설명한다.
6. vocabulary_notes에는 핵심 어휘·연어를 3~5개 제시한다.
7. questions는 정확히 3개 작성하고, 각 문항의 options는 정확히 4개로 한다.
8. 정답 위치는 문항마다 가능하면 다르게 배치한다.
9. 오답 선택지는 터무니없게 만들지 말고, 행위자·대상·시간·순서·의미관계 등을 혼동하도록 자연스럽게 설계한다.
10. personalized_feedback은 읽기시간과 정확도의 관계를 반영하되, 학습자의 고정된 능력이나 원인을 단정하지 않는다.
11. SHAP 또는 진단 정보가 있더라도 인과관계로 표현하지 말고 '영향 요인', '수행 특성', '연습 필요' 수준으로 표현한다.`;
}

function extractOutputText(data) {
  if (!data || !Array.isArray(data.output)) {
    return "";
  }

  for (const item of data.output) {
    if (!item || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (
        content
        && content.type === "output_text"
        && typeof content.text === "string"
      ) {
        return content.text;
      }
    }
  }

  return "";
}

function friendlyOpenAIError(status, data) {
  const code =
    data?.error?.code
    || data?.error?.type
    || "";

  if (status === 401) {
    return "OpenAI API 인증에 실패했습니다. Vercel의 OPENAI_API_KEY를 확인해 주세요.";
  }

  if (status === 429) {
    return "OpenAI API 사용 한도 또는 요청 한도에 도달했습니다. Billing/Usage를 확인해 주세요.";
  }

  if (status === 400 && code) {
    return `OpenAI API 요청 형식을 확인해 주세요. (${code})`;
  }

  return "OpenAI API 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

function cleanText(value, maxLength) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function boundedNumber(
  value,
  min,
  max,
  fallback
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(min, number)
  );
}

function isSameOriginRequest(req) {
  const origin = req.headers?.origin;
  const host =
    req.headers?.["x-forwarded-host"]
    || req.headers?.host;

  if (!origin || !host) {
    return true;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

