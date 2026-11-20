import * as xb from 'xrblocks';
import type {
  PlaygroundCommandType,
  RelationshipState,
  SomaMotionStyle,
  UserEmotionAnalysis,
} from '../types';
import { SOMA_STYLE_LABELS } from '../constants';

export interface SpatialUIActions {
  onPlaygroundAction: (cmd: PlaygroundCommandType) => void;
  onVoiceToggle: () => void;
}

/**
 * World-space XR Blocks Spatial UI Card anchored inside the playground
 * for immersive WebXR / Simulator headset interaction.
 */
export class SpatialSanctuaryUI extends xb.Script {
  public readonly card: xb.UICard;
  private titleText: xb.UIText;
  private statsText: xb.UIText;
  private emotionText: xb.UIText;
  private replyText: xb.UIText;
  private validated = false;

  constructor(actions: SpatialUIActions) {
    super();

    this.titleText = new xb.UIText({
      text: '서연 · 낯선 만남',
      style: { fontSize: 26, fontWeight: 'bold', color: '#ffffff' },
    });

    this.statsText = new xb.UIText({
      text: '호감 32%  ·  신뢰 28%  ·  기분 72%',
      style: { fontSize: 16, color: '#f9a8d4' },
    });

    this.emotionText = new xb.UIText({
      text: '감지 감정: 평온  |  SOMA: soma:idle',
      style: { fontSize: 15, color: '#c4b5fd' },
    });

    this.replyText = new xb.UIText({
      text: '바닥이나 놀이터 기구를 클릭하거나 말로 지시해 줘!',
      style: {
        width: '100%',
        padding: 14,
        backgroundColor: 'rgba(18, 15, 29, 0.78)',
        borderRadius: 14,
        fontSize: 17,
        lineHeight: 1.4,
        whiteSpace: 'pre-line',
        color: '#f8fafc',
      },
    });

    const createActionButton = (
      text: string,
      icon: string,
      onClick: () => void,
    ): xb.UIButton =>
      new xb.UIButton({
        ariaLabel: text,
        style: {
          flexGrow: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingLeft: 12,
          paddingRight: 12,
          height: 46,
        },
        onClick,
        children: [
          new xb.UIIcon({
            icon,
            pointerEvents: 'none',
            style: { width: 20, height: 20, color: '#f9a8d4' },
          }),
          new xb.UIText({
            text,
            pointerEvents: 'none',
            style: { fontSize: 15, fontWeight: 'bold', color: '#ffffff' },
          }),
        ],
      });

    const row1 = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 10 },
      children: [
        createActionButton('벤치 앉기', 'weekend', () =>
          actions.onPlaygroundAction('sit_bench'),
        ),
        createActionButton('벤치 타넘기', 'directions_run', () =>
          actions.onPlaygroundAction('vault_bench'),
        ),
      ],
    });

    const row2 = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 10 },
      children: [
        createActionButton('축구공 차기', 'sports_soccer', () =>
          actions.onPlaygroundAction('kick_soccer'),
        ),
        createActionButton('음성 대화', 'mic', () => actions.onVoiceToggle()),
      ],
    });

    this.card = new xb.UICard({
      size: { width: 0.62, height: 'auto' },
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 12,
        padding: 18,
      },
      children: [
        this.titleText,
        this.statsText,
        this.emotionText,
        this.replyText,
        row1,
        row2,
      ],
    });

    this.card.name = 'PlaygroundSpatialCard';
    this.card.position.set(1.25, 1.55, 0.25);
    this.card.rotation.y = -0.38;
    this.card.visible = false;
    this.add(this.card);
  }

  public setVisible(visible: boolean): void {
    this.card.visible = visible;
    if (visible && !this.validated) {
      this.validated = true;
      setTimeout(() => {
        if (this.card.visible) {
          const report = xb.ui.validate(this.card);
          if (report.ready && !report.ok) {
            console.warn('[SpatialSanctuaryUI] layout issues:', report.issues);
          }
        }
      }, 250);
    }
  }

  public syncState(params: {
    personaName: string;
    relationship: RelationshipState;
    userEmotion: UserEmotionAnalysis;
    somaStyle: SomaMotionStyle;
    somaClip: string;
    reply: string;
  }): void {
    this.titleText.text = `${params.personaName} · ${params.relationship.stage}`;
    this.statsText.text = `호감 ${params.relationship.affection}%  ·  신뢰 ${params.relationship.trust}%  ·  기분 ${params.relationship.mood}%`;
    this.emotionText.text = `감정: ${params.userEmotion.labelKo}  |  SOMA: ${params.somaClip || SOMA_STYLE_LABELS[params.somaStyle]}`;
    this.replyText.text = params.reply;
  }
}
