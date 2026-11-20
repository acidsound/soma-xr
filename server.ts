import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const VALID_VOICES = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: number; message?: string } };
    if (parsed?.error?.message) {
      return `${parsed.error.code ?? ''} ${parsed.error.message}`.trim();
    }
  } catch {
    // not JSON
  }
  return raw;
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand)\b/i.test(
        msg,
      );
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 450 * attempt));
    }
  }
  throw lastErr;
}

function emotionToSpeechStyle(npcEmotion: string): string {
  switch (npcEmotion) {
    case 'blush':
    case 'shy':
      return 'Soft, shy, gently flustered yet affectionate conversational tone';
    case 'loving':
      return 'Warm, tender, heartfelt and deeply affectionate tone';
    case 'happy':
    case 'playful':
      return 'Bright, cheerful, playful and smiling voice';
    case 'concerned':
    case 'sad':
      return 'Gentle, empathetic, soothing and comforting tone';
    case 'surprised':
      return 'Lively, genuinely surprised and curious voice';
    default:
      return 'Warm, natural, relaxed conversational voice';
  }
}

interface RespondBody {
  message?: string;
  interactionType?: string;
  localEmotionHint?: {
    primary?: string;
    valence?: number;
    arousal?: number;
  };
  relationship?: {
    affection?: number;
    trust?: number;
    mood?: number;
    stage?: string;
    turnCount?: number;
  };
  persona?: {
    id?: string;
    name?: string;
    role?: string;
    personality?: string;
    speakingStyle?: string;
  };
  history?: Array<{ role: string; text: string }>;
}

const RESPOND_SCHEMA = {
  type: Type.OBJECT,
  required: [
    'userEmotion',
    'npcReply',
    'npcEmotion',
    'somaMotionStyle',
    'gazeMode',
    'affectionDelta',
    'trustDelta',
    'moodDelta',
    'innerThought',
    'suggestedChoices',
  ],
  properties: {
    userEmotion: {
      type: Type.OBJECT,
      required: ['primary', 'intensity', 'valence', 'arousal', 'labelKo', 'cues'],
      properties: {
        primary: {
          type: Type.STRING,
          description:
            'One of: joy, affection, curiosity, shy, sad, anxious, frustrated, playful, neutral',
        },
        intensity: {
          type: Type.NUMBER,
          description: 'Normalized emotion strength between 0.0 and 1.0',
        },
        valence: {
          type: Type.NUMBER,
          description: 'Emotional valence between -1.0 (negative) and 1.0 (positive)',
        },
        arousal: {
          type: Type.NUMBER,
          description: 'Emotional energy/arousal between 0.0 and 1.0',
        },
        labelKo: {
          type: Type.STRING,
          description: 'Short 1-2 word Korean emotion label, e.g. 설렘, 기쁨, 호기심, 수줍음, 위로 필요',
        },
        cues: {
          type: Type.STRING,
          description: 'Brief Korean explanation of detected emotional cues in user input',
        },
      },
    },
    npcReply: {
      type: Type.STRING,
      description: 'Natural in-character Korean response (1 to 3 concise sentences).',
    },
    npcEmotion: {
      type: Type.STRING,
      description:
        'One of: happy, blush, loving, shy, surprised, sad, concerned, playful, calm',
    },
    somaMotionStyle: {
      type: Type.STRING,
      description:
        'MotionBricks SOMA-30 target motion style: idle_gentle, wave_greet, lean_affection, shy_fidget, happy_bounce, nod_listen, comfort_reach, head_tilt_curious',
    },
    gazeMode: {
      type: Type.STRING,
      description: 'Eye & head gaze mode: lock_eyes, shy_avert, curious_tilt',
    },
    affectionDelta: {
      type: Type.NUMBER,
      description: 'Affection score delta integer between -5 and 8',
    },
    trustDelta: {
      type: Type.NUMBER,
      description: 'Trust score delta integer between -5 and 6',
    },
    moodDelta: {
      type: Type.NUMBER,
      description: 'Mood score delta integer between -10 and 12',
    },
    innerThought: {
      type: Type.STRING,
      description: 'Short 1-sentence Korean inner monologue reflecting NPC feelings.',
    },
    suggestedChoices: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 to 3 short natural Korean follow-up responses the user could say next.',
    },
    playgroundCommand: {
      type: Type.STRING,
      description:
        'Optional playground action if the user asked the avatar to interact with the playground. One of: none, sit_bench, vault_bench, sit_seesaw, vault_seesaw, ride_slide, ride_swing, vault_box_1, vault_box_2, vault_box_3, vault_boxes_all, kick_soccer, throw_basketball, play_sandbox, stand_up',
    },
  },
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  app.post('/api/npc/respond', async (req: Request, res: Response) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY가 설정되지 않았습니다. Settings > Secrets 패널에서 API 키를 설정해 주세요.',
      });
      return;
    }

    const body = (req.body || {}) as RespondBody;
    const message = String(body.message || '').trim();
    if (!message) {
      res.status(400).json({ error: '대화 메시지(message)가 비어 있습니다.' });
      return;
    }

    const persona = body.persona || {};
    const rel = body.relationship || {};
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

    const systemInstruction = [
      `당신은 XR 놀이터 연애 시뮬레이션 샌드박스의 3D VRM 동반자 "${persona.name || '서연'}" (${persona.role || '놀이터 산책 메이트'})입니다.`,
      `현재 공간은 미끄럼틀(slide), 그네(swing), 시소(seesaw), 벤치(bench), 1단·2단·3단 뜀틀(vault_box_1~3), 축구공(soccer_ball), 농구공(basketball), 모래놀이터(sandbox)가 있는 넓은 노을 공원 놀이터입니다.`,
      `성격: ${persona.personality || '따뜻하고 활발하며 사용자의 말과 감정에 진심으로 귀 기울이는 성격'}`,
      `말투: ${persona.speakingStyle || '부드럽고 다정한 해요체, 친밀도가 높아질수록 애정이 담긴 친근한 표현 사용'}`,
      `현재 관계 상태: 단계=${rel.stage || '낯선 만남'}, 호감도=${rel.affection ?? 32}/100, 신뢰도=${rel.trust ?? 28}/100, 기분=${rel.mood ?? 72}/100, 대화 턴=${rel.turnCount ?? 0}.`,
      `역할:
1. 사용자의 발화와 상호작용(${body.interactionType || 'chat'})에서 실시간 감정(userEmotion)을 정밀하게 분석하세요.
2. 분석된 사용자 감정과 현재 호감도/신뢰도에 어울리는 NPC의 감정(npcEmotion), MotionBricks SOMA 모션 스타일(somaMotionStyle), 시선 처리(gazeMode)를 선택하세요.
3. 사용자가 벤치 앉기/타넘기, 시소 타기/타넘기, 그네 타기, 1단·2단·3단 뜀틀 뛰어넘기, 미끄럼틀 타기, 축구공 발로 차기, 농구공 손으로 주워 던지기, 샌드박스 모래놀이를 요청하거나 제안하면 적절한 playgroundCommand를 설정하고 그 행동에 어울리는 생생한 반응을 보여주세요.
4. 답변(npcReply)은 음성(TTS)으로 바로 낭독되므로 1~3문장의 자연스러운 한국어 구어체로 작성하세요. 이모지나 괄호 지문은 넣지 마세요.`,
    ].join('\n');

    const conversationContext = history
      .map((item) => `${item.role === 'user' ? '사용자' : persona.name || 'NPC'}: ${item.text}`)
      .join('\n');

    const promptText = [
      conversationContext ? `[최근 대화]\n${conversationContext}` : '',
      `[실시간 로컬 감정 힌트] ${JSON.stringify(body.localEmotionHint || {})}`,
      `[상호작용 유형] ${body.interactionType || 'text_chat'}`,
      `[이번 사용자 입력] ${message}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: promptText,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: RESPOND_SCHEMA,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
      );

      const rawText = (response.text || '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Gemini 모델이 빈 응답을 반환했습니다.' });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (err) {
      const msg = formatGeminiError(err);
      console.error('[/api/npc/respond] error:', msg);
      res.status(502).json({ error: `LLM 응답 생성 실패: ${msg}` });
    }
  });

  app.post('/api/speech/transcribe', async (req: Request, res: Response) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY가 설정되지 않았습니다. Settings > Secrets 패널에서 API 키를 설정해 주세요.',
      });
      return;
    }

    const { audioBase64, mimeType } = (req.body || {}) as {
      audioBase64?: string;
      mimeType?: string;
    };
    if (!audioBase64 || !mimeType) {
      res.status(400).json({ error: '오디오 데이터(audioBase64, mimeType)가 필요합니다.' });
      return;
    }

    try {
      const cleanBase64 = audioBase64.includes(',')
        ? audioBase64.split(',')[1]
        : audioBase64;
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: 'Transcribe the spoken audio faithfully in its original language (primarily Korean). Return only the transcribed text.',
            },
          ],
        },
      });
      res.json({ text: (response.text || '').trim() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[/api/speech/transcribe] error:', msg);
      res.status(502).json({ error: `음성 인식(STT) 실패: ${msg}` });
    }
  });

  app.post('/api/speech/tts', async (req: Request, res: Response) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY가 설정되지 않았습니다. Settings > Secrets 패널에서 API 키를 설정해 주세요.',
      });
      return;
    }

    const { text, npcEmotion, voiceName } = (req.body || {}) as {
      text?: string;
      npcEmotion?: string;
      voiceName?: string;
    };
    const cleanText = String(text || '').trim();
    if (!cleanText) {
      res.status(400).json({ error: 'TTS로 변환할 텍스트가 비어 있습니다.' });
      return;
    }

    const selectedVoice =
      voiceName && VALID_VOICES.has(voiceName) ? voiceName : 'Kore';
    const style = emotionToSpeechStyle(npcEmotion || 'calm');

    try {
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: cleanText,
                  speechMetadata: {
                    style,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },
          },
        }),
      );

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'Gemini TTS가 오디오 데이터를 반환하지 않았습니다.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (err) {
      const msg = formatGeminiError(err);
      console.error('[/api/speech/tts] error:', msg);
      res.status(502).json({ error: `음성 합성(TTS) 실패: ${msg}` });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SOMA·Heart XR server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
